import sys
import re

with open('scratch/old_savings.js', 'r', encoding='utf-16') as f:
    old_content = f.read()

styles_idx = old_content.find('const styles = StyleSheet.create({')
old_styles = old_content[styles_idx:]

with open('frontend/modules/savings/SavingsApp.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix transactionCount
content = content.replace('const netCashFlow = totalCredits - totalDebits;', 'const netCashFlow = totalCredits - totalDebits;\n  const transactionCount = pieChartTransactions.length;')

# Replace styles
current_styles_idx = content.find('const styles = StyleSheet.create({')
if current_styles_idx != -1:
    content = content[:current_styles_idx] + old_styles
else:
    content += '\n\n' + old_styles

# Update background color for Neumorphic container
content = content.replace('backgroundColor: "#F5F7FA",', 'backgroundColor: "#EBECF0",')

with open('frontend/modules/savings/SavingsApp.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Restored styles and fixed transactionCount.')
