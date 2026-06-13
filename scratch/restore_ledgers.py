import re

with open('frontend/modules/savings/SavingsApp.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Restore state variables
state_restore = """
  // Category Edit State
  const [expandedCategory, setExpandedCategory] = useState(null);
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
"""

content = content.replace("const [selectedChartType, setSelectedChartType] = useState('Pie');", "const [selectedChartType, setSelectedChartType] = useState('Pie');\n" + state_restore)

# 2. Restore Category Ledgers UI
ledgers_ui = """
      {/* Category Ledgers */}
      <Text style={{ fontSize: 18, fontWeight: "bold", color: "#2C3E50", marginHorizontal: 0, marginTop: 10, marginBottom: 16 }}>Category Ledgers</Text>
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
                        <Text style={{ fontSize: 13, color: '#2c3e50' }}>{t.narration}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: t.type === 'Credit' ? '#27ae60' : '#e74c3c', marginRight: 12 }}>
                          {t.type === 'Credit' ? '+' : '-'}₹{t.amount}
                        </Text>
                        <NeumorphicView style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                          <Text style={{ fontSize: 11, color: '#3498db', fontWeight: 'bold' }}>EDIT</Text>
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
"""

content = content.replace("{/* Middle Row Charts */}", ledgers_ui + "\n      {/* Middle Row Charts */}")

# 3. Restore Modal UI
modal_ui = """
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
"""

content = content.replace("</ScrollView>\n  );\n}", modal_ui + "\n    </ScrollView>\n  );\n}")

# 4. Fix Account Holder name field
content = content.replace("value={currentMetadata.holderName || 'SARTHAK D'}", "value={currentMetadata.holderName || ''}\n              placeholder=\"Enter Name\"")

with open('frontend/modules/savings/SavingsApp.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Restored ledgers and modal, and fixed the name text field.")
