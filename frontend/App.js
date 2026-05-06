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
const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.0.4:3000" || "http://10.41.48.38:8081";
const Stack = createNativeStackNavigator();

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
function JournalScreen({ route }) {
  const { entries } = route.params;
  const [entriesData, setEntriesData] = useState(entries);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);

  const CATEGORIES = [
    "Salary", "Rent Income", "GST Payable", "TDS Payable", "Cheque Payable",
    "Loan", "Interest", "Transfer/UPI", "Food", "Shopping",
    "Subscription", "Cash Withdrawal", "Bank Charges", "Misc", "Other"
  ];

  const openCategoryModal = (index) => {
    setEditingIndex(index);
    setModalVisible(true);
  };

  const selectCategory = async (category) => {
    if (editingIndex === null) return;

    const newData = [...entriesData];
    const targetEntry = newData[editingIndex];
    const originalDesc = targetEntry.description;

    // Auto-update others with same description if they are 'Misc'
    newData.forEach((item, i) => {
      if (item.description === originalDesc && (!item.category || item.category.toLowerCase() === "misc")) {
        item.category = category;
        // Also update accounts if they were Misc
        if (item.type === "credit" || item.type === "cr") {
          if (item.creditAccount === "Misc") item.creditAccount = category;
        } else {
          if (item.debitAccount === "Misc") item.debitAccount = category;
        }
      }
    });

    setEntriesData(newData);
    setModalVisible(false);

    // Call backend to learn this mapping for future
    try {
      await fetch(`${API_URL}/update-category`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true"
        },
        body: JSON.stringify({ description: originalDesc, category: category }),
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

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert("Sharing not available", "Cannot share on this device.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to generate or share PDF.");
    }
  };

  const handleDownloadCSV = async () => {
    try {
      // Create CSV format
      let csvContent = "Date,Description,Amount,Type,Category,Entry\n";
      entriesData.forEach((item) => {
        const desc = `"${(item.description || "").replace(/"/g, '""')}"`;
        const entryStr = `"${(item.entry || "").replace(/"/g, '""')}"`;
        const cat = `"${(item.category || "").replace(/"/g, '""')}"`;
        csvContent += `${item.date},${desc},${item.amount},${item.type},${cat},${entryStr}\n`;
      });

      const fileName = `Journal_Entries_${new Date().getTime()}.csv`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: "utf8",
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert("Sharing not available", "Cannot share on this device.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to save or share file.");
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
          {isMisc ? (
            <TouchableOpacity
              style={[styles.badge, styles.editableBadge]}
              onPress={() => openCategoryModal(index)}
            >
              <Text style={{ color: "#856404", fontWeight: "600", fontSize: 12 }}>
                {item.category || "Misc"} ▾
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.category}</Text>
            </View>
          )}
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
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, styles.downloadButton, styles.fullWidthButton]}
          onPress={handleDownloadCSV}
        >
          <Text style={styles.buttonText}>Download / Share CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.button,
            styles.downloadButton,
            styles.fullWidthButton,
            { marginTop: 10, backgroundColor: "#E74C3C" },
          ]}
          onPress={handleDownloadPDF}
        >
          <Text style={styles.buttonText}>Download / Share PDF</Text>
        </TouchableOpacity>
      </View>

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
            <ScrollView>
              {CATEGORIES.map((cat, i) => (
                <TouchableOpacity key={i} style={styles.modalOption} onPress={() => selectCategory(cat)}>
                  <Text style={styles.modalOptionText}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
    alignSelf: "flex-start",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
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
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "75%",
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
  }
});
