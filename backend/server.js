const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Set up Multer for PDF uploads
const upload = multer({ dest: 'uploads/' });

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// In-memory mapping to learn categories
const customMappings = {};

// Transaction Classification Logic
const classifyTransaction = (description) => {
  if (customMappings[description]) return customMappings[description];

  const desc = description.toUpperCase();
  if (desc.includes('SALARY')) return 'Salary';
  if (desc.includes('RENT')) return 'Rent Income';
  if (desc.includes('GST')) return 'GST Payable';
  if (desc.includes('TDS')) return 'TDS Payable';
  if (desc.includes('LOAN') || desc.includes('EMI')) return 'Loan';
  if (desc.includes('INTEREST') || desc.includes('INT.PD')) return 'Interest';

  if (desc.includes('UPI') || desc.includes('PAYTM') || desc.includes('PHONEPE') || desc.includes('GPAY')) return 'Transfer/UPI';
  if (desc.includes('SWIGGY') || desc.includes('ZOMATO') || desc.includes('FOOD')) return 'Food';
  if (desc.includes('AMAZON') || desc.includes('FLIPKART') || desc.includes('MYNTRA')) return 'Shopping';
  if (desc.includes('NETFLIX') || desc.includes('SPOTIFY') || desc.includes('PRIME')) return 'Subscription';
  if (desc.includes('ATM') || desc.includes('WDL') || desc.includes('CASH')) return 'Cash Withdrawal';
  if (desc.includes('FEE') || desc.includes('CHG') || desc.includes('CHARGE')) return 'Bank Charges';

  return 'Misc';
};

// POST /upload - Upload PDF, send to Python, return parsed JSON
app.post('/upload', upload.single('statement'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const pdfPath = req.file.path;
  const pythonScript = path.join(__dirname, 'python_service', 'parser.py');

  // Spawn Python process
  const pythonProcess = spawn('python', [pythonScript, pdfPath]);

  let dataString = '';
  let errorString = '';

  pythonProcess.stdout.on('data', (data) => {
    dataString += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    errorString += data.toString();
  });

  pythonProcess.on('close', (code) => {
    // Clean up uploaded file
    fs.unlinkSync(pdfPath);

    if (code !== 0) {
      console.error('Python Script Error:', errorString);
      return res.status(500).json({ error: 'Failed to parse PDF.' });
    }

    try {
      // Find JSON block in python output (simplistic extraction)
      const jsonStart = dataString.indexOf('[');
      const jsonEnd = dataString.lastIndexOf(']') + 1;
      const jsonStr = dataString.substring(jsonStart, jsonEnd);

      const transactions = JSON.parse(jsonStr);

      // Add classification
      const classifiedTransactions = transactions.map(t => ({
        ...t,
        category: classifyTransaction(t.description)
      }));

      res.json(classifiedTransactions);
    } catch (e) {
      console.error('JSON Parse Error:', e, dataString);
      res.status(500).json({ error: 'Failed to process extracted data.' });
    }
  });
});

const extractAccountName = (description) => {
  if (!description) return 'Misc';
  let desc = description.replace(/\s+/g, ' ').trim();
  const descUpper = desc.toUpperCase();

  // Try to extract from Cheque
  if (/\bCHQ\b|\bCHEQUE\b/.test(descUpper)) {
    const chqMatch = desc.match(/(?:CHQ|CHEQUE)[^\d]*(\d+)[^\w]*([a-zA-Z\s]+)/i);
    if (chqMatch && chqMatch[2] && chqMatch[2].trim().length > 2) {
      return `Chq ${chqMatch[1]} - ${chqMatch[2].trim()}`;
    }
    const parts = desc.split('/');
    if (parts.length >= 3 && parts[0].match(/CHQ|CLG/i)) {
      return `Chq ${parts[1]} - ${parts[2]}`;
    }
    const hyphenParts = desc.split('-');
    if (hyphenParts.length >= 2 && hyphenParts[0].match(/CHQ|CHEQUE/i)) {
      return `Chq - ${hyphenParts[1].trim()}`;
    }
    return 'Cheque';
  }

  const parts = desc.split('/');
  
  if (parts.length >= 3) {
    if (parts[0].match(/NEFT|RTGS|IMPS|INB|INF|BULK|IFT/i)) {
      let name = parts.length > 2 ? parts[2].trim() : parts[1].trim();
      name = name.replace(/^[0-9A-Z]{11}$/, '').trim();
      return name || 'Misc';
    }
    if (parts[0].match(/UPI/i)) {
      // UPI/CR/123456/NAME/BANK or UPI/12345/NAME
      let name = parts.length > 3 ? parts[3].trim() : parts[2].trim();
      name = name.replace(/^[0-9A-Z]{11}$/, '').trim();
      return name || 'UPI Transfer';
    }
  }

  const hyphenParts = desc.split('-');
  if (hyphenParts.length >= 3 && hyphenParts[0].match(/IMPS|NEFT|UPI|IFT/i)) {
    let name = hyphenParts[2].trim();
    name = name.replace(/^[0-9A-Z]{11}$/, '').trim();
    return name || 'Misc';
  }

  return description;
};

