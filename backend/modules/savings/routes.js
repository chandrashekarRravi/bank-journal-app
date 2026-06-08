const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { categorizeTransaction } = require('./categorizationEngine');
const { generateNarration } = require('./narrationEngine');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/process-statement', upload.single('statement'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded' });
  }

  // Use the custom savings parser for text extraction
  // The python script just returns raw JSON: [{ date, description, amount, type, balance }]
  const pythonPath = path.join(__dirname, 'savingsParser.py');
  const pythonProcess = spawn('python', [pythonPath, req.file.path]);

  let data = '';
  let errorData = '';

  pythonProcess.stdout.on('data', (chunk) => {
    data += chunk.toString();
  });

  pythonProcess.stderr.on('data', (chunk) => {
    errorData += chunk.toString();
  });

  pythonProcess.on('close', (code) => {
    if (code !== 0) {
      fs.unlinkSync(req.file.path);
      console.error('Python parser error:', errorData);
      return res.status(500).json({ error: 'Failed to parse PDF statement', details: errorData });
    }

    try {
      const { spawnSync } = require('child_process');
      const metaPath = path.join(__dirname, 'metadataExtractor.py');
      const metaProcess = spawnSync('python', [metaPath, req.file.path]);
      
      fs.unlinkSync(req.file.path); // Clean up the uploaded file here
      let metadata = {
        holderName: "User (Auto-Extracted)",
        bankName: "Bank Account",
        accountNumber: "XXXX-XXXX"
      };
      if (metaProcess.stdout) {
        try {
          const outStr = metaProcess.stdout.toString();
          const jsonStart = outStr.indexOf('{');
          const jsonEnd = outStr.lastIndexOf('}') + 1;
          if (jsonStart !== -1 && jsonEnd !== 0) {
             metadata = JSON.parse(outStr.substring(jsonStart, jsonEnd));
          }
        } catch(e) {
          console.error("Metadata JSON parse error:", e);
        }
      }

      let rawTransactions = [];
      try {
        const jsonStart = data.indexOf('[');
        const jsonEnd = data.lastIndexOf(']') + 1;
        if (jsonStart !== -1 && jsonEnd !== 0) {
           rawTransactions = JSON.parse(data.substring(jsonStart, jsonEnd));
        } else {
           rawTransactions = JSON.parse(data);
        }
      } catch (e) {
        console.error("Transactions JSON parse error:", e, "Raw data:", data.substring(0, 100));
        return res.status(500).json({ error: 'Failed to parse JSON output' });
      }

      if (rawTransactions && rawTransactions.error) {
        return res.status(400).json({ error: rawTransactions.error });
      }

      if (!Array.isArray(rawTransactions)) {
        return res.status(500).json({ error: 'Expected an array of transactions from parser' });
      }

      const savingsTransactions = rawTransactions.map(t => {
        let rawDesc = t.description || '';
        let cleanDesc = rawDesc.replace(/\s+/g, ' ').trim();
        cleanDesc = cleanDesc.replace(/^(?:\d{1,2}[/\-. ](?:[A-Za-z]{3,8}|\d{1,2})[/\-. ]\d{2,4})\s*/, '').trim();

        const mappedType = (t.type === 'dr' || t.type === 'debit' || t.type === 'Debit') ? 'debit' : 'credit';
        const { extractPartyName } = require('./narrationEngine');
        const partyName = extractPartyName(cleanDesc);
        
        const category = categorizeTransaction(cleanDesc, mappedType, t.amount);
        const narration = generateNarration(cleanDesc, mappedType, category, partyName);

        return {
          date: t.date,
          amount: t.amount,
          type: mappedType === 'debit' ? 'Debit' : 'Credit',
          category: category,
          narration: narration,
          partyName: partyName, // The extracted party name for the "Accounts" column
          description: cleanDesc // The full description
        };
      });

      res.json({ transactions: savingsTransactions, metadata: metadata });
    } catch (err) {
      console.error('Error processing savings transactions:', err);
      res.status(500).json({ error: 'Failed to process savings transactions' });
    }
  });
});

module.exports = router;
