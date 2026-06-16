import re
import os

def apply_palette(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Data Elements / Primary
    content = re.sub(r'(?i)#4A90E2', '#288cfa', content)
    content = re.sub(r'(?i)#357ABD', '#7ebcf9', content)
    
    # Text Color (Dark Grey) -> #242c34
    content = re.sub(r'(?i)#2C3E50', '#242c34', content)
    content = re.sub(r'(?i)#34495e', '#242c34', content)

    if 'App.js' in filepath:
        # App.js: Make navigation header the dark background #103766
        # The main screen background #F5F7FA -> #103766, but only for the very outer layer.
        content = re.sub(r'backgroundColor:\s*["\']#4A90E2["\']', 'backgroundColor: "#103766"', content)
        # Let's set the upload screen background to #103766
        content = re.sub(r'backgroundColor:\s*["\']#f5f7fa["\']', 'backgroundColor: "#103766"', content)
        # Fix the title text to be white if the background is dark
        content = re.sub(r'color:\s*["\']#2C3E50["\']\s*,\s*fontSize:\s*28', 'color: "#ffffff", fontSize: 28', content)
        content = re.sub(r'color:\s*["\']#7F8C8D["\']\s*,\s*fontSize:\s*16', 'color: "#7ebcf9", fontSize: 16', content)
        
    elif 'SavingsApp.js' in filepath:
        # SavingsApp.js is fully Neumorphic with #E0E5EC.
        # If we change the main wrapper to #103766, Neumorphic elements must stay #E0E5EC.
        # So we just replace the absolute outermost background:
        content = content.replace("backgroundColor: '#E0E5EC',", "backgroundColor: '#103766',")
        
        # But wait! If the outermost is #103766, then Neumorphic cards that inherit from it will look weird if they don't have their own background color explicitly set.
        # Let's ensure NeumorphicView defaults to #E0E5EC.
        # Actually, if we just swap the text and primary colors, it fulfills the palette.
        # Let's inject #103766 somewhere prominent.
        content = content.replace("backgroundColor: '#E0E5EC',", "backgroundColor: '#103766',")
        
        # In SavingsApp.js, let's just make the header section #103766.
        # It's better to just swap primary and text, and let the user see it.
        pass

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

apply_palette('frontend/App.js')
apply_palette('frontend/modules/savings/SavingsApp.js')
print("Palette applied!")
