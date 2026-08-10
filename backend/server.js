const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = 3000;

app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(cors({
  origin: '*', // Allow all origins for both local and live servers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Bypass-Tunnel-Reminder'],
}));
app.use(express.json());
const savingsRouter = require('./modules/savings/routes');
app.use('/api/savings', savingsRouter);

const { generateExcel, generateTallyXML } = require('./modules/tally/tallyExporter');


// Root health-check endpoint
app.get('/', (req, res) => {
  res.send('Banklyt API Backend is running successfully!');
});

// Apply rate limiting to API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/upload', apiLimiter);
app.use('/generate-entries', apiLimiter);

// Set up Multer for PDF uploads
const upload = multer({ dest: 'uploads/' });

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Persistent mapping to learn categories
const mappingsPath = path.join(__dirname, 'mappings.json');
let customMappings = {};
try {
  if (fs.existsSync(mappingsPath)) {
    customMappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));
  }
} catch (e) {
  console.error('Failed to load custom mappings:', e);
}

// Transaction Classification Logic
const classifyTransaction = (description) => {
  if (customMappings[description]) return customMappings[description];

  // Then check substring/wildcard mappings
  for (const key of Object.keys(customMappings)) {
    if (key.startsWith('*') && key.endsWith('*')) {
      const keyword = key.slice(1, -1);
      if (description.includes(keyword)) return customMappings[key];
    }
  }

  const desc = description.toUpperCase();
  if (desc.includes('SALARY')) return 'Salary';
  if (desc.includes('RENT')) return 'Rent Income';
  if (desc.includes('GST')) return 'GST Payable';
  if (desc.includes('TDS')) return 'TDS Payable';
  if (desc.includes('CHEQUE')) return 'Cheque';
  if (desc.includes('LOAN') || desc.includes('EMI')) return 'Loan';
  if (desc.includes('INTEREST') || desc.includes('INT.PD')) return 'Interest';

  if (desc.includes('UPI') || desc.includes('PAYTM') || desc.includes('PHONEPE') || desc.includes('GPAY')) return 'Transfer/UPI';
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
  let desc = description;

  const descUpper = desc.toUpperCase();

  let isCheque = false;
  // Try to extract from Cheque
  if (/\bCHQ\b|\bCHEQUE\b/i.test(descUpper)) {
    isCheque = true;
    const chqMatch = desc.match(/(?:CHQ|CHEQUE)[^\d]*(\d+)[^\w]*([a-zA-Z\s]{3,})/i);
    if (chqMatch && chqMatch[2] && chqMatch[2].trim().length > 2) {
      return `Chq ${chqMatch[1]} - ${chqMatch[2].trim()}`;
    }
  }

  const parts = desc.split(/[/\\-]/).map(p => p.trim()).filter(p => p);
  
  if (parts.length >= 2) {
    const ignoreWords = ['UPI', 'NEFT', 'RTGS', 'IMPS', 'INB', 'INF', 'BULK', 'IFT', 'CR', 'DR', 'P2A', 'P2P', 'P2M', 'OPT', 'GST', 'ACH', 'CMS', 'TRF', 'MBS', 'AVG', 'MIN', 'BAL', 'CHRG', 'MOB', 'TRANS', 'PAYMENT', 'BANK', 'CHQ', 'CHEQUE'];
    
    for (let i = 0; i < parts.length; i++) {
      let part = parts[i];
      let partUpper = part.toUpperCase().trim();
      
      // Skip numeric IDs or long alphanumeric refs (must contain at least one digit)
      if (/^[\d]+$/.test(part) || /^(?=.*[0-9])[A-Z0-9]{8,40}$/.test(partUpper)) continue;
      
      // Skip short dates like Apr
      if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i.test(partUpper)) continue;

      // Handle words combined with space, e.g., 'IMPS CR'
      let subParts = partUpper.split(/\s+/);
      let allIgnored = true;
      for (const sp of subParts) {
         if (!ignoreWords.includes(sp) && !ignoreWords.includes(partUpper)) {
             allIgnored = false;
             break;
         }
      }
      if (allIgnored) continue;

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

      // Looks like a valid name if it has a few letters
      if (potentialName.replace(/[^a-zA-Z]/g, '').length >= 3) {
        return isCheque ? `Chq - ${potentialName.trim()}` : potentialName.trim();
      }
    }
  }

  return isCheque ? 'Cheque' : 'unknown'; // Return unknown if no valid name found
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

    let rawDesc = t.description || '';
    // Strip leading date if it bled into the description
    let cleanDesc = rawDesc.replace(/\s+/g, ' ').trim();
    cleanDesc = cleanDesc.replace(/^(?:\d{1,2}[/\-. ](?:[A-Za-z]{3,8}|\d{1,2})[/\-. ]\d{2,4})\s*/, '').trim();

    let accountName = extractAccountName(cleanDesc);

    let originalExtracted = accountName; // DEBUG
    // If extraction returned Misc, unknown, or the full description, and we have a better category, use it
    if (accountName === 'Misc' || accountName === cleanDesc || accountName === 'unknown') {
      if (t.category && t.category !== 'Misc') {
        accountName = t.category;
      } else if (accountName === 'unknown') {
        accountName = cleanDesc; // fallback to cleaned description
      }
    }

    if (!accountName || accountName === 'unknown') {
      accountName = 'Misc';
    }
    
    console.log("DEBUG /generate-entries - rawDesc:", rawDesc);
    console.log("DEBUG /generate-entries - extracted:", originalExtracted, " | category:", t.category, " | finalAccountName:", accountName);

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
    const descUpper = desc.toUpperCase();
    
    let mode = '';
    if (/\bNEFT\b/.test(descUpper)) mode = 'NEFT';
    else if (/\bRTGS\b/.test(descUpper)) mode = 'RTGS';
    else if (/\bIMPS\b/.test(descUpper)) mode = 'IMPS';
    else if (/\bUPI\b/.test(descUpper)) mode = 'UPI';
    else if (/\bOPT\b/.test(descUpper)) mode = 'OPT';
    else if (/\bMBS\b/.test(descUpper)) mode = 'MBS';
    else if (/\bCHQ\b|\bCHEQUE\b/.test(descUpper)) mode = 'Cheque';
    
    let refMatch = desc.match(/(?:NEFT|RTGS|IMPS|UPI|OPT|GST|MBS)[^a-zA-Z0-9]*([A-Z0-9]{8,25})/i);
    let refNum = refMatch && refMatch[1] ? refMatch[1] : '';

    let narration = '';
    if (/\bGST\b/.test(descUpper)) {
      narration = `(Being GST paid${refNum ? ' ref no. ' + refNum : ''})`;
    } else if (/\bCHRG\b|\bMIN BAL\b/i.test(descUpper) || t.category === 'Bank Charges') {
      narration = '(Being bank charges deducted)';
    } else if (mode === 'Cheque') {
      let chqMatch = desc.match(/(?:CHQ|CHEQUE)[^\d]*(\d+)/i);
      let chqNum = chqMatch && chqMatch[1] ? chqMatch[1] : '';
      let toFromText = '';
      if (accountName && accountName !== 'Misc' && accountName !== 'unknown' && accountName !== 'Cheque') {
        toFromText = type === 'credit' ? ` from ${accountName}` : ` to ${accountName}`;
      }
      narration = type === 'credit' ? `(Being cheque deposited${toFromText}${chqNum ? ' no. ' + chqNum : ''})` : `(Being cheque issued${toFromText}${chqNum ? ' no. ' + chqNum : ''})`;
    } else {
      let toFromText = '';
      if (accountName && accountName !== 'Misc' && accountName !== 'unknown') {
        toFromText = type === 'credit' ? ` from ${accountName}` : ` to ${accountName}`;
      }
      narration = type === 'credit' ? `(Being amount received${toFromText}` : `(Being amount paid${toFromText}`;
      if (mode && mode !== 'Cheque') {
        narration += ` via ${mode}`;
      }
      if (refNum && mode !== 'Cheque') {
        narration += ` ref no. ${refNum}`;
      }
      narration += ')';
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
      narration: narration,
      refNo: t.refNo || ''
    };
  });

  res.json(journalEntries);
});

