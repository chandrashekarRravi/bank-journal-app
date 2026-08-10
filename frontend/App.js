import React, { useState, createContext, useContext, useEffect } from "react";
import { lightTheme, darkTheme, ThemeContext, useAppTheme, DashboardLayout, dbStyles } from "./ThemeAndLayout";
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
// ExcelJS is web-only — lazy require to avoid native crash
const ExcelJS = Platform.OS === 'web' ? require('exceljs/dist/exceljs.min.js') : null;

// API Configuration
// Pointing back to your laptop via local IP for dev, or env variable for production || "http://192.168.0.6:3000"   || "https://bank-journal-backend.onrender.com"
const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://bank-journal-backend.onrender.com" || "http://192.168.0.7:3000";
const Stack = createNativeStackNavigator();

import { SavingsTransactionsScreen, SavingsReportScreen } from "./modules/savings/SavingsApp";
import LandingScreen from "./modules/landing/LandingScreen";
import TallyScreen from "./modules/tally/TallyScreen";


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
function UploadScreen({ route, navigation }) {
  const { user } = route.params || {};
  const accountType = user?.type || "current";
  const isSavings = accountType === "savings";
  const { theme } = useAppTheme();
  const accent = isSavings ? theme.savingsAccent : theme.businessAccent;

  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Processing PDF...");
  const [uploadError, setUploadError] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const statementType = isSavings ? "savings" : "business";


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

  // Sidebar nav items
  const NAV = [
    // { id: "import", label: "Import Data", icon: "☁" },
    { id: "dashboard", label: "Dashboard", icon: "⊞" },
    { id: "analysis", label: "Analysis", icon: "◷" },
    { id: "transactions", label: "Transactions", icon: "≡" },
    { id: "comparisons", label: "Comparisons", icon: "⇄" },
    { id: "reports", label: "Reports", icon: "☰" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  return (
    <DashboardLayout user={user} activeNav="import" navigation={navigation}>
      {/* ══ MAIN CONTENT ══════════════════════════════════════════════════════ */}
      <ScrollView style={[dbStyles.main, { backgroundColor: theme.bg }]} contentContainerStyle={dbStyles.mainContent}>

        {/* Header */}
        <Text style={[dbStyles.mainTitle, { color: theme.font }]}>Banklyt Statement Analyzer</Text>
        <Text style={dbStyles.mainSub}>Upload your bank statement and let AI do the rest.</Text>

        {/* Upload card */}
        <View style={[dbStyles.uploadCard, { backgroundColor: theme.card, borderColor: theme.border }]}>

          {/* Account type label */}
          <Text style={[dbStyles.sectionLabel, { color: theme.muted }]}>Account Type</Text>
          <View style={[dbStyles.accountTypeBox, { borderColor: accent + "88" }]}>
            <View style={[dbStyles.radioOuter, { borderColor: accent }]}>
              <View style={[dbStyles.radioInner, { backgroundColor: accent }]} />
            </View>
            <Text style={{ fontSize: 22, marginHorizontal: 10 }}>{isSavings ? "🐷" : "🏦"}</Text>
            <View>
              <Text style={[dbStyles.accountTypeTitle, { color: theme.font }]}>
                {isSavings ? "Savings Account" : "Current Account"}
              </Text>
              <Text style={[dbStyles.accountTypeDesc, { color: theme.muted }]}>
                {isSavings
                  ? "For personal savings & passbook statements"
                  : "For business & daily transaction statements"}
              </Text>
            </View>
          </View>

          {/* Error banner */}
          {uploadError && (
            <View style={[dbStyles.errorBanner, { backgroundColor: theme.pink + "22", borderColor: theme.pink }]}>
              <Text style={[dbStyles.errorTitle, { color: theme.pink }]}>⚠ Upload Failed</Text>
              <Text style={[dbStyles.errorDesc, { color: theme.muted }]}>{uploadError}</Text>
            </View>
          )}

          {/* Drop zone / loading */}
          {loading ? (
            <View style={dbStyles.loadingBox}>
              <ActivityIndicator size="large" color={accent} />
              <Text style={[dbStyles.loadingText, { color: accent }]}>{loadingText}</Text>
              <View style={dbStyles.progressTrack}>
                <View style={[dbStyles.progressFill, { width: `${loadingProgress * 100}%`, backgroundColor: accent }]} />
              </View>
            </View>
          ) : (
            <TouchableOpacity style={[dbStyles.dropZone, { borderColor: theme.border, backgroundColor: theme.bg }]} onPress={pickDocument}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>📄</Text>
              <Text style={[dbStyles.dropZoneTitle, { color: theme.font }]}>Upload Bank Statement (PDF)</Text>
              <Text style={[dbStyles.dropZoneSub, { color: theme.muted }]}>Drag & drop your PDF here or click to browse</Text>
              <View style={[dbStyles.browseBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[dbStyles.browseBtnText, { color: theme.font }]}>⊞ Browse Files</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Upload PDF button */}
          {!loading && (
            <>
              <TouchableOpacity
                style={[dbStyles.primaryBtn, { backgroundColor: accent }]}
                onPress={pickDocument}
              >
                <Text style={{ fontSize: 18, marginRight: 8 }}>☁</Text>
                <Text style={[dbStyles.primaryBtnText, { color: isSavings ? theme.textGreen : theme.font }]}>
                  Upload PDF Statement
                </Text>
              </TouchableOpacity>

              <Text style={dbStyles.orDivider}>OR</Text>

              <TouchableOpacity
                style={[dbStyles.primaryBtn, { backgroundColor: isSavings ? theme.savingsAccent : theme.businessAccent, marginBottom: 0 }]}
                onPress={() => navigation.navigate("Tally", { user })}
              >
                <Text style={{ fontSize: 18, marginRight: 8 }}>📊</Text>
                <View>
                  <Text style={[dbStyles.primaryBtnText, { color: theme.textGreen }]}>Export to Tally</Text>
                  <Text style={[{ fontSize: 11, color: theme.textGreen + "bb", marginTop: 2 }]}>Parse PDF → Download Excel + Tally XML</Text>
                </View>
              </TouchableOpacity>

            </>
          )}
        </View>

        {/* Feature strip */}
        {/* <View style={dbStyles.featureStrip}>
          {[
            { icon: "🤖", title: "AI Categorization",  sub: "Automatically categorizes transactions with accuracy" },
            { icon: "🛡", title: "Fraud Detection",    sub: "Identify suspicious activities and potential fraud" },
            { icon: "📄", title: "GST Insights",       sub: "Get detailed GST breakdowns and tax summaries" },
            { icon: "📊", title: "Smart Reports",      sub: "Generate professional reports in seconds" },
          ].map((f, i) => (
            <View key={i} style={dbStyles.featureItem}>
              <Text style={{ fontSize: 22, marginBottom: 6 }}>{f.icon}</Text>
              <Text style={dbStyles.featureTitle}>{f.title}</Text>
              <Text style={dbStyles.featureSub}>{f.sub}</Text>
            </View>
          ))}
        </View> */}

        <Text style={dbStyles.footerNote}>🛡 Bank-level security  •  Your data is private and encrypted</Text>
      </ScrollView>
    </DashboardLayout>
  );
}

// --- 2. Transactions Screen ---
function TransactionsScreen({ route, navigation }) {
  const { transactions, user } = route.params || {};
  const { theme } = useAppTheme();
  const [loading, setLoading] = useState(false);

  const generateEntries = async () => {
    setLoading(true);
    try {
      const CHUNK_SIZE = 50;
      const allEntries = [];

      for (let i = 0; i < transactions.length; i += CHUNK_SIZE) {
        const chunk = transactions.slice(i, i + CHUNK_SIZE);

        const response = await fetch(`${API_URL}/generate-entries`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Bypass-Tunnel-Reminder": "true",
          },
          body: JSON.stringify(chunk),
        });

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          Alert.alert(
            "Server Error",
            "The server returned an unexpected response. Please try again later."
          );
          return;
        }

        const data = await response.json();
        if (!response.ok) {
          Alert.alert("Error", data.error || "Failed to generate entries");
          return;
        }

        if (Array.isArray(data)) {
          allEntries.push(...data);
        } else if (data.entries && Array.isArray(data.entries)) {
          allEntries.push(...data.entries);
        }
      }

      navigation.navigate("Journal", { entries: allEntries });
    } catch (error) {
      Alert.alert(
        "Network Error",
        "Could not reach the server. Please check your internet connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, flex: 1, margin: 6 }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardDate, { color: theme.muted }]}>{item.date}</Text>
        <Text style={[styles.cardAmount, item.type === "credit" ? styles.creditText : styles.debitText]}>
          ₹{item.amount} ({item.type === "credit" ? "Cr" : "Dr"})
        </Text>
      </View>
      <Text style={[styles.cardDesc, { color: theme.font }]} numberOfLines={2}>{item.description}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{item.category}</Text>
      </View>
    </View>
  );

  return (
    <DashboardLayout user={user} activeNav="transactions" navigation={navigation}>
      <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: 20 }]}>
        <Text style={[styles.headerTitle, { color: theme.font }]}>
          Extracted Transactions ({transactions?.length || 0})
        </Text>
        <FlatList
          data={transactions}
          renderItem={renderItem}
          keyExtractor={(item, index) => index.toString()}
          numColumns={3}
          columnWrapperStyle={{ paddingHorizontal: 10 }}
          contentContainerStyle={{ paddingVertical: 10 }}
        />
        <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.button, styles.fullWidthButton, { backgroundColor: theme.businessAccent }]}
            onPress={generateEntries}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={[styles.buttonText, { color: theme.textGreen }]}>Generate Journal Entries</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </DashboardLayout>
  );
}

