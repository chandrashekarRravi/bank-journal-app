import sys
import json
import fitz
import re

# Force UTF-8 encoding for standard output on Windows
sys.stdout.reconfigure(encoding='utf-8')

def extract_metadata(pdf_path):
    metadata = {
        "holderName": "User (Auto-Extracted)",
        "bankName": "Bank Account",
        "accountNumber": "XXXX-XXXX"
    }
    
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for i in range(min(3, len(doc))): # check up to 3 pages for metadata
            page = doc[i]
            t = page.get_text()
            if t: text += t + "\n"
        
        if text:
                upper_text = text.upper()
                
                # 1. Bank Name Extraction
                bank_mapping = {
                    "HDFC": "HDFC Bank", "ICICI": "ICICI Bank", "AXIS": "Axis Bank", 
                    "KOTAK": "Kotak Mahindra Bank", "STATE BANK": "State Bank of India", 
                    "SBI": "State Bank of India", "CANARA": "Canara Bank", 
                    "BARODA": "Bank of Baroda", "BOB": "Bank of Baroda", 
                    "UNION BANK": "Union Bank of India", "GRAMEENA": "Karnataka Grameena Bank", 
                    "PAYTM": "Paytm Payments Bank"
                }
                for key, name in bank_mapping.items():
                    if key in upper_text[:2000]:
                        metadata["bankName"] = name
                        break

                # 2. Account Number Extraction
                acc_match = re.search(r'(?:A/C|ACC|ACCOUNT)[^\d]{0,30}?(\d{9,18})', upper_text)
                if not acc_match:
                    # Look for any 9-18 digit string in the first 1500 chars
                    all_digits = re.findall(r'\b\d{9,18}\b', upper_text[:1500])
                    for d in all_digits:
                        if not d.startswith("1800") and len(d) > 8:
                            acc_match = re.match(r'(.*)', d) # mock match
                            break

                if acc_match:
                    acc_num = acc_match.group(1)
                    metadata["accountNumber"] = "X" * max(0, len(acc_num)-4) + acc_num[-4:]

                # 3. Holder Name Extraction
                name_match = None
                
                # Pattern A: Name / Holder Name : [Name]
                m_a = re.search(r'\b(?:NAME|HOLDER)[^:\n]*:\s*([A-Za-z\s]{3,40})(?:\n|[0-9])', upper_text)
                # Pattern B: MR. / MS. [Name]
                m_b = re.search(r'\b(?:MR\.|MRS\.|MS\.|MR\s|MRS\s|MS\s)([A-Za-z\s]{3,40})\b', upper_text)
                # Pattern C: Disconnected Customer Name (Grameena Bank style)
                m_c = re.search(r'CUSTOMER NAME[\s\S]{0,150}?:([A-Za-z\s]{3,40})\n', upper_text)
                # Pattern D: NAME [Name]
                m_d = re.search(r'\bNAME\s+([A-Za-z\s]{3,40})\n', upper_text)

                if m_a: name_match = m_a.group(1)
                elif m_c: name_match = m_c.group(1)
                elif m_b: name_match = m_b.group(1)
                elif m_d: name_match = m_d.group(1)

                if name_match:
                    clean_name = name_match.strip()
                    # Filter out garbage
                    if len(clean_name) > 3 and "BANK" not in clean_name and "STATEMENT" not in clean_name:
                        metadata["holderName"] = clean_name

    except Exception as e:
        pass
        
    print(json.dumps(metadata))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        extract_metadata(sys.argv[1])
