const extractPartyName = (description) => {
  let desc = (description || '').trim();
  const splitTokens = desc.split(/[/\\-]/).map(p => p.trim()).filter(p => p);

  for (let part of splitTokens) {
    let partUpper = part.toUpperCase();

    if (/^[\d:\. ]+$/.test(part)) continue;
    if (/^[A-Z0-9]{10,}$/i.test(partUpper) && !part.includes(' ')) continue;
    if (partUpper.includes('CHQ:') || partUpper.includes('CHQ ')) continue;

    // If the part consists entirely of bank keywords, skip it
    let cleanPart = partUpper.replace(/\b(WDL|TFR|TRF|DEP|UPI|UPIAR|UPIAB|UPID|NEFT|RTGS|IMPS|INB|INF|BULK|IFT|CR|DR|P2A|P2P|P2M|OPT|GST|ACH|ACHRE|CMS|POS|ECOM|MBS|AVG|MIN|BAL|CHRG)\b/g, '').replace(/[^A-Z]/g, '').trim();
    if (!cleanPart) continue;

    let potentialName = part;
    if (/^TO\s+/i.test(potentialName)) {
      potentialName = potentialName.substring(3).trim();
    } else if (/^BY\s+/i.test(potentialName)) {
      potentialName = potentialName.substring(3).trim();
    }

    if (potentialName.includes('@')) {
      let beforeAt = potentialName.split('@')[0];
      if (beforeAt.includes(' ')) {
        return beforeAt.substring(0, beforeAt.lastIndexOf(' ')).trim();
      } else {
        return beforeAt;
      }
    }

    if (potentialName.replace(/[^a-zA-Z]/g, '').length >= 3) {
      return potentialName;
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

  if (category === 'Bank Charges' || /\bCHRG\b|\bMIN BAL\b/i.test(desc)) {
    return 'Being bank charges deducted';
  }

  // Handle other transfers including MBS
  if (/\bNEFT\b|\bRTGS\b|\bIMPS\b|\bMBS\b/.test(desc)) {
    const mode = /\bNEFT\b/.test(desc) ? 'NEFT' : /\bRTGS\b/.test(desc) ? 'RTGS' : /\bMBS\b/.test(desc) ? 'MBS' : 'IMPS';
    if (type === 'credit') {
      return `Being amount received from ${partyName} via ${mode}`;
    } else {
      return `Being amount paid via ${mode} to ${partyName}`;
    }
  }

  // Default fallbacks with dynamic party name inclusion
  if (type === 'credit') {
    return partyName && partyName !== 'Unknown' && partyName !== 'Party' 
      ? `Being amount received from ${partyName}` 
      : 'Being amount received';
  } else {
    return partyName && partyName !== 'Unknown' && partyName !== 'Party' 
      ? `Being amount paid to ${partyName}` 
      : 'Being amount paid';
  }
};

module.exports = {
  generateNarration,
  extractPartyName
};
