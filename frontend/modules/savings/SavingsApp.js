import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, Modal, TextInput, ScrollView, Dimensions } from "react-native";
import { PieChart, BarChart, LineChart } from "react-native-chart-kit";
import { generateSavingsPDF } from "./pdfGenerator/generateSavingsPDF";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://bank-journal-backend.onrender.com" || "http://192.168.0.7:3000";

// 1. Savings Transactions Screen (equivalent to TransactionsScreen) || "http://192.168.0.6:3000" 
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
    const targetTxn = newData[editingIndex];
    const matchString = targetTxn.partyName || targetTxn.narration || targetTxn.description;

    if (matchString) {
      newData.forEach(t => {
        const tMatch = t.partyName || t.narration || t.description;
        if (tMatch === matchString) {
          t.category = category;
        }
      });
    } else {
      targetTxn.category = category;
    }

    setTxns(newData);
    setModalVisible(false);

    // Optionally call update-category here if we want to learn it
    if (matchString) {
      fetch(`${API_URL}/update-category`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true"
        },
        body: JSON.stringify({ description: matchString, category: category, matchType: "all" }),
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
// Helper for neumorphic UI
const NeumorphicView = ({ children, style, inset }) => {
  const shadowStyle = Platform.OS === 'web'
    ? { boxShadow: inset ? 'inset 4px 4px 8px #d1d9e6, inset -4px -4px 8px #ffffff' : '6px 6px 12px #d1d9e6, -6px -6px 12px #ffffff' }
    : {
      boxShadow: '4px 4px 5px rgba(163, 177, 198, 0.5), -4px -4px 5px rgba(255, 255, 255, 0.5)',
    };
  return <View style={[{ backgroundColor: '#E0E5EC', borderRadius: 12 }, shadowStyle, style]}>{children}</View>;
};

export function SavingsReportScreen({ route, navigation }) {
  const { transactions, metadata } = route.params;
  const [localTransactions, setLocalTransactions] = useState(transactions);
  const [currentMetadata, setCurrentMetadata] = useState(metadata || {});

  // Chart Filters
  const [chartFilter, setChartFilter] = useState('All Time');
  const [selectedChartType, setSelectedChartType] = useState('Pie');

  // Category Edit State
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [isLedgersOpen, setIsLedgersOpen] = useState(false);
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
    const targetTxn = newData[editingTxnIndex];
    const matchString = targetTxn.partyName || targetTxn.narration || targetTxn.description;

    if (matchString) {
      newData.forEach(t => {
        const tMatch = t.partyName || t.narration || t.description;
        if (tMatch === matchString) {
          t.category = category;
        }
      });
    } else {
      targetTxn.category = category;
    }

    setLocalTransactions(newData);
    setModalVisible(false);

    // Optionally call update-category here if we want to learn it
    if (matchString) {
      fetch(`${API_URL}/update-category`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true"
        },
        body: JSON.stringify({ description: matchString, category: category, matchType: "all" }),
      }).catch(e => console.log("Failed to learn category mapping", e));
    }
  };


  const handleGeneratePDF = async () => {
    await generateSavingsPDF(pieChartTransactions, currentMetadata, selectedChartType);
  };

  const exportToExcel = () => {
    if (Platform.OS === 'web') {
      const header = "Date,Description,Narration,Party Name,Category,Type,Amount\n";
      const rows = pieChartTransactions.map(t => {
        const desc = (t.description || '').replace(/"/g, '""');
        const nar = (t.narration || '').replace(/"/g, '""');
        const party = (t.partyName || '').replace(/"/g, '""');
        return `"${t.date}","${desc}","${nar}","${party}","${t.category || 'Misc'}","${t.type}","${t.amount}"`;
      }).join("\n");
      
      const csv = header + rows;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "Savings_Transactions.csv");
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      alert("Excel export is supported on Web only for now.");
    }
  };

  const parseDateString = (dateStr) => {
    if (!dateStr) return new Date(0);
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[2].length === 4) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      else if (parts[0].length === 4) return new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
    }
    return new Date(dateStr);
  };

  let pieChartTransactions = localTransactions;
  if (chartFilter !== 'All Time' && localTransactions.length > 0) {
    const dates = localTransactions.map(t => parseDateString(t.date).getTime()).filter(t => !isNaN(t));
    const maxDate = dates.length > 0 ? new Date(Math.max(...dates)) : new Date();

    let filterTime = 0;
    if (chartFilter === '1 Day') filterTime = maxDate.getTime() - (1 * 24 * 60 * 60 * 1000);
    else if (chartFilter === '1 Week') filterTime = maxDate.getTime() - (7 * 24 * 60 * 60 * 1000);
    else if (chartFilter === '1 Month') {
      const m = new Date(maxDate);
      m.setMonth(m.getMonth() - 1);
      filterTime = m.getTime();
    }

    if (chartFilter !== 'Custom') {
      pieChartTransactions = localTransactions.filter(t => parseDateString(t.date).getTime() >= filterTime);
    }
  }

  const totalCredits = pieChartTransactions.filter(t => t.type === 'Credit').reduce((sum, t) => sum + parseFloat(t.amount.replace(/,/g, '')), 0);
  const totalDebits = pieChartTransactions.filter(t => t.type === 'Debit').reduce((sum, t) => sum + parseFloat(t.amount.replace(/,/g, '')), 0);
  const netCashFlow = totalCredits - totalDebits;
  const transactionCount = pieChartTransactions.length;

  const categoryLedger = {};
  pieChartTransactions.forEach(t => {
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
  })).sort((a, b) => b.debit - a.debit);

  const formatCurrency = (val) => {
    return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatShortCurrency = (val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    if (Math.abs(num) >= 1000) return '₹' + (num / 1000).toFixed(1) + 'k';
    return '₹' + num.toFixed(0);
  };

  const savingsRate = totalCredits > 0 ? ((netCashFlow / totalCredits) * 100) : 0;
  let healthScore = 50;
  if (savingsRate > 20) healthScore = 90;
  else if (savingsRate > 10) healthScore = 80;
  else if (savingsRate > 0) healthScore = 72;
  else if (savingsRate > -10) healthScore = 40;
  else healthScore = 20;

  let healthText = "Keep it up! You're managing your finances well.";
  let healthBadge = "Good";
  if (healthScore >= 80) { healthBadge = "Excellent"; healthText = "Outstanding! Your savings rate is exceptional."; }
  else if (healthScore < 50) { healthBadge = "Needs Attention"; healthText = "Your expenses are exceeding your income. Time to review your budget."; }

  // Chart Logic
  const monthlyDataMap = {};
  pieChartTransactions.forEach(t => {
    const dateObj = parseDateString(t.date);
    const month = dateObj.toLocaleString('default', { month: 'short' });
    if (!monthlyDataMap[month]) monthlyDataMap[month] = { credit: 0, debit: 0, net: 0 };
    const amt = parseFloat(t.amount.replace(/,/g, ''));
    if (t.type === 'Credit') monthlyDataMap[month].credit += amt;
    else monthlyDataMap[month].debit += amt;
    monthlyDataMap[month].net = monthlyDataMap[month].credit - monthlyDataMap[month].debit;
  });

  const monthsOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const availableMonths = monthsOrder.filter(m => monthlyDataMap[m]);
  const lineLabels = availableMonths.length > 0 ? availableMonths : ['Jan', 'Feb', 'Mar'];
  const lineCredits = lineLabels.map(m => monthlyDataMap[m] ? monthlyDataMap[m].credit : 0);
  const lineDebits = lineLabels.map(m => monthlyDataMap[m] ? monthlyDataMap[m].debit : 0);
  const lineNet = lineLabels.map(m => monthlyDataMap[m] ? monthlyDataMap[m].net : 0);

  const chartWidth = Dimensions.get("window").width;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
      {/* Top Header */}
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#242c34', marginBottom: 16 }}>Savings Account Summary</Text>
        <TouchableOpacity onPress={handleGeneratePDF} style={{ width: '100%' }}>
          <NeumorphicView style={{ paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#34495e', fontWeight: '600', fontSize: 14 }}>↓ Export / Share PDF</Text>
          </NeumorphicView>
        </TouchableOpacity>
      </View>

      {/* Main Top Card */}
      <NeumorphicView style={{ padding: 24, marginBottom: 24, borderRadius: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
          <View>
            <Text style={{ fontSize: 12, color: '#7f8c8d', fontWeight: '600', marginBottom: 4 }}>Account Holder</Text>
            <TextInput
              style={{ fontSize: 18, fontWeight: 'bold', color: '#242c34', outlineStyle: 'none', padding: 0 }}
              value={currentMetadata.holderName || ''}
              placeholder="Enter Name"
              onChangeText={(text) => setCurrentMetadata({ ...currentMetadata, holderName: text })}
            />
          </View>
          <NeumorphicView style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, height: 32, justifyContent: 'center' }}>
            <Text style={{ color: '#34495e', fontSize: 13, fontWeight: '600' }}>📅 {chartFilter} v</Text>
          </NeumorphicView>
        </View>

        {/* Metrics Row */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 24 }}>
          {[
            { title: 'Total Credits', value: formatCurrency(totalCredits), sub: '100% of inflow', icon: '↓' },
            { title: 'Total Debits', value: formatCurrency(totalDebits), sub: '100% of outflow', icon: '↑' },
            { title: 'Net Cash Flow', value: formatCurrency(netCashFlow), sub: netCashFlow >= 0 ? 'Positive ✓' : 'Negative ✗', icon: '💼' },
            { title: 'Transaction Count', value: transactionCount.toString(), sub: 'Total Transactions', icon: '⏱' }
          ].map((metric, i) => (
            <NeumorphicView key={i} style={{ width: '48%', padding: 16, borderRadius: 12, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#EBECF0', justifyContent: 'center', alignItems: 'center', marginRight: 8, ...Platform.select({ web: { boxShadow: 'inset 2px 2px 5px #d1d9e6, inset -2px -2px 5px #ffffff' } }) }}>
                  <Text style={{ color: '#7f8c8d', fontSize: 12 }}>{metric.icon}</Text>
                </View>
                <Text style={{ fontSize: 11, color: '#34495e', fontWeight: '600' }} numberOfLines={1}>{metric.title}</Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#242c34', marginBottom: 2 }} numberOfLines={1}>{metric.value}</Text>
              <Text style={{ fontSize: 12, color: '#7f8c8d' }}>--</Text>
              <Text style={{ fontSize: 10, color: '#95a5a6', marginTop: 2 }}>{metric.sub}</Text>
            </NeumorphicView>
          ))}
        </View>

        {/* Health Section */}
        <NeumorphicView inset={true} style={{ padding: 20, borderRadius: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 6, borderColor: '#bdc3c7', justifyContent: 'center', alignItems: 'center', marginRight: 20 }}>
            <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#242c34' }}>{healthScore}</Text>
            <Text style={{ fontSize: 10, color: '#7f8c8d' }}>/100</Text>
          </View>

          <View style={{ flex: 1, minWidth: 200, marginRight: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#242c34', marginRight: 10 }}>Savings Health</Text>
              <View style={{ backgroundColor: '#e2e8f0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 11, color: '#7f8c8d', fontWeight: '600' }}>{healthBadge}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, color: '#34495e', lineHeight: 20 }}>{healthText}</Text>
          </View>

          <View style={{ borderLeftWidth: 1, borderLeftColor: '#d1d9e6', paddingLeft: 20 }}>
            <Text style={{ fontSize: 13, color: '#7f8c8d', fontWeight: '500', marginBottom: 4 }}>Savings Rate</Text>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#242c34', marginBottom: 2 }}>{savingsRate.toFixed(2)}%</Text>
            <Text style={{ fontSize: 11, color: '#95a5a6' }}>(Net Cash Flow / Credits)</Text>
          </View>
        </NeumorphicView>
      </NeumorphicView>


      {/* Bottom Row Filters */}
      <View style={{ marginTop: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#242c34' }}>Filter Breakdown</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={exportToExcel}>
              <NeumorphicView style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: '#27ae60', fontWeight: 'bold', fontSize: 11 }}>📊 Export Excel</Text>
              </NeumorphicView>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleGeneratePDF}>
              <NeumorphicView style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: '#242c34', fontWeight: 'bold', fontSize: 11 }}>↓ Download PDF</Text>
              </NeumorphicView>
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {['All Time', '1 Month', '1 Week', '1 Day', 'Custom'].map(f => (
            <TouchableOpacity key={f} onPress={() => setChartFilter(f)}>
              <NeumorphicView inset={chartFilter === f} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
                <Text style={{ color: '#34495e', fontWeight: '600', fontSize: 11 }}>{f}</Text>
              </NeumorphicView>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Category Ledgers */}
      <TouchableOpacity activeOpacity={0.7} onPress={() => setIsLedgersOpen(!isLedgersOpen)}>
        <NeumorphicView style={{ padding: 16, borderRadius: 12, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: "#242c34" }}>Category Ledgers</Text>
          <Text style={{ fontSize: 16, color: '#7f8c8d', fontWeight: 'bold' }}>{isLedgersOpen ? '↑' : '↓'}</Text>
        </NeumorphicView>
      </TouchableOpacity>

      {isLedgersOpen && (
        <View style={{ marginBottom: 24 }}>
          {ledgerArray.map((item, index) => (
            <TouchableOpacity
              key={index}
              activeOpacity={0.7}
              onPress={() => setExpandedCategory(expandedCategory === item.name ? null : item.name)}
            >
              <NeumorphicView style={{ padding: 16, borderRadius: 12, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#34495e' }}>{item.name}</Text>
                  <Text style={{ fontSize: 14, color: '#7f8c8d' }}>{item.count} txns</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
                  <Text style={{ fontSize: 14, color: '#27ae60', fontWeight: '500' }}>In: ₹{item.credit.toFixed(2)}</Text>
                  <Text style={{ fontSize: 14, color: '#e74c3c', fontWeight: '500' }}>Out: ₹{item.debit.toFixed(2)}</Text>
                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: item.netFlow >= 0 ? '#27ae60' : '#e74c3c' }}>Net: ₹{item.netFlow.toFixed(2)}</Text>
                </View>

                {expandedCategory === item.name && (
                  <View style={{ marginTop: 15, borderTopWidth: 1, borderTopColor: '#d1d9e6', paddingTop: 10 }}>
                    {pieChartTransactions.filter(t => (t.category || "Misc") === item.name).map((t, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => openCategoryModal(t)}
                        style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(209, 217, 230, 0.4)', alignItems: 'center' }}
                      >
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={{ fontSize: 12, color: '#7f8c8d', marginBottom: 2 }}>{t.date}</Text>
                          <Text style={{ fontSize: 13, color: '#242c34' }}>{t.narration}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={{ fontSize: 13, fontWeight: 'bold', color: t.type === 'Credit' ? '#27ae60' : '#e74c3c', marginRight: 12 }}>
                            {t.type === 'Credit' ? '+' : '-'}₹{t.amount}
                          </Text>
                          <NeumorphicView style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: '#7ebcf9', fontWeight: 'bold' }}>EDIT</Text>
                          </NeumorphicView>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </NeumorphicView>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Middle Row Charts */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginBottom: 24 }}>
        {/* Top Expenses (Bar) */}
        <NeumorphicView style={{ flex: 1, minWidth: 320, padding: 24, borderRadius: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#242c34' }}>Top Expenses (Bar)</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 220, paddingTop: 30, minWidth: 300, justifyContent: 'space-around', flex: 1 }}>
              {ledgerArray.filter(l => l.debit > 0).slice(0, 5).map((l, i) => {
                const maxDebit = Math.max(...ledgerArray.filter(x => x.debit > 0).slice(0, 5).map(x => x.debit));
                const barHeight = maxDebit > 0 ? (l.debit / maxDebit) * 140 : 0;
                const barColor = ["#288cfa", "#e74c3c", "#f39c12", "#27ae60", "#8e44ad"][i % 5];
                
                return (
                  <View key={i} style={{ alignItems: 'center', width: 60, marginHorizontal: 10 }}>
                    <Text style={{ fontSize: 11, color: '#34495e', fontWeight: 'bold', marginBottom: 6 }} numberOfLines={1}>
                      {formatShortCurrency(l.debit)}
                    </Text>
                    <View style={{ 
                      width: 36, 
                      height: barHeight, 
                      backgroundColor: barColor, 
                      borderRadius: 6, 
                      ...Platform.select({ web: { boxShadow: '2px 2px 6px #d1d9e6, -2px -2px 6px #ffffff' } }) 
                    }} />
                    <Text style={{ 
                      fontSize: 10, 
                      color: '#7f8c8d', 
                      fontWeight: '600', 
                      marginTop: 12, 
                      transform: [{ rotate: '-25deg' }], 
                      width: 70, 
                      textAlign: 'center' 
                    }} numberOfLines={1}>
                      {l.name}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </NeumorphicView>

        {/* Expense Breakdown (Pie) */}
        <NeumorphicView style={{ flex: 1, minWidth: 320, padding: 24, borderRadius: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#242c34' }}>Expense Breakdown (Pie)</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'relative' }}>
              <PieChart
                data={ledgerArray.filter(l => l.debit > 0).slice(0, 5).map((l, i) => ({
                  name: '',
                  population: l.debit,
                  color: ["#7f8c8d", "#95a5a6", "#bdc3c7", "#d35400", "#c0392b"][i % 5],
                  legendFontColor: "#7F7F7F",
                  legendFontSize: 12
                }))}
                width={180}
                height={180}
                chartConfig={{ color: () => '#000' }}
                accessor={"population"}
                backgroundColor={"transparent"}
                paddingLeft={"45"}
                hasLegend={false}
                absolute
              />
              {/* Donut hole hack */}
              <View style={{ position: 'absolute', top: 50, left: 50, width: 80, height: 80, borderRadius: 40, backgroundColor: '#EBECF0', ...Platform.select({ web: { boxShadow: 'inset 4px 4px 8px #d1d9e6, inset -4px -4px 8px #ffffff' } }) }} />
            </View>

            <View style={{ marginLeft: 20, flex: 1 }}>
              {ledgerArray.filter(l => l.debit > 0).slice(0, 5).map((l, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: ["#7f8c8d", "#95a5a6", "#bdc3c7", "#d35400", "#c0392b"][i % 5], marginRight: 10 }} />
                    <Text style={{ fontSize: 13, color: '#242c34', fontWeight: '600', maxWidth: 100 }} numberOfLines={1}>{l.name}</Text>
                  </View>
                  <Text style={{ fontSize: 13, color: '#34495e' }}>{formatCurrency(l.debit)} ({((l.debit / totalDebits) * 100).toFixed(2)}%)</Text>
                </View>
              ))}
            </View>
          </View>
        </NeumorphicView>
      </View>




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

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EBECF0",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#242c34",
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
    boxShadow: '0px 2px 4px rgba(0,0,0,0.05)',
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
    color: "#242c34",
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
    color: "#288cfa",
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
    backgroundColor: "#288cfa",
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
    color: "#242c34",
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
    color: "#242c34",
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
