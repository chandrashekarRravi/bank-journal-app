import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, Modal, TextInput, ScrollView, Dimensions } from "react-native";
import { PieChart, BarChart, LineChart } from "react-native-chart-kit";
import { generateSavingsPDF } from "./pdfGenerator/generateSavingsPDF";
// ExcelJS is web-only — lazy require to avoid native crash
const ExcelJS = Platform.OS === 'web' ? require('exceljs/dist/exceljs.min.js') : null;
import * as DocumentPicker from 'expo-document-picker';
import { DashboardLayout, useAppTheme } from "../../ThemeAndLayout";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://bank-journal-backend.onrender.com" || "http://192.168.0.7:3000";

// 1. Savings Transactions Screen (equivalent to TransactionsScreen) || "http://192.168.0.6:3000" 
export function SavingsTransactionsScreen({ route, navigation }) {
  const { transactions, metadata, user } = route.params || {};
  const [txns, setTxns] = useState(transactions);
  const { theme } = useAppTheme();

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
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, flex: 1, margin: 6 }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardDate, { color: theme.muted }]}>{item.date}</Text>
        <Text style={[styles.cardAmount, item.type === "Credit" ? styles.creditText : styles.debitText]}>
          ₹{item.amount} ({item.type === "Credit" ? "Cr" : "Dr"})
        </Text>
      </View>
      <Text style={[styles.cardPartyName, { color: theme.font }]} numberOfLines={1}>{item.partyName || 'Unknown'}</Text>
      <Text style={[styles.cardDesc, { color: theme.muted }]} numberOfLines={2}>{item.description}</Text>
      <TouchableOpacity style={styles.badge} onPress={() => openCategoryModal(index)}>
        <Text style={styles.badgeText}>{item.category || "Misc"} ▾</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <DashboardLayout user={user} activeNav="transactions" navigation={navigation}>
      <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: 20 }]}>
        <Text style={[styles.headerTitle, { color: theme.font }]}>
          Categorized Savings Transactions ({txns?.length || 0})
        </Text>
        <FlatList
          data={txns}
          renderItem={renderItem}
          keyExtractor={(item, index) => index.toString()}
          numColumns={3}
          columnWrapperStyle={{ paddingHorizontal: 10 }}
          contentContainerStyle={{ paddingVertical: 10 }}
        />
        <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.button, styles.fullWidthButton, { backgroundColor: theme.green }]}
          onPress={() => navigation.navigate("SavingsReport", { transactions: txns, metadata, user })}
        >
          <Text style={[styles.buttonText, { color: theme.textGreen }]}>Generate Savings Report</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.fullWidthButton, { backgroundColor: theme.savingsAccent + "18", borderWidth: 1.5, borderColor: theme.savingsAccent, marginTop: 8 }]}
          onPress={() => navigation.navigate("Tally", { user: { ...user, type: "savings" } })}
        >
          <Text style={[styles.buttonText, { color: theme.savingsAccent }]}>📊 Export to Tally</Text>
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
    </DashboardLayout>
  );
}

// 2. Savings Report Screen (shows summary and PDF options)
// Helper for neumorphic UI
const NeumorphicView = ({ children, style, inset, theme }) => {
  const isDark = theme?.isDark;
  const bg = isDark ? (theme?.card || '#2c2c38') : '#E0E5EC';
  const s1 = isDark ? 'rgba(0,0,0,0.4)' : '#d1d9e6';
  const s2 = isDark ? 'rgba(255,255,255,0.04)' : '#ffffff';
  const shadowStyle = Platform.OS === 'web'
    ? { boxShadow: inset ? `inset 4px 4px 8px ${s1}, inset -4px -4px 8px ${s2}` : `4px 4px 12px ${s1}, -4px -4px 12px ${s2}` }
    : {};
  return <View style={[{ backgroundColor: bg, borderRadius: 12 }, shadowStyle, style]}>{children}</View>;
};

