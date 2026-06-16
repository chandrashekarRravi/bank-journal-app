import re

def apply_palette_safe(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Apply Primary
    content = re.sub(r'(?i)#4A90E2', '#288cfa', content)
    content = re.sub(r'(?i)#2980b9', '#288cfa', content) # Old primary variants

    # Apply Secondary
    content = re.sub(r'(?i)#357ABD', '#7ebcf9', content)
    content = re.sub(r'(?i)#3498db', '#7ebcf9', content)

    # Apply Text
    content = re.sub(r'(?i)#2C3E50', '#242c34', content)
    
    if 'App.js' in filepath:
        # Give the Nav header the deep background
        content = re.sub(r'headerStyle:\s*\{\s*backgroundColor:\s*[\'"]#288cfa[\'"]\s*\}', 'headerStyle: { backgroundColor: "#103766" }', content)
        # Give UploadScreen the deep background
        content = re.sub(r'flex:\s*1\s*,\s*padding:\s*20\s*,\s*backgroundColor:\s*[\'"]#f5f7fa[\'"]', 'flex: 1, padding: 20, backgroundColor: "#103766"', content)
        # Upload screen title should be readable on dark background
        content = re.sub(r'color:\s*[\'"]#242c34[\'"]\s*,\s*fontSize:\s*28\s*,\s*fontWeight:\s*[\'"]bold[\'"]\s*,\s*marginBottom:\s*10\s*,\s*textAlign:\s*[\'"]center[\'"]', 'color: "#ffffff", fontSize: 28, fontWeight: "bold", marginBottom: 10, textAlign: "center"', content)
        # Upload screen subtitle
        content = re.sub(r'color:\s*[\'"]#7f8c8d[\'"]\s*,\s*fontSize:\s*16\s*,\s*marginBottom:\s*30\s*,\s*textAlign:\s*[\'"]center[\'"]', 'color: "#7ebcf9", fontSize: 16, marginBottom: 30, textAlign: "center"', content)
        
        # In Business TransactionsScreen, set outer background to #103766
        content = re.sub(r'flex:\s*1\s*,\s*padding:\s*15\s*,\s*backgroundColor:\s*[\'"]#f5f7fa[\'"]', 'flex: 1, padding: 15, backgroundColor: "#103766"', content)

    elif 'SavingsApp.js' in filepath:
        # For the Savings app, we want the outermost container to be #103766 to give depth,
        # but keep the neumorphic background (#E0E5EC) inside inner wrappers so shadows still work.
        # So we replace the outer ScrollView background
        content = content.replace("backgroundColor: '#E0E5EC'", "backgroundColor: '#103766'", 1) # Only replace the first occurrence (usually the root View/ScrollView)
        
        # Ensure that any text sitting directly on the new #103766 root background becomes white or secondary, 
        # but actually, SavingsApp encapsulates everything in NeumorphicViews, so it should be fine.

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

apply_palette_safe('frontend/App.js')
apply_palette_safe('frontend/modules/savings/SavingsApp.js')
print("Palette successfully applied!")
