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

// Transaction Classification Logic
const classifyTransaction = (description) => {
  const desc = description.toUpperCase();
  if (desc.includes('SALARY')) return 'Salary';
  if (desc.includes('RENT')) return 'Rent';
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
  const parts = desc.split('/');
  
  if (parts.length >= 3) {
    if (parts[0].match(/NEFT|RTGS|IMPS|INB|INF|BULK|IFT/i)) {
      return parts[2].trim();
    }
    if (parts[0].match(/UPI/i)) {
      return parts.length > 3 ? parts[3].trim() : parts[2].trim();
    }
  }

  const hyphenParts = desc.split('-');
  if (hyphenParts.length >= 3 && hyphenParts[0].match(/IMPS|NEFT|UPI|IFT/i)) {
    return hyphenParts[2].trim();
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
    const amount = parseFloat(t.amount.replace(/,/g, ''));
    let entryText = '';

    let accountName = t.category;
    if (t.category === 'Misc') {
      accountName = extractAccountName(t.description);
      // Clean up final name if it contains IFSC or excess data
      accountName = accountName.replace(/^[0-9A-Z]{11}$/, '');
    }

    let debitAccount = '';
    let creditAccount = '';

    if (t.type === 'credit') {
      debitAccount = accountName;
      creditAccount = 'Bank';
      entryText = `${debitAccount} A/c     Dr.  ${amount}\n   To ${creditAccount} A/c      Cr.  ${amount}`;
    } else if (t.type === 'debit') {
      debitAccount = 'Bank';
      creditAccount = accountName;
      entryText = `${debitAccount} A/c     Dr.  ${amount}\n   To ${creditAccount} A/c      Cr.  ${amount}`;
    } else {
      entryText = `Unknown Entry Type for ${amount}`;
    }

    return {
      date: t.date,
      description: t.description,
      amount: amount,
      type: t.type,
      category: t.category,
      debitAccount,
      creditAccount,
      entry: entryText
    };
  });

  res.json(journalEntries);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${port}`);
});