export function SavingsReportScreen({ route, navigation }) {
  const { transactions, metadata, user } = route.params || {};
  const [localTransactions, setLocalTransactions] = useState(transactions);
  const [currentMetadata, setCurrentMetadata] = useState(metadata || {});
  const { theme } = useAppTheme();

  // Chart Filters
  const [chartFilter, setChartFilter] = useState('All Time');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
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
    await generateSavingsPDF(pieChartTransactions, currentMetadata, 'Bar');
  };

  const exportToExcel = async () => {
    if (Platform.OS === 'web') {
      try {
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Savings App';

        // 1. Group transactions by Party Name (Ledgers)
        const ledgers = {};
        pieChartTransactions.forEach(t => {
          const party = t.partyName || 'Misc';
          if (!ledgers[party]) ledgers[party] = [];
          ledgers[party].push({
            Date: t.date,
            Description: t.description || '',
            Narration: t.narration || '',
            'Party Name': party,
            Category: t.category || 'Misc',
            Type: t.type,
            Amount: parseFloat((t.amount || '0').toString().replace(/,/g, ''))
          });
        });

        // 2. Create Master Sheet with all transactions
        const wsMaster = wb.addWorksheet("All Transactions");
        wsMaster.columns = [
          { header: 'Date', key: 'Date', width: 15 },
          { header: 'Description', key: 'Description', width: 20 },
          { header: 'Narration', key: 'Narration', width: 30 },
          { header: 'Party Name', key: 'Party Name', width: 25 },
          { header: 'Category', key: 'Category', width: 15 },
          { header: 'Type', key: 'Type', width: 10 },
          { header: 'Amount', key: 'Amount', width: 15 }
        ];

        pieChartTransactions.forEach(t => {
          wsMaster.addRow({
            Date: t.date,
            Description: t.description || '',
            Narration: t.narration || '',
            'Party Name': t.partyName || 'Misc',
            Category: t.category || 'Misc',
            Type: t.type,
            Amount: parseFloat((t.amount || '0').toString().replace(/,/g, ''))
          });
        });
        wsMaster.getRow(1).font = { bold: true };

        // --- CHART GENERATION (QuickChart) ---
        // Grab top 5 expenses to show as a bar chart
        const debitData = Object.keys(ledgers).reduce((arr, key) => {
           let debitSum = ledgers[key].filter(x => x.Type === 'Debit').reduce((sum, item) => sum + item.Amount, 0);
           if (debitSum > 0) arr.push({ name: key, debit: debitSum });
           return arr;
        }, []).sort((a,b) => b.debit - a.debit).slice(0, 5);

        if (debitData.length > 0) {
          const chartConfig = {
            type: 'bar',
            data: {
              labels: debitData.map(d => d.name.substring(0, 15)),
              datasets: [{
                label: 'Top Expenses (₹)',
                data: debitData.map(d => d.debit),
                backgroundColor: 'rgba(231, 76, 60, 0.8)'
              }]
            },
            options: { title: { display: true, text: 'Top 5 Expense Ledgers' } }
          };

          const quickChartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=500&h=300`;
          
          try {
            const response = await fetch(quickChartUrl);
            const arrayBuffer = await response.arrayBuffer();
            const imageId = wb.addImage({
              buffer: arrayBuffer,
              extension: 'png',
            });
            // Place the chart next to the data table (Column I)
            wsMaster.addImage(imageId, {
              tl: { col: 8, row: 1 },
              ext: { width: 500, height: 300 }
            });
          } catch (chartErr) {
            console.warn("Could not fetch chart image from quickchart.io:", chartErr);
          }
        }

        // 3. Create a separate sheet for each unique ledger
        const usedNames = new Set();
        usedNames.add("all transactions"); // the master sheet
        
        Object.keys(ledgers).forEach(party => {
          let sheetName = party.replace(/[\/\?\*\[\]\\:]/g, '').trim().substring(0, 31);
          if (!sheetName) sheetName = "Unknown";
          
          let finalName = sheetName;
          let counter = 1;
          while (usedNames.has(finalName.toLowerCase())) {
            const suffix = `_${counter}`;
            finalName = sheetName.substring(0, 31 - suffix.length) + suffix;
            counter++;
          }

          usedNames.add(finalName.toLowerCase());
          const ws = wb.addWorksheet(finalName);
          ws.columns = wsMaster.columns;
          ledgers[party].forEach(row => ws.addRow(row));
          ws.getRow(1).font = { bold: true };
        });

        // 4. Download file
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const FileSaver = require('file-saver');
        FileSaver.saveAs(blob, "Savings_Ledgers.xlsx");
      } catch (err) {
        console.error("Error exporting to Excel:", err);
        alert("Failed to export Excel. See console for details.");
      }
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
    } else {
      let filtered = localTransactions;
      if (customStartDate) {
        const start = parseDateString(customStartDate).getTime();
        if (!isNaN(start)) filtered = filtered.filter(t => parseDateString(t.date).getTime() >= start);
      }
      if (customEndDate) {
        const end = parseDateString(customEndDate).getTime();
        if (!isNaN(end)) filtered = filtered.filter(t => parseDateString(t.date).getTime() <= end + 86400000);
      }
      pieChartTransactions = filtered;
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

  const [chartContainerWidth, setChartContainerWidth] = React.useState(Dimensions.get('window').width - 80);

  return (
    <DashboardLayout user={user} activeNav="reports" navigation={navigation}>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.bg }]}
        contentContainerStyle={{ padding: 24, paddingBottom: 60 }}
        onLayout={e => setChartContainerWidth(e.nativeEvent.layout.width - 48)}
      >
      {/* Top Header */}
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: theme.font, marginBottom: 16 }}>Savings Account Summary</Text>
        <TouchableOpacity onPress={handleGeneratePDF} style={{ width: '100%' }}>
          <NeumorphicView theme={theme} style={{ paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: theme.green, fontWeight: '600', fontSize: 14 }}>↓ Export / Share PDF</Text>
          </NeumorphicView>
        </TouchableOpacity>
      </View>

      {/* Main Top Card */}
      <NeumorphicView theme={theme} style={{ padding: 24, marginBottom: 24, borderRadius: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
          <View>
            <Text style={{ fontSize: 12, color: theme.muted, fontWeight: '600', marginBottom: 4 }}>Account Holder</Text>
            <TextInput
              style={{ fontSize: 18, fontWeight: 'bold', color: theme.font, outlineStyle: 'none', padding: 0 }}
              value={currentMetadata.holderName || ''}
              placeholder="Enter Name"
              placeholderTextColor={theme.muted}
              onChangeText={(text) => setCurrentMetadata({ ...currentMetadata, holderName: text })}
            />
          </View>
          <NeumorphicView theme={theme} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, height: 32, justifyContent: 'center' }}>
            <Text style={{ color: theme.font, fontSize: 13, fontWeight: '600' }}>📅 {chartFilter} v</Text>
          </NeumorphicView>
        </View>

        {/* Metrics Row */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 24 }}>
          {[
            { title: 'Total Credits', value: formatCurrency(totalCredits), sub: '100% of inflow', icon: '↓', color: theme.green },
            { title: 'Total Debits', value: formatCurrency(totalDebits), sub: '100% of outflow', icon: '↑', color: theme.pink },
            { title: 'Net Cash Flow', value: formatCurrency(netCashFlow), sub: netCashFlow >= 0 ? 'Positive ✓' : 'Negative ✗', icon: '💼', color: theme.yellow },
            { title: 'Transaction Count', value: transactionCount.toString(), sub: 'Total Transactions', icon: '⏱', color: theme.purple }
          ].map((metric, i) => (
            <NeumorphicView theme={theme} key={i} style={{ width: '48%', padding: 16, borderRadius: 12, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: metric.color + '22', justifyContent: 'center', alignItems: 'center', marginRight: 8 }}>
                  <Text style={{ color: metric.color, fontSize: 13 }}>{metric.icon}</Text>
                </View>
                <Text style={{ fontSize: 11, color: theme.muted, fontWeight: '600' }} numberOfLines={1}>{metric.title}</Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: metric.color, marginBottom: 2 }} numberOfLines={1}>{metric.value}</Text>
              <Text style={{ fontSize: 10, color: theme.muted, marginTop: 2 }}>{metric.sub}</Text>
            </NeumorphicView>
          ))}
        </View>

        {/* Health Section */}
        <NeumorphicView theme={theme} inset={true} style={{ padding: 20, borderRadius: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: theme.green, justifyContent: 'center', alignItems: 'center', marginRight: 20 }}>
            <Text style={{ fontSize: 22, fontWeight: 'bold', color: theme.green }}>{healthScore}</Text>
            <Text style={{ fontSize: 10, color: theme.muted }}>/100</Text>
          </View>

          <View style={{ flex: 1, minWidth: 200, marginRight: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.font, marginRight: 10 }}>Savings Health</Text>
              <View style={{ backgroundColor: theme.green + '22', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 11, color: theme.green, fontWeight: '600' }}>{healthBadge}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, color: theme.muted, lineHeight: 20 }}>{healthText}</Text>
          </View>

          <View style={{ borderLeftWidth: 1, borderLeftColor: theme.border, paddingLeft: 20 }}>
            <Text style={{ fontSize: 13, color: theme.muted, fontWeight: '500', marginBottom: 4 }}>Savings Rate</Text>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: theme.green, marginBottom: 2 }}>{savingsRate.toFixed(2)}%</Text>
            <Text style={{ fontSize: 11, color: theme.muted }}>(Net Cash Flow / Credits)</Text>
          </View>
        </NeumorphicView>
      </NeumorphicView>


      {/* Bottom Row Filters */}
      <View style={{ marginTop: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.font }}>Filter Breakdown</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={exportToExcel}>
              <NeumorphicView theme={theme} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: theme.green, fontWeight: 'bold', fontSize: 11 }}>📊 Export Excel</Text>
              </NeumorphicView>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleGeneratePDF('Bar')}>
              <NeumorphicView theme={theme} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: theme.font, fontWeight: 'bold', fontSize: 11 }}>↓ Download PDF</Text>
              </NeumorphicView>
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {['All Time', '1 Month', '1 Week', '1 Day', 'Custom'].map(f => (
            <TouchableOpacity key={f} onPress={() => setChartFilter(f)}>
              <NeumorphicView theme={theme} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: chartFilter === f ? 1 : 0, borderColor: theme.green }}>
                <Text style={{ color: chartFilter === f ? theme.green : theme.muted, fontSize: 12, fontWeight: '600' }}>{f}</Text>
              </NeumorphicView>
            </TouchableOpacity>
          ))}
        </View>
        {chartFilter === 'Custom' && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TextInput 
              style={{ backgroundColor: '#fff', padding: 8, borderRadius: 6, fontSize: 12, width: 140, ...Platform.select({ web: { outlineStyle: 'none' }}) }} 
              placeholder="Start (DD-MM-YYYY)" 
              value={customStartDate} 
              onChangeText={setCustomStartDate} 
            />
            <TextInput 
              style={{ backgroundColor: '#fff', padding: 8, borderRadius: 6, fontSize: 12, width: 140, ...Platform.select({ web: { outlineStyle: 'none' }}) }} 
              placeholder="End (DD-MM-YYYY)" 
              value={customEndDate} 
              onChangeText={setCustomEndDate} 
            />
          </View>
        )}
      </View>

      {/* Category Ledgers */}
      <TouchableOpacity activeOpacity={0.7} onPress={() => setIsLedgersOpen(!isLedgersOpen)}>
        <NeumorphicView theme={theme} style={{ padding: 16, borderRadius: 12, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: theme.font }}>Category Ledgers</Text>
          <Text style={{ fontSize: 16, color: theme.muted, fontWeight: 'bold' }}>{isLedgersOpen ? '↑' : '↓'}</Text>
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
              <NeumorphicView theme={theme} style={{ padding: 16, borderRadius: 12, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 16, color: theme.font }}>{item.name}</Text>
                  <Text style={{ fontSize: 14, color: theme.muted }}>{item.count} txns</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
                  <Text style={{ fontSize: 14, color: theme.green, fontWeight: '500' }}>In: ₹{item.credit.toFixed(2)}</Text>
                  <Text style={{ fontSize: 14, color: theme.pink, fontWeight: '500' }}>Out: ₹{item.debit.toFixed(2)}</Text>
                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: item.netFlow >= 0 ? theme.green : theme.pink }}>Net: ₹{item.netFlow.toFixed(2)}</Text>
                </View>

                {expandedCategory === item.name && (
                  <View style={{ marginTop: 15, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 }}>
                    {pieChartTransactions.filter(t => (t.category || "Misc") === item.name).map((t, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => openCategoryModal(t)}
                        style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border + '66', alignItems: 'center' }}
                      >
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={{ fontSize: 12, color: theme.muted, marginBottom: 2 }}>{t.date}</Text>
                          <Text style={{ fontSize: 13, color: theme.font }}>{t.narration}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={{ fontSize: 13, fontWeight: 'bold', color: t.type === 'Credit' ? theme.green : theme.pink, marginRight: 12 }}>
                            {t.type === 'Credit' ? '+' : '-'}{formatCurrency(parseFloat((t.amount || '0').toString().replace(/,/g, '')))}
                          </Text>
                          <NeumorphicView theme={theme} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: theme.purple, fontWeight: 'bold' }}>EDIT</Text>
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
        <NeumorphicView theme={theme} style={{ flex: 1, minWidth: 320, padding: 24, borderRadius: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.font }}>Top Expenses (Bar)</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 220, paddingTop: 30, minWidth: Math.max(chartContainerWidth - 48, 280), justifyContent: 'space-around' }}>
              {ledgerArray.filter(l => l.debit > 0).slice(0, 5).map((l, i) => {
                const maxDebit = Math.max(...ledgerArray.filter(x => x.debit > 0).slice(0, 5).map(x => x.debit));
                const barHeight = maxDebit > 0 ? (l.debit / maxDebit) * 140 : 0;
                const barColor = ["#288cfa", "#e74c3c", "#f39c12", "#27ae60", "#8e44ad"][i % 5];
                return (
                  <View key={i} style={{ alignItems: 'center', width: 60, marginHorizontal: 10 }}>
                    <Text style={{ fontSize: 11, color: theme.muted, fontWeight: 'bold', marginBottom: 6 }} numberOfLines={1}>
                      {formatShortCurrency(l.debit)}
                    </Text>
                    <View style={{ width: 36, height: barHeight, backgroundColor: barColor, borderRadius: 6 }} />
                    <Text style={{ fontSize: 10, color: theme.muted, fontWeight: '600', marginTop: 8, width: 70, textAlign: 'center' }} numberOfLines={2}>
                      {l.name}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </NeumorphicView>

        {/* Expense Breakdown (Pie) */}
        <NeumorphicView theme={theme} style={{ flex: 1, minWidth: 320, padding: 24, borderRadius: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.font }}>Expense Breakdown (Pie)</Text>
          </View>

          <View style={{ alignItems: 'center' }}>
            <View style={{ position: 'relative' }}>
              <PieChart
                data={ledgerArray.filter(l => l.debit > 0).slice(0, 5).map((l, i) => ({
                  name: '',
                  population: l.debit,
                  color: [theme.purple, theme.pink, theme.yellow, theme.green, theme.muted][i % 5],
                  legendFontColor: theme.muted,
                  legendFontSize: 12
                }))}
                width={Math.min(chartContainerWidth, 200)}
                height={180}
                chartConfig={{ color: () => theme.font, backgroundColor: theme.card, backgroundGradientFrom: theme.card, backgroundGradientTo: theme.card }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="45"
                hasLegend={false}
                absolute
              />
              <View style={{ position: 'absolute', top: 50, left: 50, width: 80, height: 80, borderRadius: 40, backgroundColor: theme.card }} />
            </View>
            <View style={{ width: '100%', marginTop: 16 }}>
              {ledgerArray.filter(l => l.debit > 0).slice(0, 5).map((l, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: [theme.purple, theme.pink, theme.yellow, theme.green, theme.muted][i % 5], marginRight: 8 }} />
                    <Text style={{ fontSize: 12, color: theme.font, fontWeight: '600', maxWidth: 120 }} numberOfLines={1}>{l.name}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: theme.muted }}>{formatCurrency(l.debit)} ({((l.debit / totalDebits) * 100).toFixed(1)}%)</Text>
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
    </DashboardLayout>
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
    ...Platform.select({ web: { boxShadow: '0 2px 4px rgba(0,0,0,0.10)' }, default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 } }),
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
