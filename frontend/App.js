import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
  Platform,
  TextInput,
  Modal,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as DocumentPicker from "expo-document-picker";
import { StatusBar } from "expo-status-bar";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import ExcelJS from 'exceljs/dist/exceljs.min.js';

// API Configuration
// Pointing back to your laptop via local IP for dev, or env variable for production || "http://192.168.0.6:3000"   || "https://bank-journal-backend.onrender.com"
const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://bank-journal-backend.onrender.com" || "http://192.168.0.7:3000";
const Stack = createNativeStackNavigator();

import { SavingsTransactionsScreen, SavingsReportScreen } from "./modules/savings/SavingsApp";

// Helper to isolate HTML printing on Web (prevents printing the entire React Native App page)
const printHTMLOnWeb = (htmlContent) => {
  if (Platform.OS !== "web") return;
  try {
    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.width = "0px";
    iframe.style.height = "0px";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document || iframe.contentDocument;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    iframe.contentWindow.focus();
    setTimeout(() => {
      iframe.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 2000);
    }, 500);
  } catch (err) {
    console.error("Iframe print error", err);
    // Fallback: open in new window and print
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } else {
      Alert.alert("Error", "Pop-up blocked. Please allow pop-ups to print.");
    }
  }
};

// --- 1. Upload Screen ---
function UploadScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Processing PDF...");
  const [uploadError, setUploadError] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [statementType, setStatementType] = useState("business");

  // Compare Statements State
  const [compareModalVisible, setCompareModalVisible] = useState(false);
  const [compareFiles, setCompareFiles] = useState([]);
  const [isComparing, setIsComparing] = useState(false);
  const [compareResults, setCompareResults] = useState(null);
  const [isCompareDragActive, setIsCompareDragActive] = useState(false);

  const handlePickCompareFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setCompareFiles(prev => [...prev, ...result.assets]);
      }
    } catch (err) {
      console.warn("Failed to pick file:", err);
    }
  };

  const handleRemoveCompareFile = (index) => {
    setCompareFiles(prev => prev.filter((_, i) => i !== index));
  };

  const onCompareDrop = (e) => {
    if (Platform.OS === 'web') {
      e.preventDefault();
      setIsCompareDragActive(false);
      if (e.dataTransfer && e.dataTransfer.files) {
        const filesArray = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
        if (filesArray.length > 0) {
          setCompareFiles(prev => [...prev, ...filesArray]);
        }
      }
    }
  };

  const onCompareDragOver = (e) => {
    if (Platform.OS === 'web') {
      e.preventDefault();
      setIsCompareDragActive(true);
    }
  };

  const onCompareDragLeave = (e) => {
    if (Platform.OS === 'web') {
      e.preventDefault();
      setIsCompareDragActive(false);
    }
  };

  const handleCompareStatements = async () => {
    if (compareFiles.length < 2) {
      alert("Please select at least two statements.");
      return;
    }
    
    if (Platform.OS !== 'web') {
      alert("Comparison is supported on Web only for now.");
      return;
    }

    setIsComparing(true);
    try {
      const getBuffer = async (file) => {
        if (file.uri) {
          const response = await fetch(file.uri);
          return await response.arrayBuffer();
        } else {
          return await file.arrayBuffer(); // Native Web File object
        }
      };

      const buffers = await Promise.all(compareFiles.map(f => getBuffer(f)));
      
      const ledgersMap = {};

      for (let i = 0; i < buffers.length; i++) {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffers[i]);
        const ws = wb.getWorksheet("All Transactions") || wb.worksheets[0];

        let headers = [];
        let partyCol = -1;
        let amountCol = -1;

        ws.eachRow((row, rowNumber) => {
          if (rowNumber === 1) {
            headers = row.values;
            partyCol = headers.findIndex(h => h === 'Party Name' || h === 'Ledger');
            amountCol = headers.findIndex(h => h === 'Amount');
            return;
          }

          if (partyCol !== -1 && amountCol !== -1) {
            const party = row.values[partyCol] || 'Misc';
            let amt = parseFloat(row.values[amountCol]);
            if (isNaN(amt)) return;
            
            if (!ledgersMap[party]) ledgersMap[party] = { total: 0 };
            ledgersMap[party][`b${i}`] = (ledgersMap[party][`b${i}`] || 0) + amt;
            ledgersMap[party].total += amt;
          }
        });
      }

      const results = Object.keys(ledgersMap).map(party => {
        const item = { ledger: party, total: ledgersMap[party].total };
        compareFiles.forEach((_, i) => {
          item[`b${i}`] = ledgersMap[party][`b${i}`] || 0;
        });
        return item;
      });

      // Sort alphabetically or by total? Let's sort by total descending
      results.sort((a, b) => b.total - a.total);

      setCompareResults(results);
    } catch (err) {
      console.error("Comparison error:", err);
      alert("Failed to compare statements. Check if they have the correct columns.");
    } finally {
      setIsComparing(false);
    }
  };

  const handleDownloadCompareExcel = async () => {
    if (!compareResults) return;
    try {
      const outWb = new ExcelJS.Workbook();
      outWb.creator = 'Savings App';
      const outWs = outWb.addWorksheet("Comparison");

      outWs.columns = [
        { header: 'Ledger Name', key: 'ledger', width: 25 },
        ...compareFiles.map((f, i) => ({ header: f.name || `Bank ${i + 1} Amount`, key: `b${i}`, width: 20 })),
        { header: 'Total Amount', key: 'total', width: 20 },
      ];

      compareResults.forEach(item => {
        const row = { ledger: item.ledger, total: item.total };
        compareFiles.forEach((_, i) => {
          row[`b${i}`] = item[`b${i}`];
        });
        outWs.addRow(row);
      });
      outWs.getRow(1).font = { bold: true };

      const outBuffer = await outWb.xlsx.writeBuffer();
      const blob = new Blob([outBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const FileSaver = require('file-saver');
      FileSaver.saveAs(blob, "Statement_Comparison.xlsx");
      
      // Close modal and reset after download
      setCompareModalVisible(false);
      setCompareResults(null);
      setCompareFiles([]);
    } catch (err) {
      console.error("Download error:", err);
      alert("Failed to download Excel.");
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        uploadPdf(result.assets[0]);
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to pick document");
    }
  };

  const uploadPdf = async (file) => {
    setUploadError(null);
    setLoading(true);
    setLoadingText("Uploading PDF securely...");
    setLoadingProgress(0.1);

    let progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 0.95) return prev;
        return prev + 0.05;
      });
      setLoadingText(prev => {
        if (prev.includes("Uploading")) return "Reading document structure...";
        if (prev.includes("Reading")) return "Extracting transaction data...";
        if (prev.includes("Extracting")) return "Applying  categorization...";
        if (prev.includes("Applying")) return "Finalizing details...";
        return prev;
      });
    }, 2500);

    let formData = new FormData();

    if (Platform.OS === "web" && file.file) {
      // On Web, use the native HTML File object
      formData.append("statement", file.file);
    } else {
      // On Mobile
      formData.append("statement", {
        uri: file.uri,
        name: file.name,
        type: "application/pdf",
      });
    }

    try {
      const endpoint = statementType === "savings" ? "/api/savings/process-statement" : "/upload";
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Bypass-Tunnel-Reminder": "true",
        },
        body: formData,
      });

      let data;
      const rawText = await response.text();
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        console.error(
          "Failed to parse response as JSON. Raw response:",
          rawText,
        );
        throw new Error("Invalid JSON response from server");
      }

      if (response.ok) {
        if (statementType === "savings") {
          navigation.navigate("SavingsTransactions", { transactions: data.transactions, metadata: data.metadata });
        } else {
          navigation.navigate("Transactions", { transactions: data });
        }
      } else {
        setUploadError(data.error || "Analysis Failed. Please check the PDF.");
      }
    } catch (error) {
      console.error(error);
      setUploadError("Network Error: Failed to communicate with the backend server.");
    } finally {
      clearInterval(progressInterval);
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bank Statement Analyzer</Text>
      <Text style={styles.subtitle}>
        Upload your bank statement PDF to get started
      </Text>

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 30, backgroundColor: '#FFF', padding: 15, borderRadius: 12, boxShadow: '0px 2px 4px rgba(0,0,0,0.05)' }}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginRight: 25 }} onPress={() => setStatementType('business')}>
          <View style={{ height: 20, width: 20, borderRadius: 10, borderWidth: 2, borderColor: statementType === 'business' ? '#288cfa' : '#CBD5E0', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
            {statementType === 'business' && <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: '#288cfa' }} />}
          </View>
          <Text style={{ fontSize: 16, fontWeight: statementType === 'business' ? '600' : '400', color: statementType === 'business' ? '#242c34' : '#718096' }}>Business Account</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => setStatementType('savings')}>
          <View style={{ height: 20, width: 20, borderRadius: 10, borderWidth: 2, borderColor: statementType === 'savings' ? '#288cfa' : '#CBD5E0', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
            {statementType === 'savings' && <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: '#288cfa' }} />}
          </View>
          <Text style={{ fontSize: 16, fontWeight: statementType === 'savings' ? '600' : '400', color: statementType === 'savings' ? '#242c34' : '#718096' }}>Savings Account</Text>
        </TouchableOpacity>
      </View>

      {uploadError && (
        <View style={{ backgroundColor: '#fdeded', padding: 15, borderRadius: 8, marginHorizontal: 20, marginBottom: 20, borderWidth: 1, borderColor: '#f5c6cb' }}>
          <Text style={{ color: '#721c24', fontWeight: 'bold', fontSize: 16, marginBottom: 5 }}>Upload Failed</Text>
          <Text style={{ color: '#721c24', fontSize: 14 }}>{uploadError}</Text>
        </View>
      )}

      {loading ? (
        <View style={{ alignItems: 'center', width: '80%', alignSelf: 'center', backgroundColor: '#fff', padding: 25, borderRadius: 15, boxShadow: '0px 4px 10px rgba(0,0,0,0.1)' }}>
          <ActivityIndicator size="large" color="#288cfa" />
          <Text style={{ marginTop: 15, fontSize: 16, fontWeight: '600', color: '#242c34', textAlign: 'center' }}>{loadingText}</Text>
          <View style={{ width: '100%', height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, marginTop: 15, overflow: 'hidden' }}>
            <View style={{ width: `${loadingProgress * 100}%`, height: '100%', backgroundColor: '#288cfa', borderRadius: 3 }} />
          </View>
        </View>
      ) : (
        <View style={{ width: '100%', alignItems: 'center' }}>
          <TouchableOpacity style={styles.button} onPress={pickDocument}>
            <Text style={styles.buttonText}>Upload PDF Statement</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, { backgroundColor: '#27ae60', marginTop: 15 }]} onPress={() => setCompareModalVisible(true)}>
            <Text style={styles.buttonText}>⇄ Compare Excel Statements</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Compare Statements Modal */}
      <Modal visible={compareModalVisible} transparent={true} animationType="fade" onRequestClose={() => {
        setCompareModalVisible(false);
        setCompareResults(null);
      }}>
        <TouchableOpacity style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]} activeOpacity={1} onPress={() => {
          setCompareModalVisible(false);
          setCompareResults(null);
        }}>
          <View style={[styles.modalContent, { width: '90%', maxWidth: compareResults ? 700 : 450, borderRadius: 16, padding: 30, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 }]} onStartShouldSetResponder={() => true}>
            
            {!compareResults ? (
              <View
                {...Platform.select({ web: { onDrop: onCompareDrop, onDragOver: onCompareDragOver, onDragLeave: onCompareDragLeave } })}
              >
                <Text style={styles.modalTitle}>Compare Bank Statements</Text>
                <Text style={{ color: '#7f8c8d', fontSize: 13, marginBottom: 20, textAlign: 'center' }}>
                  Select two or more Excel statements to compare ledger totals. You can select them or drag and drop files here.
                </Text>

                <TouchableOpacity onPress={handlePickCompareFile}>
                  <View style={{ padding: 20, borderRadius: 12, alignItems: 'center', backgroundColor: isCompareDragActive ? '#e8f5e9' : '#f8f9fa', borderWidth: 2, borderStyle: 'dashed', borderColor: isCompareDragActive ? '#27ae60' : '#bdc3c7', marginBottom: 20 }}>
                    <Text style={{ color: '#34495e', fontSize: 16, fontWeight: '600' }}>
                      {isCompareDragActive ? "Drop Excel files here..." : "Drag & Drop files or Click to Select"}
                    </Text>
                  </View>
                </TouchableOpacity>

                {compareFiles.length > 0 && (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontSize: 12, color: '#7f8c8d', fontWeight: '600', marginBottom: 8 }}>Selected Files ({compareFiles.length}):</Text>
                    <ScrollView style={{ maxHeight: 150 }}>
                      {compareFiles.map((file, idx) => (
                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ecf0f1', padding: 10, borderRadius: 8, marginBottom: 8 }}>
                          <Text style={{ color: '#2c3e50', fontSize: 14, flex: 1 }} numberOfLines={1}>{file.name}</Text>
                          <TouchableOpacity onPress={() => handleRemoveCompareFile(idx)} style={{ padding: 5 }}>
                            <Text style={{ color: '#e74c3c', fontWeight: 'bold' }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.button, { width: '100%', backgroundColor: compareFiles.length < 2 ? '#bdc3c7' : '#27ae60' }]}
                  onPress={handleCompareStatements}
                  disabled={compareFiles.length < 2 || isComparing}
                >
                  <Text style={styles.buttonText}>{isComparing ? "Processing..." : "Generate Preview"}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={{ marginTop: 15, alignSelf: 'center' }} onPress={() => { setCompareModalVisible(false); setCompareFiles([]); }}>
                  <Text style={{ color: '#e74c3c', fontSize: 14, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.modalTitle}>Comparison Preview</Text>
                
                <View style={{ maxHeight: 300, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, marginBottom: 20 }}>
                  <ScrollView>
                    <ScrollView horizontal>
                      <View>
                        <View style={{ flexDirection: 'row', backgroundColor: '#f8f9fa', padding: 10, borderBottomWidth: 1, borderBottomColor: '#e0e0e0', minWidth: 400 }}>
                          <Text style={{ width: 150, fontWeight: 'bold', color: '#2c3e50', fontSize: 12 }}>Ledger Name</Text>
                          {compareFiles.map((f, i) => (
                            <Text key={i} style={{ width: 100, fontWeight: 'bold', color: '#2c3e50', fontSize: 12, textAlign: 'right' }} numberOfLines={1}>
                              {f.name || `Bank ${i+1}`}
                            </Text>
                          ))}
                          <Text style={{ width: 100, fontWeight: 'bold', color: '#2c3e50', fontSize: 12, textAlign: 'right' }}>Total</Text>
                        </View>
                        {compareResults.map((item, idx) => (
                          <View key={idx} style={{ flexDirection: 'row', padding: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', minWidth: 400 }}>
                            <Text style={{ width: 150, color: '#34495e', fontSize: 12 }} numberOfLines={1}>{item.ledger}</Text>
                            {compareFiles.map((_, i) => (
                              <Text key={i} style={{ width: 100, color: '#7f8c8d', fontSize: 12, textAlign: 'right' }}>{item[`b${i}`].toFixed(2)}</Text>
                            ))}
                            <Text style={{ width: 100, color: '#27ae60', fontWeight: 'bold', fontSize: 12, textAlign: 'right' }}>{item.total.toFixed(2)}</Text>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </ScrollView>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <TouchableOpacity 
                    style={[styles.button, { flex: 1, backgroundColor: '#e74c3c', marginRight: 10 }]} 
                    onPress={() => setCompareResults(null)}
                  >
                    <Text style={styles.buttonText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.button, { flex: 1, backgroundColor: '#27ae60', marginLeft: 10 }]} 
                    onPress={handleDownloadCompareExcel}
                  >
                    <Text style={styles.buttonText}>Download Excel</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

          </View>
        </TouchableOpacity>
      </Modal>

      <StatusBar style="auto" />
    </View>
  );
}

// --- 2. Transactions Screen ---
function TransactionsScreen({ route, navigation }) {
  const { transactions } = route.params;
  const [loading, setLoading] = useState(false);

  const generateEntries = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/generate-entries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true",
        },
        body: JSON.stringify(transactions),
      });

      const data = await response.json();
      if (response.ok) {
        navigation.navigate("Journal", { entries: data });
      } else {
        Alert.alert("Error", data.error || "Failed to generate entries");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Network Error", "Ensure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardDate}>{item.date}</Text>
        <Text
          style={[
            styles.cardAmount,
            item.type === "credit" ? styles.creditText : styles.debitText,
          ]}
        >
          ₹{item.amount} ({item.type === "credit" ? "Cr" : "Dr"})
        </Text>
      </View>
      <Text style={styles.cardDesc}>{item.description}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{item.category}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>
        Extracted Transactions ({transactions.length})
      </Text>
      <FlatList
        data={transactions}
        renderItem={renderItem}
        keyExtractor={(item, index) => index.toString()}
        contentContainerStyle={styles.listContent}
      />
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, styles.fullWidthButton]}
          onPress={generateEntries}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>Generate Journal Entries</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// --- 3. Journal Entries Screen ---
function JournalScreen({ route, navigation }) {
  const { entries } = route.params;
  const [entriesData, setEntriesData] = useState(entries);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);

  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingCategory, setPendingCategory] = useState("");

  const [customCategories, setCustomCategories] = useState([
    "Salary", "Rent Income", "GST Payable", "TDS Payable", "Cheque Payable",
    "Loan", "Interest", "Transfer/UPI", "Cash Withdrawal", "Bank Charges", "Misc", "Other"
  ]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newCategoryText, setNewCategoryText] = useState("");

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: "row", marginRight: 5 }}>
          <TouchableOpacity
            style={{ backgroundColor: "#38A169", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, marginRight: 8 }}
            onPress={() => navigation.navigate("Ledgers", { entries: entriesData })}
          >
            <Text style={{ color: "#FFF", fontWeight: "bold", fontSize: 13 }}>Create Ledgers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: "#E74C3C", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 }}
            onPress={handleDownloadPDF}
          >
            <Text style={{ color: "#FFF", fontWeight: "bold", fontSize: 13 }}>Share PDF</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, entriesData]);

  const openCategoryModal = (index) => {
    setEditingIndex(index);
    setIsAddingNew(false);
    setNewCategoryText("");
    setModalVisible(true);
  };

  const selectCategory = (category) => {
    if (editingIndex === null) return;
    setPendingCategory(category);
    setConfirmModalVisible(true);
  };

  const applyCategoryToData = async (category, applyAll) => {
    const newData = [...entriesData];
    const targetEntry = newData[editingIndex];
    const originalDesc = targetEntry.description;

    const isCredit = targetEntry.type === "credit" || targetEntry.type === "cr";
    const targetAccountName = isCredit ? targetEntry.creditAccount : targetEntry.debitAccount;
    const hasValidName = targetAccountName && targetAccountName !== "Misc" && targetAccountName !== originalDesc && targetAccountName !== category && targetAccountName !== "unknown";

    newData.forEach((item, i) => {
      let shouldApply = false;

      if (i === editingIndex) {
        shouldApply = true;
      } else if (applyAll) {
        if (hasValidName && item.description.includes(targetAccountName)) {
          shouldApply = true;
        } else if (item.description === originalDesc) {
          shouldApply = true;
        }
      }

      if (shouldApply) {
        item.category = category;
      }
    });

    setEntriesData(newData);
    setModalVisible(false);

    try {
      const mappingDesc = (applyAll && hasValidName) ? targetAccountName : originalDesc;
      const matchType = (applyAll && hasValidName) ? "all" : "exact";

      await fetch(`${API_URL}/update-category`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true"
        },
        body: JSON.stringify({ description: mappingDesc, category: category, matchType }),
      });
    } catch (e) {
      console.log("Failed to learn category mapping", e);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      let htmlRows = entriesData
        .map((item, index) => {
          const debAcc = item.debitAccount || "Accounts";
          const credAcc = item.creditAccount || "Accounts";
          const narration = item.narration || `(Being ${item.description})`;

          return `
        <tr>
          <td style="text-align: center; color: #555;">${index + 1}</td>
          <td style="white-space: nowrap; text-align: center; color: #333;">${item.date}</td>
          <td style="text-align: center;"><span style="background-color: #E8F4FD; color: #288cfa; padding: 4px 8px; border-radius: 4px; font-size: 11px; text-transform: uppercase; font-weight: bold;">${item.category || "Misc"}</span></td>
          <td>
            <div style="margin-bottom: 6px; font-size: 14px;"><strong>${debAcc} A/c</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style="float: right; font-weight: bold; color: #555;">Dr.</span></div>
            <div style="padding-left: 40px; margin-bottom: 6px; font-size: 14px;">To <strong>${credAcc} A/c</strong></div>
            <div style="font-style: italic; color: #7f8c8d; font-size: 12px; margin-top: 4px;">${narration}</div>
          </td>
          <td>
            <div style="text-align: right; margin-bottom: 6px; font-weight: bold; color: #333;">${item.amount}</div>
            <div style="text-align: left; margin-bottom: 6px; font-weight: bold; color: #333;">${item.amount}</div>
          </td>
        </tr>
      `;
        })
        .join("");

      // Calculate Totals
      const totalAmount = entriesData.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0).toFixed(2);

      let htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px; font-size: 13px; color: #333; background-color: #fff; }
              .header-container { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #242c34; padding-bottom: 20px; }
              .logo { font-size: 24px; font-weight: 800; color: #242c34; letter-spacing: 1px; margin-bottom: 5px; }
              .doc-title { font-size: 14px; color: #7f8c8d; text-transform: uppercase; letter-spacing: 2px; }
              .meta-info { text-align: right; margin-bottom: 20px; font-size: 12px; color: #7f8c8d; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
              th, td { border: 1px solid #e0e0e0; padding: 14px 12px; vertical-align: top; }
              th { background-color: #f4f6f7; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #242c34; border-bottom: 2px solid #bdc3c7; }
              tr:nth-child(even) { background-color: #fafbfc; }
              .total-row td { background-color: #f4f6f7; font-weight: bold; font-size: 14px; border-top: 2px solid #bdc3c7; }
              .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #95a5a6; border-top: 1px solid #eee; padding-top: 20px; }
            </style>
          </head>
          <body>
            <div class="header-container">
              <div class="logo">General Journal</div>
              <div class="doc-title">Entries</div>
            </div>
            
            <div class="meta-info">
              Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
            </div>

            <table>
              <tr>
                <th style="width: 5%; text-align: center;">#</th>
                <th style="width: 12%; text-align: center;">Date</th>
                <th style="width: 15%; text-align: center;">Category</th>
                <th style="width: 48%;">Particulars</th>
                <th style="width: 20%; text-align: right;">Amount (₹)</th>
              </tr>
              ${htmlRows}
              <tr class="total-row">
                <td colspan="4" style="text-align: right;">GRAND TOTAL</td>
                <td>
                  <div style="text-align: right; margin-bottom: 6px;">₹ ${totalAmount}</div>
                  <div style="text-align: left;">₹ ${totalAmount}</div>
                </td>
              </tr>
            </table>
            
            <div class="footer">
              This is a computer-generated document and requires no signature.
            </div>
          </body>
        </html>
      `;

      if (Platform.OS === "web") {
        printHTMLOnWeb(htmlContent);
      } else {
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri);
        } else {
          Alert.alert("Sharing not available", "Cannot share on this device.");
        }
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to generate or share PDF.");
    }
  };

  const renderItem = ({ item, index }) => {
    const isMisc = !item.category || item.category.toLowerCase() === "misc";

    return (
      <View style={styles.entryCard}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Text style={styles.cardDate}>{item.date}</Text>
          <TouchableOpacity
            style={[
              styles.badge,
              styles.editableBadge,
              !isMisc && { backgroundColor: "#EBF8FF", borderColor: "#90CDF4" }
            ]}
            onPress={() => openCategoryModal(index)}
          >
            <Text style={{
              color: isMisc ? "#856404" : "#3182CE",
              fontWeight: "600",
              fontSize: 12
            }}>
              {item.category || "Misc"} ▾
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.entryBox}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 5,
            }}
          >
            <Text style={[styles.entryText, { flex: 1, paddingRight: 10 }]}>{item.debitAccount} A/c Dr.</Text>
            <Text style={styles.entryText}>{item.amount}</Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingLeft: 20,
            }}
          >
            <Text style={[styles.entryText, { flex: 1, paddingRight: 10 }]}>To {item.creditAccount} A/c</Text>
            <Text style={styles.entryText}>{item.amount}</Text>
          </View>
        </View>
        <Text style={styles.descText}>
          {item.narration || `(Being ${item.description})`}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Journal Entries</Text>
      <FlatList
        data={entriesData}
        renderItem={renderItem}
        keyExtractor={(item, index) => index.toString()}
        contentContainerStyle={styles.listContent}
      />

      {/* Category Dropdown Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Category</Text>
            {isAddingNew ? (
              <View style={{ width: '100%' }}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter new category"
                  value={newCategoryText}
                  onChangeText={setNewCategoryText}
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.button, styles.fullWidthButton, { marginTop: 10 }]}
                  onPress={() => {
                    const newCat = newCategoryText.trim();
                    if (newCat) {
                      setCustomCategories(prev => {
                        const newArr = [...prev];
                        newArr.splice(newArr.length - 1, 0, newCat); // Insert before "Other"
                        return newArr;
                      });
                      selectCategory(newCat);
                      setIsAddingNew(false);
                    }
                  }}
                >
                  <Text style={styles.buttonText}>Add & Select</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView>
                {customCategories.map((cat, i) => (
                  <TouchableOpacity key={i} style={styles.modalOption} onPress={() => {
                    if (cat === "Other") {
                      setIsAddingNew(true);
                    } else {
                      selectCategory(cat);
                    }
                  }}>
                    <Text style={styles.modalOptionText}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.modalCancel} onPress={() => {
              if (isAddingNew) {
                setIsAddingNew(false);
              } else {
                setModalVisible(false);
              }
            }}>
              <Text style={styles.modalCancelText}>{isAddingNew ? "Back" : "Cancel"}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Custom Confirm Modal */}
      <Modal
        visible={confirmModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setConfirmModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setConfirmModalVisible(false)}
        >
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>Apply Category</Text>
            <Text style={styles.confirmModalDesc}>
              Do you want to apply "{pendingCategory}" to all transactions from this party, or just this one?
            </Text>
            <View style={styles.confirmButtonRow}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmButtonSecondary]}
                onPress={() => {
                  applyCategoryToData(pendingCategory, false);
                  setConfirmModalVisible(false);
                }}
              >
                <Text style={styles.confirmButtonTextSecondary}>Only This</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.confirmButtonPrimary]}
                onPress={() => {
                  applyCategoryToData(pendingCategory, true);
                  setConfirmModalVisible(false);
                }}
              >
                <Text style={styles.confirmButtonTextPrimary}>Apply All</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.confirmCancel}
              onPress={() => setConfirmModalVisible(false)}
            >
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// --- 4. Ledgers Screen ---
function LedgersScreen({ route }) {
  const { entries } = route.params;

  // Extract unique accounts
  const accountsSet = new Set();
  entries.forEach(e => {
    if (e.debitAccount) accountsSet.add(e.debitAccount);
    if (e.creditAccount) accountsSet.add(e.creditAccount);
  });
  const accounts = Array.from(accountsSet).sort();

  const [activeTab, setActiveTab] = useState(accounts[0] || "");
  const tabsRef = React.useRef(null);

  React.useEffect(() => {
    if (Platform.OS !== "web" || !tabsRef.current) return;

    const element = tabsRef.current.getScrollableNode
      ? tabsRef.current.getScrollableNode()
      : tabsRef.current;

    if (!element) return;

    const handleWheel = (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        element.scrollLeft += e.deltaY;
      }
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", handleWheel);
    };
  }, [accounts]);

  const handleDownloadLedgersPDF = async () => {
    try {
      let htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: 'Segoe UI', sans-serif; padding: 40px; font-size: 13px; color: #333; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #242c34; padding-bottom: 10px; }
              .title { font-size: 24px; font-weight: bold; color: #242c34; }
              .account-header { font-size: 18px; font-weight: bold; margin-top: 30px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px;}
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #e0e0e0; padding: 8px; text-align: left; }
              th { background-color: #f4f6f7; }
              .right { text-align: right; }
              .center { text-align: center; }
              .bold { font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">All Ledgers</div>
              <div>Generated on: ${new Date().toLocaleDateString()}</div>
            </div>
      `;

      accounts.forEach(acc => {
        let rows = "";
        let totalDr = 0;
        let totalCr = 0;

        entries.forEach(entry => {
          const amount = parseFloat(entry.amount);
          if (entry.debitAccount === acc) {
            totalDr += amount;
            rows += `<tr><td class="center">${entry.date}</td><td>${entry.creditAccount}</td><td class="right">${amount}</td><td></td></tr>`;
          } else if (entry.creditAccount === acc) {
            totalCr += amount;
            rows += `<tr><td class="center">${entry.date}</td><td>${entry.debitAccount}</td><td></td><td class="right">${amount}</td></tr>`;
          }
        });

        const bal = totalDr - totalCr;
        const balStr = Math.abs(bal) + (bal >= 0 ? " Dr" : " Cr");

        htmlContent += `
          <div class="account-header">ACCOUNT : ${acc.toUpperCase()}</div>
          <table>
            <tr><th style="width:15%">Date</th><th style="width:45%">Narration</th><th style="width:20%" class="right">Dr</th><th style="width:20%" class="right">Cr</th></tr>
            ${rows}
            <tr><td colspan="2" class="right bold">Total</td><td class="right bold">${totalDr}</td><td class="right bold">${totalCr}</td></tr>
            <tr><td colspan="4" class="right bold">Closing Balance : ${balStr}</td></tr>
          </table>
        `;
      });

      htmlContent += `</body></html>`;

      if (Platform.OS === "web") {
        printHTMLOnWeb(htmlContent);
      } else {
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri);
        } else {
          Alert.alert("Sharing not available", "Cannot share on this device.");
        }
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to generate or share PDF.");
    }
  };

  const renderLedger = () => {
    let ledgerEntries = [];
    let totalDr = 0;
    let totalCr = 0;

    entries.forEach(entry => {
      const amount = parseFloat(entry.amount);
      if (entry.debitAccount === activeTab) {
        totalDr += amount;
        ledgerEntries.push({ date: entry.date, narration: entry.creditAccount, dr: amount, cr: '' });
      } else if (entry.creditAccount === activeTab) {
        totalCr += amount;
        ledgerEntries.push({ date: entry.date, narration: entry.debitAccount, dr: '', cr: amount });
      }
    });

    const bal = totalDr - totalCr;
    const balStr = Math.abs(bal) + (bal >= 0 ? " Dr" : " Cr");

    return (
      <View style={styles.ledgerContainer}>
        <View style={styles.ledgerHeader}>
          <Text style={styles.ledgerTitle}>ACCOUNT : {activeTab.toUpperCase()}</Text>
        </View>
        <View style={styles.ledgerTableHeader}>
          <Text style={[styles.ledgerCell, { flex: 2, fontWeight: 'bold' }]}>Date</Text>
          <Text style={[styles.ledgerCell, { flex: 3, fontWeight: 'bold' }]}>Narration</Text>
          <Text style={[styles.ledgerCell, { flex: 2, textAlign: 'right', fontWeight: 'bold' }]}>Dr</Text>
          <Text style={[styles.ledgerCell, { flex: 2, textAlign: 'right', fontWeight: 'bold' }]}>Cr</Text>
        </View>
        <FlatList
          data={ledgerEntries}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
            <View style={styles.ledgerRow}>
              <Text style={[styles.ledgerCell, { flex: 2 }]}>{item.date}</Text>
              <Text style={[styles.ledgerCell, { flex: 3 }]}>{item.narration}</Text>
              <Text style={[styles.ledgerCell, { flex: 2, textAlign: 'right' }]}>{item.dr}</Text>
              <Text style={[styles.ledgerCell, { flex: 2, textAlign: 'right' }]}>{item.cr}</Text>
            </View>
          )}
        />
        <View style={styles.ledgerFooter}>
          <Text style={styles.ledgerTotalText}>Total Dr: {totalDr}    Total Cr: {totalCr}</Text>
          <Text style={[styles.ledgerTotalText, { marginTop: 5 }]}>Closing Balance : {balStr}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabsContainer}>
        <ScrollView
          ref={tabsRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
        >
          {accounts.map(acc => (
            <TouchableOpacity
              key={acc}
              style={[styles.tab, activeTab === acc && styles.activeTab]}
              onPress={() => setActiveTab(acc)}
            >
              <Text style={[styles.tabText, activeTab === acc && styles.activeTabText]}>{acc}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {accounts.length > 0 && renderLedger()}

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, styles.downloadButton, styles.fullWidthButton, { backgroundColor: "#E74C3C" }]}
          onPress={handleDownloadLedgersPDF}
        >
          <Text style={styles.buttonText}>Download Ledgers PDF</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// --- Navigation ---
export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Upload"
        screenOptions={{
          headerStyle: { backgroundColor: "#103766" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "bold" },
        }}
      >
        <Stack.Screen
          name="Upload"
          component={UploadScreen}
          options={{ title: "Import Data" }}
        />
        <Stack.Screen
          name="Transactions"
          component={TransactionsScreen}
          options={{ title: "Transactions" }}
        />
        <Stack.Screen
          name="Journal"
          component={JournalScreen}
          options={{ title: "General Journal" }}
        />
        <Stack.Screen
          name="Ledgers"
          component={LedgersScreen}
          options={{ title: "Ledgers" }}
        />
        <Stack.Screen
          name="SavingsTransactions"
          component={SavingsTransactionsScreen}
          options={{ title: "Savings Transactions" }}
        />
        <Stack.Screen
          name="SavingsReport"
          component={SavingsReportScreen}
          options={{ title: "Savings Report" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F7FB",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1A202C",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: "#718096",
    marginBottom: 40,
    textAlign: "center",
    paddingHorizontal: 30,
    lineHeight: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    backgroundColor: "#F7FAFC",
    marginBottom: 10,
    width: '100%',
  },
  loadingContainer: {
    alignItems: "center",
    padding: 20,
    backgroundColor: "#FFF",
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 3,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    fontWeight: "600",
    color: "#4A5568",
  },
  button: {
    backgroundColor: "#2B6CB0",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    shadowColor: "#2B6CB0",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
    maxWidth: 800,
  },
  fullWidthButton: {
    width: "100%",
    alignItems: "center",
  },
  buttonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1A202C",
    marginVertical: 20,
    marginHorizontal: 20,
    alignSelf: "center",
    width: "100%",
    maxWidth: 800,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
  },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.02)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    alignItems: "center",
  },
  cardDate: {
    fontSize: 13,
    color: "#A0AEC0",
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  cardAmount: {
    fontSize: 18,
    fontWeight: "800",
  },
  creditText: {
    color: "#38A169",
  },
  debitText: {
    color: "#E53E3E",
  },
  cardDesc: {
    fontSize: 15,
    color: "#2D3748",
    marginBottom: 12,
    lineHeight: 22,
  },
  badge: {
    backgroundColor: "#EBF8FF",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  badgeText: {
    color: "#3182CE",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  editableBadge: {
    backgroundColor: "#FEFCBF",
    borderColor: "#F6E05E",
    borderWidth: 1,
  },
  footer: {
    padding: 20,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#EDF2F7",
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 10,
  },
  entryCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderLeftWidth: 5,
    borderLeftColor: "#3182CE",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    width: "100%",
  },
  entryBox: {
    backgroundColor: "#F7FAFC",
    padding: 16,
    borderRadius: 8,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: "#EDF2F7",
  },
  entryText: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 14,
    color: "#2D3748",
    lineHeight: 24,
    fontWeight: "600",
  },
  descText: {
    fontSize: 13,
    color: "#718096",
    fontStyle: "italic",
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderRadius: Platform.OS === 'web' ? 24 : 0,
    padding: 24,
    maxHeight: "75%",
    width: Platform.OS === 'web' ? 360 : '100%',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 20,
    textAlign: "center",
    color: "#1A202C",
  },
  modalOption: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F7",
  },
  modalOptionText: {
    fontSize: 16,
    color: "#3182CE",
    textAlign: "center",
    fontWeight: "500",
  },
  modalCancel: {
    marginTop: 20,
    paddingVertical: 16,
    backgroundColor: "#FED7D7",
    borderRadius: 12,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#C53030",
    textAlign: "center",
  },
  downloadButton: {
    paddingVertical: 14,
  },
  tabsContainer: {
    width: "100%",
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F7",
  },
  tabsScroll: {
    paddingHorizontal: 10,
  },
  tab: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: "#3182CE",
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#A0AEC0",
  },
  activeTabText: {
    color: "#3182CE",
  },
  ledgerContainer: {
    flex: 1,
    width: "100%",
    maxWidth: 1000,
    alignSelf: "center",
    backgroundColor: "#FFF",
    padding: 16,
  },
  ledgerHeader: {
    borderBottomWidth: 2,
    borderBottomColor: "#242c34",
    paddingBottom: 10,
    marginBottom: 10,
  },
  ledgerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#242c34",
    textAlign: "center",
  },
  ledgerTableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F7",
    paddingBottom: 8,
    marginBottom: 8,
  },
  ledgerRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F7FAFC",
  },
  ledgerCell: {
    fontSize: 13,
    color: "#2D3748",
  },
  ledgerFooter: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: "#EDF2F7",
    alignItems: "flex-end",
  },
  ledgerTotalText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2D3748",
  },
  confirmModalContent: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 24,
    width: 320,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
    alignSelf: "center",
  },
  confirmModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A202C",
    marginBottom: 12,
    textAlign: "center",
  },
  confirmModalDesc: {
    fontSize: 14,
    color: "#4A5568",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  confirmButtonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 10,
    marginBottom: 10,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  confirmButtonPrimary: {
    backgroundColor: "#3182CE",
  },
  confirmButtonSecondary: {
    backgroundColor: "#E2E8F0",
  },
  confirmButtonTextPrimary: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 14,
  },
  confirmButtonTextSecondary: {
    color: "#4A5568",
    fontWeight: "700",
    fontSize: 14,
  },
  confirmCancel: {
    paddingVertical: 10,
    width: "100%",
    alignItems: "center",
  },
  confirmCancelText: {
    color: "#718096",
    fontSize: 14,
    fontWeight: "600",
  },
  webDesktopBackground: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  webPhoneFrame: {
    width: 480,
    height: "100%",
    backgroundColor: "#F4F7FB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 8,
    overflow: "hidden",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#E2E8F0",
  },
});