// --- 3. Journal Entries Screen ---
function JournalScreen({ route, navigation }) {
  const { entries, user } = route.params || {};
  const { theme } = useAppTheme();
  const [entriesData, setEntriesData] = useState(entries || []);
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
            style={{ backgroundColor: theme.businessAccent, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, marginRight: 8 }}
            onPress={() => navigation.navigate("Ledgers", { entries: entriesData, user })}
          >
            <Text style={{ color: theme.textGreen, fontWeight: "bold", fontSize: 13 }}>Create Ledgers</Text>
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
          const refLine = item.refNo
            ? `<div style="font-size: 11px; color: #888; margin-top: 2px; margin-bottom: 4px;">Ref/Chq.No: <strong>${item.refNo}</strong></div>`
            : "";

          return `
        <tr>
          <td style="text-align: center; color: #555;">${index + 1}</td>
          <td style="white-space: nowrap; text-align: center; color: #333;">${item.date}</td>
          <td style="text-align: center;"><span style="background-color: #E8F4FD; color: #288cfa; padding: 4px 8px; border-radius: 4px; font-size: 11px; text-transform: uppercase; font-weight: bold;">${item.category || "Misc"}</span></td>
          <td>
            <div style="margin-bottom: 6px; font-size: 14px;"><strong>${debAcc} A/c</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span style="float: right; font-weight: bold; color: #555;">Dr.</span></div>
            <div style="padding-left: 40px; margin-bottom: 6px; font-size: 14px;">To <strong>${credAcc} A/c</strong></div>
            ${refLine}
            <div style="font-style: italic; color: #7f8c8d; font-size: 12px; margin-top: 4px;">${narration}</div>
          </td>
          <td>
            <div style="text-align: right; margin-bottom: 6px; font-weight: bold; color: #333;">₹ ${parseFloat(item.amount || 0).toFixed(2)}</div>
            <div style="text-align: left; margin-bottom: 6px; font-weight: bold; color: #333;">₹ ${parseFloat(item.amount || 0).toFixed(2)}</div>
          </td>
        </tr>
      `;
        })
        .join("");

      // Calculate Totals
      const totalDebit = entriesData.reduce((sum, item) => (item.type === "debit" || item.type === "dr") ? sum + parseFloat(item.amount || 0) : sum, 0).toFixed(2);
      const totalCredit = entriesData.reduce((sum, item) => (item.type === "credit" || item.type === "cr") ? sum + parseFloat(item.amount || 0) : sum, 0).toFixed(2);
      const grandTotal = entriesData.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0).toFixed(2);

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
                <td colspan="4" style="text-align: right; vertical-align: top;">
                  <div style="margin-bottom: 4px;">Total Debit</div>
                  <div style="margin-bottom: 4px;">Total Credit</div>
                  <div style="border-top: 1px solid #bdc3c7; padding-top: 4px; font-size: 15px;">Grand Total</div>
                </td>
                <td>
                  <div style="text-align: right; margin-bottom: 4px;">₹ ${totalDebit}</div>
                  <div style="text-align: left; margin-bottom: 4px;">₹ ${totalCredit}</div>
                  <div style="text-align: right; border-top: 1px solid #bdc3c7; padding-top: 4px; font-size: 15px; color: #2c3e50;">₹ ${grandTotal}</div>
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
          await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
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
      <View style={[styles.entryCard, { backgroundColor: theme.card, borderColor: theme.border, flex: 1, margin: 6 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Text style={[styles.cardDate, { color: theme.muted, fontSize: 11 }]}>{item.date}</Text>
          <TouchableOpacity
            style={[styles.badge, styles.editableBadge, !isMisc && { backgroundColor: "#EBF8FF", borderColor: "#90CDF4" }]}
            onPress={() => openCategoryModal(index)}
          >
            <Text style={{ color: isMisc ? "#856404" : "#3182CE", fontWeight: "600", fontSize: 11 }}>
              {item.category || "Misc"} ▾
            </Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.entryBox, { backgroundColor: theme.isDark ? theme.border : "#FAFAFA", borderColor: theme.border }]}>
          <Text style={[styles.entryText, { color: theme.font }]} numberOfLines={1}>{item.debitAccount} A/c Dr.  ₹{item.amount}</Text>
          <Text style={[styles.entryText, { color: theme.font, paddingLeft: 10 }]} numberOfLines={1}>To {item.creditAccount} A/c  ₹{item.amount}</Text>
        </View>
        <Text style={[styles.descText, { color: theme.muted }]} numberOfLines={2}>
          {item.narration || `(Being ${item.description})`}
        </Text>
      </View>
    );
  };

  return (
    <DashboardLayout user={user} activeNav="transactions" navigation={navigation}>
      <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: 20 }]}>
        <Text style={[styles.headerTitle, { color: theme.font }]}>Journal Entries</Text>
        <FlatList
          data={entriesData}
          renderItem={renderItem}
          keyExtractor={(item, index) => index.toString()}
          numColumns={3}
          columnWrapperStyle={{ paddingHorizontal: 10 }}
          contentContainerStyle={{ paddingVertical: 10 }}
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
    </DashboardLayout>
  );
}

