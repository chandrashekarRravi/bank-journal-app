const express = require('express');
const router = express.Router();
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

router.post('/upload-tally', upload.single('statement'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const pdfPath = req.file.path;
  const scriptPath = path.join(__dirname, '../../python_service/tally/tallyExporter.py');

  const pythonProcess = spawn('python', [scriptPath, pdfPath]);
  
  let dataBuffer = '';
  let errorBuffer = '';

  pythonProcess.stdout.on('data', (data) => {
    dataBuffer += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    errorBuffer += data.toString();
  });

  pythonProcess.on('close', (code) => {
    fs.unlink(pdfPath, (err) => {
      if (err) console.error('Failed to delete uploaded pdf:', err);
    });

    if (code !== 0) {
      console.error(`Tally Exporter Python Script Error: ${errorBuffer}`);
      return res.status(500).json({ error: 'Error generating Tally export.', details: errorBuffer });
    }

    try {
      const result = JSON.parse(dataBuffer);
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      // result should contain URLs to the generated XML and Excel files.
      res.json(result);
    } catch (e) {
      console.error('Failed to parse Python output:', e, 'Raw Output:', dataBuffer);
      res.status(500).json({ error: 'Internal server error while parsing python response' });
    }
  });
});

module.exports = router;
