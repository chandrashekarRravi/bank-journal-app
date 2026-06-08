import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Alert, Platform } from "react-native";

export const generateSavingsPDF = async (transactions, metadata = {}) => {
  if (!transactions || transactions.length === 0) {
    Alert.alert("Error", "No transactions to print");
    return;
  }

  const totalCredits = transactions
    .filter(t => t.type === 'Credit')
    .reduce((sum, t) => sum + parseFloat(t.amount.replace(/,/g, '')), 0);
  const totalDebits = transactions
    .filter(t => t.type === 'Debit')
    .reduce((sum, t) => sum + parseFloat(t.amount.replace(/,/g, '')), 0);
  const netCashFlow = totalCredits - totalDebits;

  const htmlRows = transactions.map((item, index) => {
    const isCredit = item.type === "Credit";
    const narrationColor = isCredit ? "#27AE60" : "#333";
    const amountColor = isCredit ? "#27AE60" : "#E74C3C";
    const amountSuffix = isCredit ? "Cr" : "Dr";

    return `
    <tr>
      <td style="text-align: center; color: #555;">${index + 1}</td>
      <td style="white-space: nowrap; text-align: center; color: #333;">${item.date}</td>
      <td style="text-align: center;"><span style="background-color: #E8F4FD; color: #4A90E2; padding: 4px 8px; border-radius: 4px; font-size: 11px; text-transform: uppercase; font-weight: bold;">${item.category}</span></td>
      <td>
        <div style="font-size: 14px; color: ${narrationColor}; font-weight: ${isCredit ? '600' : 'normal'};">${item.narration}</div>
      </td>
      <td>
        <div style="text-align: right; font-weight: bold; color: ${amountColor};">₹${item.amount} ${amountSuffix}</div>
      </td>
    </tr>
  `}).join('');

  const categoryLedger = {};
  transactions.forEach(t => {
    const cat = t.category || "Misc";
    if (!categoryLedger[cat]) categoryLedger[cat] = { credit: 0, debit: 0, count: 0 };
    const amt = parseFloat(t.amount.replace(/,/g, ''));
    if (t.type === 'Credit') categoryLedger[cat].credit += amt;
    else categoryLedger[cat].debit += amt;
    categoryLedger[cat].count += 1;
  });

  const ledgerHtml = Object.keys(categoryLedger).sort().map(cat => {
    const data = categoryLedger[cat];
    const netFlow = data.credit - data.debit;
    return `
      <tr>
        <td><strong>${cat}</strong></td>
        <td style="text-align: center;">${data.count}</td>
        <td style="text-align: right; color: #27ae60;">₹${data.credit.toFixed(2)}</td>
        <td style="text-align: right; color: #e74c3c;">₹${data.debit.toFixed(2)}</td>
        <td style="text-align: right; font-weight: bold; color: ${netFlow >= 0 ? '#27ae60' : '#e74c3c'};">₹${netFlow.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const pieColors = ["#e74c3c", "#f39c12", "#8e44ad", "#2980b9", "#d35400", "#c0392b", "#16a085"];
  const debitArray = Object.keys(categoryLedger).map(cat => ({ name: cat, debit: categoryLedger[cat].debit })).filter(l => l.debit > 0);
  const totalPieDebit = debitArray.reduce((sum, l) => sum + l.debit, 0);
  let conicGradientArgs = [];
  let currentPercentage = 0;
  
  const pieLegendHtml = debitArray.map((l, i) => {
    let percentage = (l.debit / totalPieDebit) * 100;
    let color = pieColors[i % pieColors.length];
    conicGradientArgs.push(`${color} ${currentPercentage}% ${currentPercentage + percentage}%`);
    currentPercentage += percentage;
    return `
      <div style="display: flex; align-items: center; margin-bottom: 8px;">
        <div style="width: 14px; height: 14px; background-color: ${color}; margin-right: 10px; border-radius: 3px;"></div>
        <span style="font-size: 13px; color: #333;"><strong>${l.name}</strong> - ₹${l.debit.toFixed(2)} (${percentage.toFixed(1)}%)</span>
      </div>
    `;
  }).join('');

  const svgPaths = debitArray.map((l, i) => {
    let percentage = (l.debit / totalPieDebit);
    let color = pieColors[i % pieColors.length];
    
    let dash = percentage * 100;
    let strokeDashOffset = -currentPercentage * 100;
    
    currentPercentage += percentage;
    
    return `<circle r="15.915494309189533" cx="21" cy="21" fill="transparent" stroke="${color}" stroke-width="31.83098861837906" stroke-dasharray="${dash} ${100 - dash}" stroke-dashoffset="${strokeDashOffset}" />`;
  });

  const pieChartSvg = `
    <svg width="200" height="200" viewBox="0 0 42 42" style="transform: rotate(-90deg); border-radius: 50%; box-shadow: 0 4px 8px rgba(0,0,0,0.1); background: #fff;">
      ${svgPaths.join('\\n')}
    </svg>
  `;

  const htmlContent = `
    <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px; font-size: 13px; color: #333; background-color: #fff; }
          .header-container { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #27ae60; padding-bottom: 20px; }
          .logo { font-size: 24px; font-weight: 800; color: #27ae60; letter-spacing: 1px; margin-bottom: 5px; }
          .doc-title { font-size: 14px; color: #7f8c8d; text-transform: uppercase; letter-spacing: 2px; }
          
          .summary-table { width: 100%; margin-bottom: 30px; border-collapse: collapse; }
          .summary-table td { padding: 8px; border: 1px solid #e0e0e0; }
          .summary-label { font-weight: bold; background-color: #f9f9f9; width: 30%; }
          .summary-value { text-align: left; }
          
          .main-table { width: 100%; border-collapse: collapse; margin-top: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
          .main-table th, .main-table td { border: 1px solid #e0e0e0; padding: 14px 12px; vertical-align: top; }
          .main-table th { background-color: #f4f6f7; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #2c3e50; border-bottom: 2px solid #bdc3c7; }
          .main-table tr:nth-child(even) { background-color: #fafbfc; }
          
          .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #95a5a6; border-top: 1px solid #eee; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div class="logo">SAVINGS ACCOUNT TRANSACTION REPORT</div>
          <div class="doc-title">Generated securely via Savings Analyzer</div>
        </div>

        <table class="summary-table">
          <tr>
            <td class="summary-label">Account Holder Name</td>
            <td class="summary-value">${metadata.holderName || "User (Auto-Extracted)"}</td>
            <td class="summary-label">Total Credits</td>
            <td class="summary-value" style="color: #27ae60; font-weight: bold;">₹${totalCredits.toFixed(2)}</td>
          </tr>
          <tr>
            <td class="summary-label">Transaction Count</td>
            <td class="summary-value">${transactions.length}</td>
            <td class="summary-label">Total Debits</td>
            <td class="summary-value" style="color: #e74c3c; font-weight: bold;">₹${totalDebits.toFixed(2)}</td>
          </tr>
          <tr>
            <td colspan="2" style="background-color: transparent; border: none;"></td>
            <td class="summary-label">Net Cash Flow</td>
            <td class="summary-value" style="color: ${netCashFlow >= 0 ? '#27ae60' : '#e74c3c'}; font-weight: bold;">₹${netCashFlow.toFixed(2)}</td>
          </tr>
        </table>

        <table class="main-table">
          <thead>
            <tr>
              <th style="width: 5%; text-align: center;">#</th>
              <th style="width: 15%; text-align: center;">Date</th>
              <th style="width: 15%; text-align: center;">Category</th>
              <th style="width: 50%;">Particulars</th>
              <th style="width: 15%; text-align: right;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${htmlRows}
          </tbody>
        </table>

        <div style="page-break-before: always; margin-top: 40px;">
          <h3 style="color: #2c3e50; border-bottom: 2px solid #bdc3c7; padding-bottom: 10px;">Expense Breakdown</h3>
          
          <div style="display: flex; flex-direction: row; align-items: center; justify-content: center; margin-top: 30px; margin-bottom: 40px;">
            ${pieChartSvg}
            <div style="margin-left: 50px; display: flex; flex-direction: column;">
              ${pieLegendHtml}
            </div>
          </div>

          <h3 style="color: #2c3e50; border-bottom: 2px solid #bdc3c7; padding-bottom: 10px;">Category Ledger Summary</h3>
          <table class="main-table">
            <thead>
              <tr>
                <th style="width: 30%;">Category</th>
                <th style="width: 10%; text-align: center;">Count</th>
                <th style="width: 20%; text-align: right;">Total Credits</th>
                <th style="width: 20%; text-align: right;">Total Debits</th>
                <th style="width: 20%; text-align: right;">Net Flow</th>
              </tr>
            </thead>
            <tbody>
              ${ledgerHtml}
            </tbody>
          </table>
        </div>

        <div class="footer">
          Report generated automatically by Savings Analyzer module.<br>
          For personal tracking and analysis only.
        </div>
      </body>
    </html>
  `;

  if (Platform.OS === "web") {
    try {
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      document.body.appendChild(iframe);
      iframe.contentDocument.write(htmlContent);
      iframe.contentDocument.close();
      
      iframe.onload = () => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      };
    } catch (e) {
      console.error(e);
      Alert.alert("Print Error", "Could not print document.");
    }
    return;
  }

  try {
    const { uri } = await Print.printToFileAsync({ html: htmlContent });
    
    // Create a safe, custom filename using the holder's name
    const safeName = (metadata.holderName || "SavingsReport").replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_');
    const customUri = `${FileSystem.documentDirectory}${safeName}_Savings_Report.pdf`;
    
    // Move the temp file to our named custom file
    await FileSystem.moveAsync({
      from: uri,
      to: customUri
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(customUri);
    } else {
      Alert.alert("Success", "PDF Generated but sharing is not available on this device");
    }
  } catch (error) {
    console.error("PDF generation failed", error);
    Alert.alert("Error", "Failed to generate PDF");
  }
};
