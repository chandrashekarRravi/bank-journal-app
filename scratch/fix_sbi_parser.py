import sys

with open('backend/modules/savings/narrationEngine.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Improve extractPartyName
old_extract = """const extractPartyName = (description) => {
  let desc = (description || '').trim();
  const splitTokens = desc.split(/[/\\-]/).map(p => p.trim()).filter(p => p);
  
  const ignoreWords = ['UPI', 'UPIAR', 'UPIAB', 'UPID', 'NEFT', 'RTGS', 'IMPS', 'INB', 'INF', 'BULK', 'IFT', 'CR', 'DR', 'P2A', 'P2P', 'P2M', 'OPT', 'GST', 'ACH', 'ACHRE', 'CMS', 'TRF'];
  
  for (let part of splitTokens) {
    let partUpper = part.toUpperCase();
    
    if (/^[\d:\. ]+$/.test(part)) continue;
    if (/^[A-Z0-9]{10,}$/i.test(partUpper) && !part.includes(' ')) continue; 
    if (ignoreWords.includes(partUpper)) continue;
    if (partUpper.includes('CHQ:') || partUpper.includes('CHQ ')) continue;
    
    if (part.includes('@')) {
       let beforeAt = part.split('@')[0];
       if (beforeAt.includes(' ')) {
         return beforeAt.substring(0, beforeAt.lastIndexOf(' ')).trim();
       } else {
         return beforeAt;
       }
    }
    
    if (part.replace(/[^a-zA-Z]/g, '').length >= 3) {
       return part;
    }
  }
  
  return desc.length > 25 ? desc.substring(0, 25) + '...' : desc;
};"""

new_extract = """const extractPartyName = (description) => {
  let desc = (description || '').trim();
  const splitTokens = desc.split(/[/\\-]/).map(p => p.trim()).filter(p => p);
  
  for (let part of splitTokens) {
    let partUpper = part.toUpperCase();
    
    if (/^[\d:\. ]+$/.test(part)) continue;
    if (/^[A-Z0-9]{10,}$/i.test(partUpper) && !part.includes(' ')) continue; 
    if (partUpper.includes('CHQ:') || partUpper.includes('CHQ ')) continue;
    
    // If the part consists entirely of bank keywords, skip it
    let cleanPart = partUpper.replace(/\\b(WDL|TFR|TRF|UPI|UPIAR|UPIAB|UPID|NEFT|RTGS|IMPS|INB|INF|BULK|IFT|CR|DR|P2A|P2P|P2M|OPT|GST|ACH|ACHRE|CMS|POS|ECOM)\\b/g, '').replace(/[^A-Z]/g, '').trim();
    if (!cleanPart) continue;

    if (part.includes('@')) {
       let beforeAt = part.split('@')[0];
       if (beforeAt.includes(' ')) {
         return beforeAt.substring(0, beforeAt.lastIndexOf(' ')).trim();
       } else {
         return beforeAt;
       }
    }
    
    if (part.replace(/[^a-zA-Z]/g, '').length >= 3) {
       return part;
    }
  }
  
  return desc.length > 25 ? desc.substring(0, 25) + '...' : desc;
};"""

content = content.replace(old_extract, new_extract)

with open('backend/modules/savings/narrationEngine.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Success.')
