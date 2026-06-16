import re
import sys

def fix_deprecation_warnings(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # 1. pointerEvents="none" -> style={{ pointerEvents: 'none' }}
        content = re.sub(r'pointerEvents="([^"]+)"', r'style={{ pointerEvents: "\1" }}', content)
        content = re.sub(r"pointerEvents='([^']+)'", r"style={{ pointerEvents: '\1' }}", content)
        
        # 2. Image resizeMode and tintColor
        # If it's something like style={{ width: 15, height: 15, tintColor: '#fff', resizeMode: 'contain' }}
        # we can extract resizeMode and tintColor.
        # This regex looks for tintColor: '...' and removes it from the style, putting it into the component props.
        # But wait, it's safer to just remove it and put it on the tag?
        # Actually, let's just find and replace the literal strings in SavingsApp.js
        # SavingsApp.js has: style={{ width: 15, height: 15, tintColor: '#fff', resizeMode: 'contain' }}
        content = content.replace("style={{ width: 15, height: 15, tintColor: '#fff', resizeMode: 'contain' }}", "style={{ width: 15, height: 15 }} tintColor='#fff' resizeMode='contain'")
        content = content.replace("style={{ width: 15, height: 15, tintColor: '#288cfa', resizeMode: 'contain' }}", "style={{ width: 15, height: 15 }} tintColor='#288cfa' resizeMode='contain'")
        content = content.replace("style={{ width: 15, height: 15, tintColor: '#7ebcf9', resizeMode: 'contain' }}", "style={{ width: 15, height: 15 }} tintColor='#7ebcf9' resizeMode='contain'")
        content = content.replace("style={{ width: 12, height: 12, tintColor: '#fff', resizeMode: 'contain' }}", "style={{ width: 12, height: 12 }} tintColor='#fff' resizeMode='contain'")
        content = content.replace("style={{ width: 14, height: 14, tintColor: '#288cfa', resizeMode: 'contain' }}", "style={{ width: 14, height: 14 }} tintColor='#288cfa' resizeMode='contain'")

        # 3. Clean up the shadowColor instances in App.js which trigger the "shadow* is deprecated" warning
        # Replace: shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5
        # With: boxShadow: '0px 4px 10px rgba(0,0,0,0.1)'
        content = re.sub(
            r'shadowColor:\s*[\'"]#000[\'"],\s*shadowOffset:\s*{\s*width:\s*0,\s*height:\s*4\s*},\s*shadowOpacity:\s*0\.1,\s*shadowRadius:\s*10,\s*elevation:\s*5',
            "boxShadow: '0px 4px 10px rgba(0,0,0,0.1)'",
            content
        )
        content = re.sub(
            r'shadowColor:\s*[\'"]#000[\'"],\s*shadowOffset:\s*{\s*width:\s*0,\s*height:\s*2\s*},\s*shadowOpacity:\s*0\.05,\s*shadowRadius:\s*4,\s*elevation:\s*2',
            "boxShadow: '0px 2px 4px rgba(0,0,0,0.05)'",
            content
        )

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed {filepath}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

fix_deprecation_warnings('frontend/App.js')
fix_deprecation_warnings('frontend/modules/savings/SavingsApp.js')
