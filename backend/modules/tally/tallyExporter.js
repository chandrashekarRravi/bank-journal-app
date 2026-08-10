const ExcelJS = require('exceljs');

/**
 * Converts a DD/MM/YYYY or DD-MM-YYYY or "DD Mon YYYY" date string to YYYYMMDD for Tally.
 */
function toTallyDate(dateStr) {
  if (!dateStr || dateStr === 'Unknown') return '';
  // Try DD/MM/YYYY or DD-MM-YYYY
  const parts = dateStr.split(/[\/\-\. ]/);
  if (parts.length === 3) {
    const d = parts[0].padStart(2, '0');
    const mRaw = parts[1];
    const y = parts[2].length === 2 ? '20' + parts[2] : parts[2];
    // Month could be numeric or name
    const MONTHS = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
                     jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
    const m = isNaN(mRaw) ? (MONTHS[mRaw.toLowerCase()] || '01') : mRaw.padStart(2, '0');
    return `${y}${m}${d}`;
  }
  return '';
}

/**
 * Generates an Excel workbook buffer from transactions.
 * Returns a Buffer.
 */
async function generateExcel(transactions, accountName = 'Bank Account') {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Banklyt';
  wb.created = new Date();

  const ws = wb.addWorksheet('Transactions');

  ws.columns = [
    { header: 'Date',        key: 'date',        width: 14 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Type',        key: 'type',        width: 8  },
    { header: 'Debit (₹)',   key: 'debit',       width: 14 },
    { header: 'Credit (₹)',  key: 'credit',      width: 14 },
    { header: 'Category',    key: 'category',    width: 16 },
    { header: 'Ref No',      key: 'refNo',       width: 20 },
  ];

  // Style header row
  ws.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1448AB' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  ws.getRow(1).height = 22;

  let totalDebit = 0, totalCredit = 0;

  transactions.forEach((t, i) => {
    const amt = parseFloat((t.amount || '0').toString().replace(/,/g, '')) || 0;
    const isCredit = (t.type || '').toLowerCase() === 'credit' || (t.type || '').toLowerCase() === 'cr';
    const debitAmt  = isCredit ? 0 : amt;
    const creditAmt = isCredit ? amt : 0;
    totalDebit  += debitAmt;
    totalCredit += creditAmt;

    const row = ws.addRow({
      date:        t.date || '',
      description: t.description || '',
      type:        isCredit ? 'Credit' : 'Debit',
      debit:       debitAmt  > 0 ? debitAmt  : '',
      credit:      creditAmt > 0 ? creditAmt : '',
      category:    t.category || 'Misc',
      refNo:       t.refNo || '',
    });

    // Alternate row shading
    if (i % 2 === 1) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } };
      });
    }

    // Color debit/credit cells
    row.getCell('debit').font  = { color: { argb: 'FFE74C3C' } };
    row.getCell('credit').font = { color: { argb: 'FF27AE60' } };
  });

  // Totals row
  const totalRow = ws.addRow({
    date: 'TOTAL', description: '', type: '',
    debit: totalDebit, credit: totalCredit,
    category: '', refNo: ''
  });
  totalRow.eachCell(cell => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF0FF' } };
  });
  totalRow.getCell('debit').font  = { bold: true, color: { argb: 'FFE74C3C' } };
  totalRow.getCell('credit').font = { bold: true, color: { argb: 'FF27AE60' } };

  // Freeze header
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  return await wb.xlsx.writeBuffer();
}

/**
 * Generates a Tally Prime-compatible XML string from transactions.
 */
function generateTallyXML(transactions, companyName = 'My Company', bankLedger = 'Bank Account') {
  const escXML = s => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const vouchers = transactions.map(t => {
    const amt = parseFloat((t.amount || '0').toString().replace(/,/g, '')) || 0;
    const isCredit = (t.type || '').toLowerCase() === 'credit' || (t.type || '').toLowerCase() === 'cr';
    const vchType  = isCredit ? 'Receipt' : 'Payment';
    const partyLedger = escXML(t.category && t.category !== 'Misc' ? t.category : (t.description || 'Miscellaneous').substring(0, 40));
    const narration = escXML(t.description || '');
    const tallyDate = toTallyDate(t.date);
    const amtStr = amt.toFixed(2);

    // For Receipt (credit): Bank Dr, Party Cr
    // For Payment (debit):  Party Dr, Bank Cr
    const bankDeemedPositive  = isCredit ? 'Yes' : 'No';
    const partyDeemedPositive = isCredit ? 'No'  : 'Yes';
    const bankAmount  = isCredit ? `-${amtStr}` : amtStr;
    const partyAmount = isCredit ? amtStr : `-${amtStr}`;

    return `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="${vchType}" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>${tallyDate}</DATE>
            <EFFECTIVEDATE>${tallyDate}</EFFECTIVEDATE>
            <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>
            <NARRATION>${narration}</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${escXML(bankLedger)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${bankDeemedPositive}</ISDEEMEDPOSITIVE>
              <AMOUNT>${bankAmount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${partyLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${partyDeemedPositive}</ISDEEMEDPOSITIVE>
              <AMOUNT>${partyAmount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escXML(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${vouchers}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

module.exports = { generateExcel, generateTallyXML };
