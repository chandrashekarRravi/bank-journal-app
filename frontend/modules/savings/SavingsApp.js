import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, Modal, TextInput, ScrollView, Dimensions } from "react-native";
import { PieChart } from "react-native-chart-kit";
import { generateSavingsPDF } from "./pdfGenerator/generateSavingsPDF";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.0.6:3000" || "https://bank-journal-backend.onrender.com";

// 1. Savings Transactions Screen (equivalent to TransactionsScreen)
export function SavingsTransactionsScreen({ route, navigation }) {
  const { transactions, metadata } = route.params;
  const [txns, setTxns] = useState(transactions);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [customCategories, setCustomCategories] = useState([
    "Income", "Salary", "Interest", "UPI Receipt", "Transfer", "ATM", "Bank Charges", "Food & Dining", "Shopping", "Entertainment", "UPI Payment", "Misc", "Other"
  ]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newCategoryText, setNewCategoryText] = useState("");

  const openCategoryModal = (index) => {
    setEditingIndex(index);
    setIsAddingNew(false);
    setNewCategoryText("");
    setModalVisible(true);
  };

  const selectCategory = (category) => {
    if (editingIndex === null) return;

    const newData = [...txns];
    newData[editingIndex].category = category;
    setTxns(newData);
    setModalVisible(false);

    // Optionally call update-category here if we want to learn it
    const desc = newData[editingIndex].partyName || newData[editingIndex].description;
    if (desc) {
      fetch(`${API_URL}/update-category`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true"
        },
        body: JSON.stringify({ description: desc, category: category, matchType: "all" }),
      }).catch(e => console.log("Failed to learn category mapping", e));
    }
  };

  const renderItem = ({ item, index }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardDate}>{item.date}</Text>
        <Text
          style={[
            styles.cardAmount,
            item.type === "Credit" ? styles.creditText : styles.debitText,
          ]}
        >
          ₹{item.amount} ({item.type === "Credit" ? "Cr" : "Dr"})
        </Text>
      </View>
      <Text style={styles.cardPartyName}>{item.partyName || 'Unknown Party'}</Text>
      <Text style={styles.cardDesc}>{item.description}</Text>
      <View style={styles.badgeContainer}>
        <TouchableOpacity style={styles.badge} onPress={() => openCategoryModal(index)}>
          <Text style={styles.badgeText}>{item.category || "Misc"} ▾</Text>
        </TouchableOpacity>
        <Text style={[
          styles.narrationText,
          item.type === "Credit" && { color: "#27AE60" }
        ]}>{item.narration}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>
        Categorized Savings Transactions ({txns.length})
      </Text>
      <FlatList
        data={txns}
        renderItem={renderItem}
        keyExtractor={(item, index) => index.toString()}
        contentContainerStyle={styles.listContent}
      />
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, styles.fullWidthButton]}
          onPress={() => navigation.navigate("SavingsReport", { transactions: txns, metadata })}
        >
          <Text style={styles.buttonText}>Generate Savings Report</Text>
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
                        newArr.splice(newArr.length - 1, 0, newCat);
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
    </View>
  );
}