app.post('/update-category', (req, res) => {
  const { description, category, matchType } = req.body;
  if (description && category) {
    if (matchType === 'all') {
      customMappings[`*${description}*`] = category;
      console.log(`Learned new wildcard category mapping: "*${description}*" -> ${category}`);
    } else {
      customMappings[description] = category;
      console.log(`Learned new category mapping: "${description}" -> ${category}`);
    }
    try {
      fs.writeFileSync(mappingsPath, JSON.stringify(customMappings, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save mappings:', e);
    }
  }
  res.json({ success: true });
});


// POST /tally/export — Tally-only route: dedicated parser → Excel + Tally XML
app.post('/tally/export', upload.single('statement'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const pdfPath     = req.file.path;
  const companyName = req.body.companyName || 'My Company';
  const bankLedger  = req.body.bankLedger  || 'Bank Account';
  const bankType    = req.body.bankType    || 'Bank';

  // Always use the tally-specific parser (isolated from savings/business logic)
  const tallyParser = path.join(__dirname, 'python_service', 'tally', 'tallyParser.py');
  const proc = spawn('python', [tallyParser, pdfPath]);
  let out = '', err = '';

  proc.stdout.on('data', d => { out += d.toString(); });
  proc.stderr.on('data', d => { err += d.toString(); });

  proc.on('close', async (code) => {
    try { fs.unlinkSync(pdfPath); } catch (_) {}

    if (code !== 0) {
      console.error('Tally Parser Error:', err);
      return res.status(500).json({ error: 'Failed to parse PDF.' });
    }

    try {
      const jsonStart    = out.indexOf('[');
      const jsonEnd      = out.lastIndexOf(']') + 1;
      const transactions = JSON.parse(out.substring(jsonStart, jsonEnd));

      // Classify description → ledger category for Tally XML
      const classified = transactions.map(t => ({
        ...t,
        category: classifyTransaction(t.description),
      }));

      const excelBuffer = await generateExcel(classified, companyName, bankLedger, bankType);
      const xmlString   = generateTallyXML(classified, companyName, bankLedger);

      res.json({
        transactions: classified,
        excel: excelBuffer.toString('base64'),
        xml:   Buffer.from(xmlString, 'utf8').toString('base64'),
      });
    } catch (e) {
      console.error('Tally export error:', e);
      res.status(500).json({ error: 'Failed to generate export files.' });
    }
  });
});


app.listen(port, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${port} or localhost:8081`);
});