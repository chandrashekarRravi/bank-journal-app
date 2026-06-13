import sys
with open('frontend/modules/savings/SavingsApp.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add state
state_search = 'const [expandedCategory, setExpandedCategory] = useState(null);'
state_replace = 'const [expandedCategory, setExpandedCategory] = useState(null);\n  const [isLedgersOpen, setIsLedgersOpen] = useState(false);'
content = content.replace(state_search, state_replace)

# Wrap ledgers
ledgers_search = """      {/* Category Ledgers */}
      <Text style={{ fontSize: 18, fontWeight: "bold", color: "#2C3E50", marginHorizontal: 0, marginTop: 10, marginBottom: 16 }}>Category Ledgers</Text>
      <View style={{ marginBottom: 24 }}>
        {ledgerArray.map((item, index) => ("""

ledgers_replace = """      {/* Category Ledgers */}
      <TouchableOpacity activeOpacity={0.7} onPress={() => setIsLedgersOpen(!isLedgersOpen)}>
        <NeumorphicView style={{ padding: 16, borderRadius: 12, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: "#2C3E50" }}>Category Ledgers</Text>
          <Text style={{ fontSize: 16, color: '#7f8c8d', fontWeight: 'bold' }}>{isLedgersOpen ? '↑' : '↓'}</Text>
        </NeumorphicView>
      </TouchableOpacity>
      
      {isLedgersOpen && (
      <View style={{ marginBottom: 24 }}>
        {ledgerArray.map((item, index) => ("""

content = content.replace(ledgers_search, ledgers_replace)

# Close wrap
close_search = """            </NeumorphicView>
          </TouchableOpacity>
        ))}
      </View>

      {/* Middle Row Charts */}"""

close_replace = """            </NeumorphicView>
          </TouchableOpacity>
        ))}
      </View>
      )}

      {/* Middle Row Charts */}"""

content = content.replace(close_search, close_replace)

with open('frontend/modules/savings/SavingsApp.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Success.')