// --- 4. Ledgers Screen ---
function LedgersScreen({ route, navigation }) {
  const { entries, user } = route.params || {};
  const { theme } = useAppTheme();

  // Extract unique accounts
  const accountsSet = new Set();
  (entries || []).forEach(e => {
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
        element.scrollLeft += e.deltaY;
      }
    };

    // passive: true avoids scroll-blocking warning; we no longer call preventDefault
    element.addEventListener("wheel", handleWheel, { passive: true });
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
            rows += `<tr><td class="center">${entry.date}</td><td>To ${entry.creditAccount} A/c<br/><span style="font-size:10px; color:#555;">${entry.narration || ''}</span></td><td class="right">${amount}</td><td></td></tr>`;
          } else if (entry.creditAccount === acc) {
            totalCr += amount;
            rows += `<tr><td class="center">${entry.date}</td><td>By ${entry.debitAccount} A/c<br/><span style="font-size:10px; color:#555;">${entry.narration || ''}</span></td><td></td><td class="right">${amount}</td></tr>`;
          }
        });

        const bal = totalDr - totalCr;
        const balStr = Math.abs(bal) + (bal >= 0 ? " Dr" : " Cr");

        htmlContent += `
          <div class="account-header">ACCOUNT : ${acc.toUpperCase()}</div>
          <table>
            <tr><th style="width:15%">Date</th><th style="width:45%">Particulars</th><th style="width:20%" class="right">Dr</th><th style="width:20%" class="right">Cr</th></tr>
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
          await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
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
        ledgerEntries.push({
          date: entry.date,
          narration: `To ${entry.creditAccount} A/c\n${entry.narration || ''}`,
          dr: amount,
          cr: ''
        });
      } else if (entry.creditAccount === activeTab) {
        totalCr += amount;
        ledgerEntries.push({
          date: entry.date,
          narration: `By ${entry.debitAccount} A/c\n${entry.narration || ''}`,
          dr: '',
          cr: amount
        });
      }
    });

    const bal = totalDr - totalCr;
    const balStr = Math.abs(bal) + (bal >= 0 ? " Dr" : " Cr");

    return (
      <View style={[styles.ledgerContainer, { backgroundColor: theme.card }]}>
        <View style={styles.ledgerHeader}>
          <Text style={[styles.ledgerTitle, { color: theme.font }]}>ACCOUNT : {activeTab.toUpperCase()}</Text>
        </View>
        <View style={[styles.ledgerTableHeader, { backgroundColor: theme.bg }]}>
          <Text style={[styles.ledgerCell, { flex: 2, fontWeight: 'bold', color: theme.font }]}>Date</Text>
          <Text style={[styles.ledgerCell, { flex: 3, fontWeight: 'bold', color: theme.font }]}>Particulars</Text>
          <Text style={[styles.ledgerCell, { flex: 2, textAlign: 'right', fontWeight: 'bold', color: theme.font }]}>Dr</Text>
          <Text style={[styles.ledgerCell, { flex: 2, textAlign: 'right', fontWeight: 'bold', color: theme.font }]}>Cr</Text>
        </View>
        <FlatList
          data={ledgerEntries}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
            <View style={[styles.ledgerRow, { borderBottomColor: theme.border }]}>
              <Text style={[styles.ledgerCell, { flex: 2, color: theme.font }]}>{item.date}</Text>
              <Text style={[styles.ledgerCell, { flex: 3, color: theme.font }]}>{item.narration}</Text>
              <Text style={[styles.ledgerCell, { flex: 2, textAlign: 'right', color: theme.font }]}>{item.dr}</Text>
              <Text style={[styles.ledgerCell, { flex: 2, textAlign: 'right', color: theme.font }]}>{item.cr}</Text>
            </View>
          )}
        />
        <View style={[styles.ledgerFooter, { backgroundColor: theme.bg }]}>
          <Text style={[styles.ledgerTotalText, { color: theme.font }]}>Total Dr: {totalDr}    Total Cr: {totalCr}</Text>
          <Text style={[styles.ledgerTotalText, { marginTop: 5, color: theme.font }]}>Closing Balance : {balStr}</Text>
        </View>
      </View>
    );
  };

  return (
    <DashboardLayout user={user} activeNav="transactions" navigation={navigation}>
      <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: 20 }]}>
        <View style={[styles.tabsContainer, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <ScrollView
            ref={tabsRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsScroll}
          >
            {accounts.map(acc => (
              <TouchableOpacity
                key={acc}
                style={[styles.tab, activeTab === acc && [styles.activeTab, { borderBottomColor: theme.businessAccent }]]}
                onPress={() => setActiveTab(acc)}
              >
                <Text style={[styles.tabText, { color: theme.muted }, activeTab === acc && [styles.activeTabText, { color: theme.businessAccent }]]}>{acc}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {accounts.length > 0 && renderLedger()}

        <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.button, styles.downloadButton, styles.fullWidthButton, { backgroundColor: theme.businessAccent }]}
            onPress={handleDownloadLedgersPDF}
          >
            <Text style={[styles.buttonText, { color: theme.textGreen }]}>Download Ledgers PDF</Text>
          </TouchableOpacity>
        </View>
      </View>
    </DashboardLayout>
  );
}

// ─── Landing wrapper (stateless; just routes onLogin to Upload) ───────────────
function LandingWrapper({ navigation }) {
  const handleLogin = ({ type, user }) => {
    navigation.replace("Upload", { user: { ...user, type } });
  };
  return (
    <LandingScreen
      onCurrentLogin={handleLogin}
      onSavingsLogin={handleLogin}
    />
  );
}

// --- New Screens (Comparisons & Reports) ---
function ComparisonsScreen({ route, navigation }) {
  const { user } = route.params || {};
  const { theme } = useAppTheme();

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
      outWb.creator = 'Bank Analyzer';
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
    } catch (err) {
      console.error("Download error:", err);
      alert("Failed to download Excel.");
    }
  };

  return (
    <DashboardLayout user={user} activeNav="comparisons" navigation={navigation}>
      <ScrollView style={[dbStyles.main, { backgroundColor: theme.bg }]} contentContainerStyle={dbStyles.mainContent}>
        <Text style={[dbStyles.mainTitle, { color: theme.font }]}>Compare Excel Statements</Text>
        <Text style={dbStyles.mainSub}>Upload Excel file and compare with bank statements</Text>

        <View style={[dbStyles.uploadCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {!compareResults ? (
            <View {...Platform.select({ web: { onDrop: onCompareDrop, onDragOver: onCompareDragOver, onDragLeave: onCompareDragLeave } })}>
              <TouchableOpacity onPress={handlePickCompareFile}>
                <View style={{
                  padding: 20, borderRadius: 12, alignItems: "center",
                  backgroundColor: isCompareDragActive ? (theme.isDark ? "#c7e3d4" : "#e8f5ee") : theme.card,
                  borderWidth: 2, borderStyle: "dashed", borderColor: isCompareDragActive ? theme.businessAccent : theme.border, marginBottom: 20
                }}>
                  <Text style={{ color: theme.font, fontSize: 16, fontWeight: "600" }}>
                    {isCompareDragActive ? "Drop Excel files here..." : "Drag & Drop or Click to Select"}
                  </Text>
                </View>
              </TouchableOpacity>

              {compareFiles.length > 0 && (
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 12, color: theme.muted, fontWeight: "600", marginBottom: 8 }}>
                    Selected Files ({compareFiles.length}):
                  </Text>
                  <ScrollView style={{ maxHeight: 150 }}>
                    {compareFiles.map((file, idx) => (
                      <View key={idx} style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                        backgroundColor: theme.bg, padding: 10, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: theme.border
                      }}>
                        <Text style={{ color: theme.font, fontSize: 14, flex: 1 }} numberOfLines={1}>{file.name}</Text>
                        <TouchableOpacity onPress={() => handleRemoveCompareFile(idx)} style={{ padding: 5 }}>
                          <Text style={{ color: "#e74c3c", fontWeight: "bold" }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              <TouchableOpacity
                style={[styles.button, { width: "100%", backgroundColor: compareFiles.length < 2 ? theme.border : theme.businessAccent }]}
                onPress={handleCompareStatements}
                disabled={compareFiles.length < 2 || isComparing}
              >
                <Text style={styles.buttonText}>{isComparing ? "Processing..." : "Generate Preview"}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[styles.modalTitle, { color: theme.font }]}>Comparison Preview</Text>
              <View style={{ maxHeight: 400, borderWidth: 1, borderColor: theme.border, borderRadius: 8, marginBottom: 20 }}>
                <ScrollView><ScrollView horizontal><View>
                  <View style={{ flexDirection: "row", backgroundColor: theme.sidebar, padding: 10, borderBottomWidth: 1, borderBottomColor: theme.border, minWidth: 400 }}>
                    <Text style={{ width: 150, fontWeight: "bold", color: theme.font, fontSize: 12 }}>Ledger Name</Text>
                    {compareFiles.map((f, i) => (
                      <Text key={i} style={{ width: 100, fontWeight: "bold", color: theme.font, fontSize: 12, textAlign: "right" }} numberOfLines={1}>
                        {f.name || `Bank ${i + 1}`}
                      </Text>
                    ))}
                    <Text style={{ width: 100, fontWeight: "bold", color: theme.font, fontSize: 12, textAlign: "right" }}>Total</Text>
                  </View>
                  {compareResults.map((item, idx) => (
                    <View key={idx} style={{ flexDirection: "row", padding: 10, borderBottomWidth: 1, borderBottomColor: theme.border, minWidth: 400 }}>
                      <Text style={{ width: 150, color: theme.font, fontSize: 12 }} numberOfLines={1}>{item.ledger}</Text>
                      {compareFiles.map((_, i) => (
                        <Text key={i} style={{ width: 100, color: theme.muted, fontSize: 12, textAlign: "right" }}>{item[`b${i}`].toFixed(2)}</Text>
                      ))}
                      <Text style={{ width: 100, color: theme.businessAccent, fontWeight: "bold", fontSize: 12, textAlign: "right" }}>{item.total.toFixed(2)}</Text>
                    </View>
                  ))}
                </View></ScrollView></ScrollView>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: "#e74c3c", marginRight: 10 }]} onPress={() => setCompareResults(null)}>
                  <Text style={styles.buttonText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: theme.businessAccent, marginLeft: 10 }]} onPress={handleDownloadCompareExcel}>
                  <Text style={styles.buttonText}>Download Excel</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </DashboardLayout>
  );
}

function ReportsScreen({ route, navigation }) {
  const { user } = route.params || {};
  const { theme } = useAppTheme();
  return (
    <DashboardLayout user={user} activeNav="reports" navigation={navigation}>
      <View style={[dbStyles.mainContent, { flex: 1, backgroundColor: theme.bg }]}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.font, marginBottom: 20 }}>Previous Reports</Text>
        <Text style={{ color: theme.muted }}>
          No previous reports found.
        </Text>
      </View>
    </DashboardLayout>
  );
}

// --- Navigation ---
function AppContent() {
  const { theme } = useAppTheme();

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Landing"
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.font,
          headerTitleStyle: { fontWeight: "bold", color: theme.font }
        }}
      >
        <Stack.Screen name="Landing" component={LandingWrapper} />

        {/* Dashboard layout screens */}
        <Stack.Screen name="Upload" component={UploadScreen} />
        <Stack.Screen name="Comparisons" component={ComparisonsScreen} />
        <Stack.Screen name="Reports" component={ReportsScreen} />

        {/* Inner data screens (keep headers for back navigation) */}
        <Stack.Screen
          name="Transactions"
          component={TransactionsScreen}
          options={{ headerShown: true, title: "Transactions" }}
        />
        <Stack.Screen
          name="Journal"
          component={JournalScreen}
          options={{ headerShown: true, title: "General Journal" }}
        />
        <Stack.Screen
          name="Ledgers"
          component={LedgersScreen}
          options={{ headerShown: true, title: "Ledgers" }}
        />
        <Stack.Screen
          name="SavingsTransactions"
          component={SavingsTransactionsScreen}
          options={{ headerShown: true, title: "Savings Transactions" }}
        />
        <Stack.Screen name="SavingsReport"
          component={SavingsReportScreen}
          options={{ headerShown: true, title: "Savings Report" }}
        />
        <Stack.Screen name="Tally" component={TallyScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [isDark, setIsDark] = useState(false); // default: light mode
  const theme = isDark ? darkTheme : lightTheme;
  const toggleTheme = () => setIsDark((prev) => !prev);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <AppContent />
    </ThemeContext.Provider>
  );
}

// --- Upload screen profile-card styles ---
const uploadStyles = StyleSheet.create({
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 14,
    ...Platform.select({
      web: { boxShadow: "0 4px 16px rgba(0,0,0,0.08)" },
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 6 },
    }),
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    color: "#1A202C",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  accountBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 4,
  },
  accountBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  profileEmail: {
    color: "#64748b",
    fontSize: 12,
  },
  logoutBtn: {
    borderWidth: 1,
    borderColor: "#e11d4833",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  logoutText: {
    color: "#e11d48",
    fontSize: 12,
    fontWeight: "600",
  },
  uploadHeading: {
    color: "#1A202C",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 4,
  },
  uploadSub: {
    color: "#64748b",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 24,
  },
});

// Removed dbStyles root layout, moved to ThemeAndLayout.js
Object.assign(dbStyles, StyleSheet.create({
  // Upload card
  uploadCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 24,
    ...Platform.select({
      web: { boxShadow: "0 4px 20px rgba(0,0,0,0.08)" },
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 8 },
    }),
  },
  sectionLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  accountTypeBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    backgroundColor: "#F8FAFC",
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  accountTypeTitle: {
    color: "#1A202C",
    fontSize: 15,
    fontWeight: "700",
  },
  accountTypeDesc: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2,
  },

  // Error
  errorBanner: {
    backgroundColor: "#fff5f5",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: "#e11d48",
  },
  errorTitle: {
    color: "#e11d48",
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 4,
  },
  errorDesc: {
    color: "#1A202C",
    fontSize: 13,
    opacity: 0.85,
  },

  // Drop zone
  dropZone: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 28,
    alignItems: "center",
    marginBottom: 20,
    backgroundColor: "#F8FAFC",
  },
  dropZoneTitle: {
    color: "#1A202C",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  dropZoneSub: {
    color: "#64748b",
    fontSize: 12,
    marginBottom: 14,
  },
  browseBtn: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  browseBtnText: {
    color: "#1A202C",
    fontSize: 12,
    fontWeight: "600",
  },

  // Loading
  loadingBox: {
    alignItems: "center",
    padding: 28,
    marginBottom: 20,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: "600",
  },
  progressTrack: {
    width: "80%",
    height: 4,
    backgroundColor: "#E2E8F0",
    borderRadius: 2,
    marginTop: 14,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },

  // Buttons
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 12,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  orDivider: {
    color: "#64748b",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    marginVertical: 10,
    letterSpacing: 1,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  secondaryBtnSub: {
    fontSize: 11,
    marginTop: 2,
  },

  // Feature strip
  featureStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 20,
  },
  featureItem: {
    flex: 1,
    minWidth: 130,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  featureTitle: {
    color: "#1A202C",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },
  featureSub: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 15,
  },

  footerNote: {
    color: "#64748b",
    fontSize: 12,
    textAlign: "center",
    paddingBottom: 20,
  },

  // mainTitle & mainSub
  mainTitle: {
    fontSize: 30,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  mainSub: {
    color: "#64748b",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 28,
  },
}));

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#23232c",
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
    ...Platform.select({ web: { boxShadow: '0 10px 20px rgba(0,0,0,0.05)' }, default: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 3 } }),
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
    ...Platform.select({ web: { boxShadow: '0 8px 12px rgba(43,108,176,0.25)' }, default: { shadowColor: '#2B6CB0', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6 } }),
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
    ...Platform.select({ web: { boxShadow: '0 4px 8px rgba(0,0,0,0.06)' }, default: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 } }),
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
    ...Platform.select({ web: { boxShadow: '0 -4px 8px rgba(0,0,0,0.03)' }, default: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 10 } }),
  },
  entryCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderLeftWidth: 5,
    borderLeftColor: "#3182CE",
    ...Platform.select({ web: { boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }, default: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 } }),
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
    ...Platform.select({ web: { boxShadow: '0 -10px 20px rgba(0,0,0,0.10)' }, default: { shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 20 } }),
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
    ...Platform.select({ web: { boxShadow: '0 10px 20px rgba(0,0,0,0.15)' }, default: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 20 } }),
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
    ...Platform.select({ web: { boxShadow: '0 0 20px rgba(0,0,0,0.06)' }, default: { shadowColor: '#000', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.06, shadowRadius: 20, elevation: 8 } }),
    overflow: "hidden",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#E2E8F0",
  },
});