// POST /generate-entries - Accept JSON, return journal entries
app.post('/generate-entries', (req, res) => {
  const transactions = req.body;
  if (!Array.isArray(transactions)) {
    return res.status(400).json({ error: 'Expected an array of transactions' });
  }

  const journalEntries = transactions.map(t => {
    const amountStr = t.amount ? t.amount.toString() : '0';
    const amount = parseFloat(amountStr.replace(/,/g, ''));
    let entryText = '';

    let accountName = extractAccountName(t.description);
    
    // If extraction returned Misc or the full description, and we have a better category, use category as a fallback only if we couldn't find a good name
    if (accountName === 'Misc' || accountName === t.description || accountName === 'unknown') {
      if (t.category && t.category !== 'Misc') {
        accountName = t.category;
      } else if (accountName === 'unknown') {
        accountName = t.description; // fallback to raw description
      }
    }

    if (!accountName || accountName === 'unknown') {
      accountName = 'Misc';
    }

    let debitAccount = '';
    let creditAccount = '';
    const type = (t.type || '').toLowerCase();

    if (type === 'credit' || type === 'cr') {
      debitAccount = 'Bank';
      creditAccount = accountName;
    } else if (type === 'debit' || type === 'dr') {
      debitAccount = accountName;
      creditAccount = 'Bank';
    } else {
      // Fallback if type is somehow malformed
      debitAccount = accountName;
      creditAccount = 'Bank';
    }
    
    entryText = `${debitAccount} A/c     Dr.  ${amount}\n   To ${creditAccount} A/c      Cr.  ${amount}`;

    // Generate Narration
    const desc = t.description || '';
    let narration = `(Being ${desc.toLowerCase()})`;
    const descUpper = desc.toUpperCase();
    
    if (/\bNEFT\b/.test(descUpper)) {
      narration = type === 'credit' ? '(Being amount received via NEFT)' : '(Being amount paid via NEFT)';
    } else if (/\bRTGS\b/.test(descUpper)) {
      narration = type === 'credit' ? '(Being amount received via RTGS)' : '(Being amount paid via RTGS)';
    } else if (/\bUPI\b/.test(descUpper)) {
      const personName = (accountName !== 'Misc' && accountName !== 'UPI Transfer' && accountName !== t.category) ? accountName : '';
      if (personName) {
        narration = type === 'credit' ? `(Being amount received via UPI from ${personName})` : `(Being amount paid via UPI to ${personName})`;
      } else {
        narration = type === 'credit' ? '(Being amount received via UPI)' : '(Being amount paid via UPI)';
      }
    } else if (/\bGST\b/.test(descUpper)) {
      narration = '(Being GST paid)';
    } else if (/\bCHQ\b|\bCHEQUE\b/.test(descUpper)) {
      narration = type === 'credit' ? '(Being cheque deposited)' : '(Being cheque issued)';
    }

    return {
      date: t.date,
      description: desc,
      amount: amount,
      type: type,
      category: t.category || 'Misc',
      debitAccount,
      creditAccount,
      entry: entryText,
      narration: narration
    };
  });

  res.json(journalEntries);
});

// POST /update-category - Learn new category mapping
app.post('/update-category', (req, res) => {
  const { description, category } = req.body;
  if (description && category) {
    customMappings[description] = category;
    console.log(`Learned new category mapping: "${description}" -> ${category}`);
  }
  res.json({ success: true });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${port}`);
});
