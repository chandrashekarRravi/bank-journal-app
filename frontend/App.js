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

// API Configuration
// Pointing back to your laptop via local IP for dev, or env variable for production
const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.200.38:3000";
const Stack = createNativeStackNavigator();

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
    setLoading(true);
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
      const response = await fetch(`${API_URL}/upload`, {
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
        navigation.navigate("Transactions", { transactions: data });
      } else {
        Alert.alert("Analysis Failed", data.error || "Something went wrong");
      }
    } catch (error) {
      console.error(error);
      Alert.alert(
        "Network/Server Error",
        "Failed to communicate with the backend. Check console for details.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bank Statement to Journal</Text>
      <Text style={styles.subtitle}>
        Upload your bank statement PDF to get started
      </Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4A90E2" />
          <Text style={styles.loadingText}>Processing PDF...</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.button} onPress={pickDocument}>
          <Text style={styles.buttonText}>Upload PDF</Text>
        </TouchableOpacity>
      )}
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
          <td style="text-align: center;"><span style="background-color: #E8F4FD; color: #4A90E2; padding: 4px 8px; border-radius: 4px; font-size: 11px; text-transform: uppercase; font-weight: bold;">${item.category || "Misc"}</span></td>
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
              .header-container { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #2C3E50; padding-bottom: 20px; }
              .logo { font-size: 24px; font-weight: 800; color: #2C3E50; letter-spacing: 1px; margin-bottom: 5px; }
              .doc-title { font-size: 14px; color: #7f8c8d; text-transform: uppercase; letter-spacing: 2px; }
              .meta-info { text-align: right; margin-bottom: 20px; font-size: 12px; color: #7f8c8d; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
              th, td { border: 1px solid #e0e0e0; padding: 14px 12px; vertical-align: top; }
              th { background-color: #f4f6f7; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #2c3e50; border-bottom: 2px solid #bdc3c7; }
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
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2C3E50; padding-bottom: 10px; }
              .title { font-size: 24px; font-weight: bold; color: #2C3E50; }
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
          headerStyle: { backgroundColor: "#4A90E2" },
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
    borderBottomColor: "#2C3E50",
    paddingBottom: 10,
    marginBottom: 10,
  },
  ledgerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2C3E50",
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
