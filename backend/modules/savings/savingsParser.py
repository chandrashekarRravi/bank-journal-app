import sys
import json
import fitz
import re

# Force UTF-8 encoding for standard output on Windows
sys.stdout.reconfigure(encoding='utf-8')

def parse_pdf(pdf_path):
    transactions = []
    current_trans = None
    
    try:
        doc = fitz.open(pdf_path)
        
        if doc.needs_pass:
            print(json.dumps({"error": "Password protected PDF. Please remove the password and try again."}))
            return
            
        full_text = ""
        for page in doc:
            text = page.get_text()
            if not text:
                continue
            full_text += text
            
            lines = text.split('\n')
            for line in lines:
                line = line.strip()
                if not line: continue 
                    
                # Ignore common header, footer, and summary lines
                ignore_patterns = [
                    r'(?i)registered\s+office',
                    r'(?i)page\s+\d+\s+of\s+\d+',
                    r'(?i)statement\s+of\s+account',
                    r'(?i)customer\s+id',
                    r'(?i)account\s+no',
                    r'(?i)statement\s+period',
                    r'(?i)opening\s+balance',
                    r'(?i)total\s+debit',
                    r'(?i)total\s+credit',
                    r'(?i)closing\s+balance',
                    r'(?i)always\s+you\s+first', # IDFC tag
                    r'(?i)branch\s+name',
                    r'(?i)ifsc\s+code',
                ]
                
                if any(re.search(pattern, line) for pattern in ignore_patterns):
                    continue

                # Check if line starts with a date (Transaction Start)
                # Fix 3: Improved date matching for DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY, DD Mon YYYY, DD-Mon-YYYY
                date_match = re.search(r'^(?:\d+\s+)?(\d{1,2}[/\-. ](?:[A-Za-z]{3,8}|\d{1,2})[/\-. ]\d{2,4})', line)
                txn_code_match = re.match(r'^(UPI|NEFT|RTGS|IMPS|ACH|CMS|TRF|CHQ)', line, re.IGNORECASE)
                
                if txn_code_match and (current_trans is None or current_trans.get("has_amounts", False)):
                    # Starts with a txn code, and previous transaction is done (or this is the first)
                    if current_trans:
                        transactions.append(current_trans)
                    current_trans = {
                        "date": "Unknown",
                        "description_parts": [line],
                        "type": "unknown",
                        "amount": "0.00",
                        "amount_val": 0.0,
                        "balance_val": None,
                        "has_amounts": False
                    }
                elif date_match:
                    date = date_match.group(1).strip()
                    rest = line[date_match.end():].strip()
                    
                    if current_trans is None or current_trans.get("has_amounts", False):
                        # Start new transaction
                        if current_trans:
                            transactions.append(current_trans)
                        current_trans = {
                            "date": date,
                            "description_parts": [rest] if rest else [],
                            "type": "unknown",
                            "amount": "0.00",
                            "amount_val": 0.0,
                            "balance_val": None,
                            "has_amounts": False
                        }
                    else:
                        # We are inside a transaction that started with a txn code (like UPI/)
                        # We just found its date!
                        if current_trans["date"] == "Unknown":
                            current_trans["date"] = date
                        if rest:
                            current_trans["description_parts"].append(rest)
                elif current_trans:
                    current_trans["description_parts"].append(line)
                    
                # Check if this line has amounts to mark the transaction as "having amounts"
                if current_trans and re.search(r'[-]?\d[\d,]*\.\d{2}', line):
                    # It has amounts. Next date or txn code will start a new transaction.
                    current_trans["has_amounts"] = True

        if current_trans:
            transactions.append(current_trans)

        # --- POST-PROCESSING: Extract amounts from accumulated text ---
        for trans in transactions:
            full_block = " ".join(trans["description_parts"])
            
            # Find all numbers formatted like money (e.g., 1,250.00, 10,00,000.00, -1250.00, 1.00)
            amounts_found = re.findall(r'([-]?\d[\d,]*\.\d{2})\s*(Cr|Dr|CR|DR|Cr\.|Dr\.)?', full_block, re.IGNORECASE)
            
            if amounts_found:
                # Logic: The last amount is usually the Balance, 
                # the one before it is the Transaction Amount.
                if len(amounts_found) >= 2:
                    amt_str, ind = amounts_found[-2]
                    bal_str, bal_ind = amounts_found[-1]
                    trans["amount"] = amt_str.replace('-', '')
                    trans["amount_val"] = float(amt_str.replace(',', '').replace('-', ''))
                    trans["balance_val"] = float(bal_str.replace(',', '').replace('-', ''))
                    
                    # Deduce basic type from negative signs if present
                    if '-' in amt_str:
                        trans["type"] = "debit"
                else:
                    amt_str, ind = amounts_found[0]
                    trans["amount"] = amt_str.replace('-', '')
                    trans["amount_val"] = float(amt_str.replace(',', '').replace('-', ''))
                    trans["balance_val"] = float(amt_str.replace(',', '').replace('-', ''))
                
                # Fix 5: Ensure type detection checks at boundaries to prevent false DR/CR inside descriptions.
                if re.search(r'\bCR\b', ind or "", re.IGNORECASE):
                    trans["type"] = "credit"
                elif re.search(r'\bDR\b', ind or "", re.IGNORECASE):
                    trans["type"] = "debit"
                elif trans["type"] == "unknown":
                    if re.search(r'\bDR\b', full_block, re.IGNORECASE) or "/DR/" in full_block.upper():
                        trans["type"] = "debit"
                    elif re.search(r'\bCR\b', full_block, re.IGNORECASE) or "/CR/" in full_block.upper():
                        trans["type"] = "credit"

            # Clean up the description by joining parts and removing the money strings
            final_desc = " ".join(trans["description_parts"])
            # Remove the amounts from the description string so it's just text
            final_desc = re.sub(r'[-]?\d[\d,]*\.\d{2}\s*(?i:Cr|Dr|CR|DR|Cr\.|Dr\.)?', '', final_desc).strip()
            trans["description"] = final_desc
            
            # Clean up temporary helper fields
            del trans["description_parts"]

        # Final pass: Deduce type using balance math
        for i in range(len(transactions)):
            if transactions[i]["type"] == "unknown" and transactions[i].get("balance_val") is not None:
                amt = transactions[i].get("amount_val", 0)
                bal = transactions[i]["balance_val"]
                
                # Check with previous (chronological assumption)
                if i > 0 and transactions[i-1].get("balance_val") is not None:
                    diff = bal - transactions[i-1]["balance_val"]
                    if abs(diff - amt) < 0.01:
                        transactions[i]["type"] = "credit"
                        continue
                    elif abs(diff + amt) < 0.01:
                        transactions[i]["type"] = "debit"
                        continue

                # Check with next (reverse-chronological assumption)
                if i < len(transactions) - 1 and transactions[i+1].get("balance_val") is not None:
                    diff = bal - transactions[i+1]["balance_val"]
                    if abs(diff - amt) < 0.01:
                        transactions[i]["type"] = "credit"
                        continue
                    elif abs(diff + amt) < 0.01:
                        transactions[i]["type"] = "debit"
                        continue

        # Fix 8: Properly close the document to free memory
        doc.close()

        # Remove numeric helper for clean JSON output
        # If we couldn't find any text, it's likely a scanned image PDF
        if not full_text.strip() and not transactions:
            print(json.dumps({"error": "Scanned PDF detected. The parser requires a digitally generated PDF downloaded directly from the bank. Image-based or scanned PDFs are not supported without OCR."}))
            return

        for t in transactions:
            # Fix 9: Prevent KeyError when removing fields
            t.pop("amount_val", None)
            t.pop("balance_val", None)
            t.pop("has_amounts", None)

    except Exception as e:
        if "password" in str(e).lower() or "encrypt" in str(e).lower():
            print(json.dumps({"error": "Password protected PDF. Please remove the password and try again."}))
        else:
            print(json.dumps({"error": f"Failed to parse PDF: {str(e)}"}))
        return

    print(json.dumps(transactions, indent=4))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python savingsParser.py <path_to_pdf>")
        sys.exit(1)
    parse_pdf(sys.argv[1])