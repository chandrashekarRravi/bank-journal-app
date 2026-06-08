const categorizeTransaction = (description, type, amount) => {
  const desc = (description || '').toUpperCase();

  // Income / Salary
  if (type === 'credit') {
    if (/\bSALARY\b/.test(desc)) return 'Salary';
    if (/\bINT\b|\bINTEREST\b/.test(desc)) return 'Interest';
    if (/\bNEFT\b|\bUPI\b|\bIMPS\b|\bRTGS\b/.test(desc)) return 'Income';
    if (/UPI AR/.test(desc)) return 'UPI Payment';
    if (/UPI AB/.test(desc)) return 'UPI Receipt';

    return 'Income';
  }

  // ATM
  if (/\bATM\b|\bCASH WDL\b|\bWITHDRAWAL\b/.test(desc)) return 'ATM';

  // Bank Charges
  if (/\bCHRG\b|\bCHARGES\b|\bFEE\b|\bGST\b/.test(desc)) return 'Bank Charges';

  // Food
  if (/\bZOMATO\b|\bSWIGGY\b|\bDOMINOS\b|\bPIZZA HUT\b|\bMCDONALDS\b|\bKFC\b|\bFOOD\b|\bRESTAURANT\b|\bCAFE\b/.test(desc)) return 'Food';

  // Recharge
  if (/\bJIO\b|\bAIRTEL\b|\bBSNL\b|\bVI\b|\bRECHARGE\b/.test(desc)) return 'Recharge';

  // Bills
  if (/\bBESCOM\b|\bKPTCL\b|\bELECTRICITY\b|\bWATER\b|\bINTERNET\b|\bBROADBAND\b|\bACT FIBERNET\b|\bHATHWAY\b/.test(desc)) return 'Bills';

  // Shopping
  if (/\bAMAZON\b|\bFLIPKART\b|\bMYNTRA\b|\bAJIO\b|\bMEESHO\b|\bSHOPPING\b/.test(desc)) return 'Shopping';

  // Fuel
  if (/\bINDIAN OIL\b|\bIOCL\b|\bHP\b|\bBPCL\b|\bPETROL\b|\bFUEL\b|\bSHELL\b/.test(desc)) return 'Fuel';

  // Medical
  if (/\bAPOLLO\b|\bPHARMACY\b|\bMEDICAL\b|\bHOSPITAL\b|\bCLINIC\b|\bNETMEDS\b|\bPHARMEASY\b/.test(desc)) return 'Medical';

  // Travel
  if (/\bIRCTC\b|\bUBER\b|\bOLA\b|\bRAPIDO\b|\bMAKEMYTRIP\b|\bYATRA\b|\bFLIGHT\b|\bTICKET\b|\bBUS\b|\bRED BUS\b/.test(desc)) return 'Travel';

  // Investment
  if (/\bZERODHA\b|\bGROWW\b|\bMUTUAL FUND\b|\bUPSTOX\b|\bSIP\b|\bFD\b/.test(desc)) return 'Investment';

  // Transfer
  if (/\bNEFT\b|\bUPI\b|\bIMPS\b|\bRTGS\b|\bTRF\b/.test(desc)) return 'Transfer';

  return 'Others';
};

module.exports = {
  categorizeTransaction,
};