// 2. Savings Report Screen (shows summary and PDF options)
export function SavingsReportScreen({ route, navigation }) {
  const { transactions, metadata } = route.params;
  const [localTransactions, setLocalTransactions] = useState(transactions);
  const [currentMetadata, setCurrentMetadata] = useState(metadata || {});
  const [expandedCategory, setExpandedCategory] = useState(null);

  // Category Edit State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTxnIndex, setEditingTxnIndex] = useState(null);
  const [customCategories, setCustomCategories] = useState([
    "Income", "Salary", "Interest", "UPI Receipt", "Transfer", "ATM", "Bank Charges", "Food & Dining", "Shopping", "Entertainment", "UPI Payment", "Misc", "Other"
  ]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newCategoryText, setNewCategoryText] = useState("");

  const openCategoryModal = (txn) => {
    const index = localTransactions.findIndex(x => x === txn);
    setEditingTxnIndex(index);
    setIsAddingNew(false);
    setNewCategoryText("");
    setModalVisible(true);
  };

  const selectCategory = (category) => {
    if (editingTxnIndex === null) return;
    const newData = [...localTransactions];
    newData[editingTxnIndex].category = category;
    setLocalTransactions(newData);
    setModalVisible(false);
  };

  const handleGeneratePDF = async () => {
    await generateSavingsPDF(localTransactions, currentMetadata);
  };

  const totalCredits = localTransactions.filter(t => t.type === 'Credit').reduce((sum, t) => sum + parseFloat(t.amount.replace(/,/g, '')), 0);
  const totalDebits = localTransactions.filter(t => t.type === 'Debit').reduce((sum, t) => sum + parseFloat(t.amount.replace(/,/g, '')), 0);
  const netCashFlow = totalCredits - totalDebits;

  const categoryLedger = {};
  localTransactions.forEach(t => {
    const cat = t.category || "Misc";
    if (!categoryLedger[cat]) categoryLedger[cat] = { credit: 0, debit: 0, count: 0 };
    const amt = parseFloat(t.amount.replace(/,/g, ''));
    if (t.type === 'Credit') categoryLedger[cat].credit += amt;
    else categoryLedger[cat].debit += amt;
    categoryLedger[cat].count += 1;
  });
  const ledgerArray = Object.keys(categoryLedger).map(cat => ({
    name: cat,
    ...categoryLedger[cat],
    netFlow: categoryLedger[cat].credit - categoryLedger[cat].debit
  })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Savings Account Summary</Text>

      <View style={styles.summaryCard}>
        <Text style={{ fontSize: 13, color: "#7F8C8D", marginBottom: 5, fontWeight: 'bold' }}>ACCOUNT HOLDER NAME (APPEARS ON PDF)</Text>
        <TextInput
          style={{
            borderWidth: 1, borderColor: '#bdc3c7', borderRadius: 6, padding: 10, fontSize: 16, backgroundColor: '#fff', color: '#2c3e50', marginBottom: 15
          }}
          value={currentMetadata.holderName || ''}
          onChangeText={(text) => setCurrentMetadata({ ...currentMetadata, holderName: text })}
          placeholder="Enter Name"
        />

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Credits:</Text>
          <Text style={styles.creditText}>₹{totalCredits.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Debits:</Text>
          <Text style={styles.debitText}>₹{totalDebits.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Net Cash Flow:</Text>
          <Text style={{ ...styles.summaryValue, color: netCashFlow >= 0 ? '#27ae60' : '#e74c3c' }}>₹{netCashFlow.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Transaction Count:</Text>
          <Text style={styles.summaryValue}>{localTransactions.length}</Text>
        </View>
      </View>

      <Text style={{ fontSize: 18, fontWeight: "bold", color: "#2C3E50", marginHorizontal: 20, marginTop: 10, marginBottom: 10 }}>Category Ledgers</Text>
      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
        {ledgerArray.map((item, index) => (
          <TouchableOpacity
            key={index}
            activeOpacity={0.7}
            onPress={() => setExpandedCategory(expandedCategory === item.name ? null : item.name)}
            style={{ backgroundColor: "#fff", padding: 15, borderRadius: 10, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#34495e' }}>{item.name}</Text>
              <Text style={{ fontSize: 14, color: '#7f8c8d' }}>{item.count} txns</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
              <Text style={{ fontSize: 14, color: '#27ae60' }}>In: ₹{item.credit.toFixed(2)}</Text>
              <Text style={{ fontSize: 14, color: '#e74c3c' }}>Out: ₹{item.debit.toFixed(2)}</Text>
              <Text style={{ fontSize: 14, fontWeight: 'bold', color: item.netFlow >= 0 ? '#27ae60' : '#e74c3c' }}>Net: ₹{item.netFlow.toFixed(2)}</Text>
            </View>

            {expandedCategory === item.name && (
              <View style={{ marginTop: 15, borderTopWidth: 1, borderTopColor: '#ecf0f1', paddingTop: 10 }}>
                {localTransactions.filter(t => (t.category || "Misc") === item.name).map((t, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => openCategoryModal(t)}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f9f9f9', alignItems: 'center' }}
                  >
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={{ fontSize: 12, color: '#7f8c8d', marginBottom: 2 }}>{t.date}</Text>
                      <Text style={{ fontSize: 13, color: '#2c3e50' }}>{t.narration}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: 'bold', color: t.type === 'Credit' ? '#27ae60' : '#e74c3c', marginRight: 10 }}>
                        {t.type === 'Credit' ? '+' : '-'}₹{t.amount}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#3498db', fontWeight: 'bold' }}>EDIT</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </TouchableOpacity>
        ))}

        {/* Pie Chart Section */}
        {ledgerArray.length > 0 && (
          <View style={{ backgroundColor: "#fff", padding: 15, borderRadius: 10, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 }}>
            <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#34495e', marginBottom: 10, textAlign: 'center' }}>Expense Breakdown</Text>
            <PieChart
              data={ledgerArray.filter(l => l.debit > 0).map((l, i) => ({
                name: l.name,
                population: l.debit,
                color: ["#e74c3c", "#f39c12", "#8e44ad", "#2980b9", "#d35400", "#c0392b", "#16a085"][i % 7],
                legendFontColor: "#7F7F7F",
                legendFontSize: 12
              }))}
              width={Dimensions.get("window").width - 70}
              height={200}
              chartConfig={{
                backgroundColor: "#fff",
                backgroundGradientFrom: "#fff",
                backgroundGradientTo: "#fff",
                color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
              }}
              accessor={"population"}
              backgroundColor={"transparent"}
              paddingLeft={"15"}
              absolute
            />
          </View>
        )}
      </ScrollView>

      {/* Category Modal */}
      <Modal visible={modalVisible} transparent={true} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Update Category</Text>
            {isAddingNew ? (
              <View style={{ width: '100%' }}>
                <TextInput style={styles.input} placeholder="Enter new category" value={newCategoryText} onChangeText={setNewCategoryText} autoFocus />
                <TouchableOpacity
                  style={[styles.button, styles.fullWidthButton, { marginTop: 10 }]}
                  onPress={() => {
                    const newCat = newCategoryText.trim();
                    if (newCat) {
                      setCustomCategories(prev => {
                        const newArr = [...prev];
                        newArr.splice(newArr.length - 1, 0, newCat);
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
                    if (cat === "Other") setIsAddingNew(true);
                    else selectCategory(cat);
                  }}>
                    <Text style={styles.modalOptionText}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.modalCancel} onPress={() => {
              if (isAddingNew) setIsAddingNew(false);
              else setModalVisible(false);
            }}>
              <Text style={styles.modalCancelText}>{isAddingNew ? "Back" : "Cancel"}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.button} onPress={handleGeneratePDF}>
          <Text style={styles.buttonText}>Download / Share PDF</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2C3E50",
    padding: 20,
    textAlign: "center",
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardDate: {
    fontSize: 14,
    color: "#7F8C8D",
    fontWeight: "600",
  },
  cardAmount: {
    fontSize: 16,
    fontWeight: "bold",
  },
  creditText: {
    color: "#27AE60",
  },
  debitText: {
    color: "#E74C3C",
  },
  cardPartyName: {
    fontSize: 16,
    color: "#2C3E50",
    fontWeight: "bold",
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 14,
    color: "#34495E",
    marginBottom: 12,
  },
  badgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    backgroundColor: "#E8F4FD",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: "#4A90E2",
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  narrationText: {
    fontSize: 12,
    color: "#7F8C8D",
    fontStyle: "italic",
    flex: 1,
  },
  footer: {
    padding: 20,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderColor: "#E0E0E0",
  },
  button: {
    backgroundColor: "#4A90E2",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  fullWidthButton: {
    width: "100%",
  },
  buttonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  summaryCard: {
    backgroundColor: "#FFF",
    margin: 20,
    padding: 20,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  summaryLabel: {
    fontSize: 16,
    color: "#34495E",
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: 16,
    color: "#2C3E50",
    fontWeight: "bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    color: "#2C3E50",
    textAlign: "center",
  },
  modalOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  modalOptionText: {
    fontSize: 16,
    color: "#34495E",
    textAlign: "center",
  },
  modalCancel: {
    marginTop: 16,
    paddingVertical: 14,
    backgroundColor: "#F8D7DA",
    borderRadius: 8,
  },
  modalCancelText: {
    color: "#721C24",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E0",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 10,
    backgroundColor: "#F8FAFC",
  }
});
