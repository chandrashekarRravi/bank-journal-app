const extractPartyName = (description) => {
  let desc = (description || '').trim();
  const splitTokens = desc.split(/[/\\-]/).map(p => p.trim()).filter(p => p);
  
  for (let part of splitTokens) {
    let partUpper = part.toUpperCase();
    
    if (/^[\d:\. ]+$/.test(part)) continue;
    if (/^[A-Z0-9]{10,}$/i.test(partUpper) && !part.includes(' ')) continue; 
    if (partUpper.includes('CHQ:') || partUpper.includes('CHQ ')) continue;
    
    // If the part consists entirely of bank keywords, skip it
    let cleanPart = partUpper.replace(/\b(WDL|TFR|TRF|UPI|UPIAR|UPIAB|UPID|NEFT|RTGS|IMPS|INB|INF|BULK|IFT|CR|DR|P2A|P2P|P2M|OPT|GST|ACH|ACHRE|CMS|POS|ECOM)\b/g, '').replace(/[^A-Z]/g, '').trim();
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
};

const generateNarration = (description, type, category, extractedPartyName) => {
  const desc = (description || '').toUpperCase();
  const partyName = extractedPartyName || extractPartyName(description);

  if (category === 'Salary') {
    return 'Being salary credited to bank account';
  }
  
  if (category === 'Interest') {
    return 'Being savings bank interest credited';
  }

  if (category === 'ATM') {
    return type === 'credit' ? 'Being cash deposited into bank account' : 'Being cash withdrawn through ATM';
  }

  if (category === 'Food') {
    return 'Being food purchase payment made';
  }

  if (category === 'Fuel') {
    return 'Being fuel expense paid';
  }

  if (category === 'Medical') {
    return 'Being medical expense paid';
  }

  if (category === 'Shopping') {
    return 'Being online purchase payment made';
  }

  if (category === 'Recharge') {
    return `Being recharge payment made to ${partyName !== 'Unknown' ? partyName : 'Provider'}`;
  }

  if (category === 'Bills') {
    if (/\bWATER\b/.test(desc)) return 'Being water bill paid';
    if (/\bINTERNET\b|\bBROADBAND\b|\bACT FIBERNET\b|\bHATHWAY\b/.test(desc)) return 'Being internet service payment made';
    return 'Being electricity bill paid'; // Default for bills per requirements
  }

  // Handle UPI specific formats
  if (/\bUPI/i.test(desc)) {
    if (type === 'credit') {
      return `Being amount received from ${partyName !== 'Unknown' ? partyName : 'party'} via UPI`;
    } else {
      return `Being amount paid via UPI to ${partyName !== 'Unknown' ? partyName : 'party'}`;
    }
  }

  // Handle other transfers
  if (/\bNEFT\b|\bRTGS\b|\bIMPS\b/.test(desc)) {
    const mode = /\bNEFT\b/.test(desc) ? 'NEFT' : /\bRTGS\b/.test(desc) ? 'RTGS' : 'IMPS';
    if (type === 'credit') {
      return `Being amount received from ${partyName} via ${mode}`;
    } else {
      return `Being amount paid via ${mode} to ${partyName}`;
    }
  }

  // Default fallbacks
  if (type === 'credit') {
    return 'Being amount received';
  } else {
    return 'Being amount paid';
  }
};

module.exports = {
  generateNarration,
  extractPartyName
};
