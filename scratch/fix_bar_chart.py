import sys
with open('frontend/modules/savings/SavingsApp.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Restore Bar Chart logic
pie_chart_block = """          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
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
                    <Text style={{ fontSize: 13, color: '#2c3e50', fontWeight: '600', maxWidth: 100 }} numberOfLines={1}>{l.name}</Text>
                  </View>
                  <Text style={{ fontSize: 13, color: '#34495e' }}>{formatCurrency(l.debit)} ({((l.debit / totalDebits) * 100).toFixed(2)}%)</Text>
                </View>
              ))}
            </View>
          </View>"""

new_chart_block = """          {selectedChartType === 'Pie' ? (
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
                      <Text style={{ fontSize: 13, color: '#2c3e50', fontWeight: '600', maxWidth: 100 }} numberOfLines={1}>{l.name}</Text>
                    </View>
                    <Text style={{ fontSize: 13, color: '#34495e' }}>{formatCurrency(l.debit)} ({((l.debit / totalDebits) * 100).toFixed(2)}%)</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <BarChart
                data={{
                  labels: ledgerArray.filter(l => l.debit > 0).slice(0, 5).map(l => l.name.substring(0, 8)),
                  datasets: [{ data: ledgerArray.filter(l => l.debit > 0).slice(0, 5).map(l => l.debit) }]
                }}
                width={Math.max(300, ledgerArray.filter(l => l.debit > 0).slice(0, 5).length * 60)}
                height={220}
                yAxisLabel="₹"
                fromZero={true}
                chartConfig={{
                  backgroundColor: "#EBECF0",
                  backgroundGradientFrom: "#EBECF0",
                  backgroundGradientTo: "#EBECF0",
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(149, 165, 166, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(44, 62, 80, ${opacity})`,
                }}
                verticalLabelRotation={30}
                style={{ borderRadius: 10, paddingTop: 20 }}
              />
            </ScrollView>
          )}"""

if pie_chart_block in content:
    content = content.replace(pie_chart_block, new_chart_block)
else:
    print('Failed to find Pie chart block')

# Fix 2: Move Filter Breakdown to top, after main top card
bottom_filters_block = """      {/* Bottom Row Filters */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 }}>
        <View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#2c3e50', marginBottom: 16 }}>Filter Breakdown</Text>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            {['All Time', '1 Month', '1 Week', '1 Day', 'Custom'].map(f => (
              <TouchableOpacity key={f} onPress={() => setChartFilter(f)}>
                <NeumorphicView inset={chartFilter === f} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
                  <Text style={{ color: '#34495e', fontWeight: '600', fontSize: 13 }}>{f}</Text>
                </NeumorphicView>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity onPress={handleGeneratePDF}>
          <NeumorphicView style={{ paddingHorizontal: 24, paddingVertical: 14, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: '#2c3e50', fontWeight: 'bold', fontSize: 15 }}>↓ Download / Share PDF</Text>
          </NeumorphicView>
        </TouchableOpacity>
      </View>"""

if bottom_filters_block in content:
    content = content.replace(bottom_filters_block, '')

    # Insert it right before {/* Category Ledgers */}
    target_pos = """      {/* Category Ledgers */}"""
    
    new_filters_placement = bottom_filters_block + """\n\n      {/* Category Ledgers */}"""
    content = content.replace(target_pos, new_filters_placement)
else:
    print('Failed to find Bottom Filters block')

with open('frontend/modules/savings/SavingsApp.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Success.')
