"""
Tally PDF Parser — handles HDFC, SBI, ICICI, Canara, Axis and generic bank statements.
Outputs a JSON array with: date, description, refNo, amount, type, balance_val.
Usage: python tallyParser.py <path_to_pdf>
"""

import sys
import json
import re
import fitz  # PyMuPDF

sys.stdout.reconfigure(encoding='utf-8')


# ─── Ignore patterns for header / footer / summary lines ──────────────────────
IGNORE = [
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
    r'(?i)always\s+you\s+first',
    r'(?i)branch\s+name',
    r'(?i)ifsc\s+code',
    r'(?i)account\s+holder',
    r'(?i)joint\s+holder',
    r'(?i)nominee',
]

# Money pattern: e.g. 1,25,000.00  /  -500.00
MONEY_RE = re.compile(r'([-]?\d[\d,]*\.\d{2})\s*(Cr|Dr|CR|DR|Cr\.|Dr\.)?', re.IGNORECASE)

# Date at start of line (alphabetic month required to avoid UPI timestamps)
DATE_RE = re.compile(r'^(?:\d+\s+)?(\d{1,2}[\/\-. ][A-Za-z]{3,9}[\/\-. ]\d{2,4}|\d{2}[\/\-]\d{2}[\/\-]\d{4})')

# Transaction-type code at line start
TXN_CODE_RE = re.compile(r'^(UPI|NEFT|RTGS|IMPS|ACH|CMS|TRF|CHQ|ATM|POS|NACH)', re.IGNORECASE)


def _parse_transactions(lines):
    transactions = []
    cur = None

    for line in lines:
        line = line.strip()
        if not line:
            continue
        if any(re.search(p, line) for p in IGNORE):
            continue

        date_m = DATE_RE.search(line)
        code_m = TXN_CODE_RE.match(line)

        if code_m and (cur is None or cur.get('has_amounts')):
            if cur:
                transactions.append(cur)
            cur = _new(date='Unknown', first_line=line)

        elif date_m:
            date = date_m.group(1).strip()
            rest = line[date_m.end():].strip()
            if cur is None or cur.get('has_amounts'):
                if cur:
                    transactions.append(cur)
                cur = _new(date=date, first_line=rest)
            else:
                if cur['date'] == 'Unknown':
                    cur['date'] = date
                if rest:
                    cur['parts'].append(rest)

        elif cur:
            cur['parts'].append(line)

        if cur and MONEY_RE.search(line):
            cur['has_amounts'] = True

    if cur:
        transactions.append(cur)
    return transactions


def _new(date, first_line):
    return {
        'date': date,
        'parts': [first_line] if first_line else [],
        'has_amounts': False,
    }


def _post_process(transactions):
    result = []
    for t in transactions:
        block = ' '.join(t['parts'])
        amounts = MONEY_RE.findall(block)

        amt_str, debit, credit, balance_val = '0.00', 0.0, 0.0, None
        txn_type = 'unknown'

        if amounts:
            if len(amounts) >= 3:
                # Standard 3-col: Withdrawal | Deposit | Balance
                w = float(amounts[-3][0].replace(',', '').replace('-', '') or 0)
                d = float(amounts[-2][0].replace(',', '').replace('-', '') or 0)
                b = float(amounts[-1][0].replace(',', '').replace('-', '') or 0)
                balance_val = b
                if d > 0 and w == 0:
                    txn_type, credit = 'credit', d
                    amt_str = amounts[-2][0].replace('-', '')
                elif w > 0 and d == 0:
                    txn_type, debit = 'debit', w
                    amt_str = amounts[-3][0].replace('-', '')
                else:
                    txn_type, debit = 'debit', w
                    amt_str = amounts[-3][0].replace('-', '')
            elif len(amounts) == 2:
                a_str = amounts[-2][0]
                b_str = amounts[-1][0]
                balance_val = float(b_str.replace(',', '').replace('-', '') or 0)
                amt_str     = a_str.replace('-', '')
                if '-' in a_str:
                    txn_type = 'debit'
            else:
                amt_str = amounts[0][0].replace('-', '')

        if txn_type == 'unknown':
            if re.search(r'\bCR\b|/CR/', block, re.IGNORECASE):
                txn_type = 'credit'
            elif re.search(r'\bDR\b|/DR/', block, re.IGNORECASE):
                txn_type = 'debit'

        # Ref number: first long alphanumeric or pure numeric
        ref_m = re.search(r'\b([A-Z0-9]{8,20})\b', block) or re.search(r'\b(\d{8,15})\b', block)
        ref_no = ref_m.group(1) if ref_m else ''

        # Clean description: remove money strings, leading branch/ref prefixes
        desc = re.sub(r'[-]?\d[\d,]*\.\d{2}\s*(?:Cr|Dr|CR|DR|Cr\.|Dr\.)?', '', block, flags=re.IGNORECASE).strip()
        desc = re.sub(r'^\d{1,4}\s+\d{6,}\s*', '', desc).strip()

        result.append({
            'date':        t['date'],
            'description': desc,
            'refNo':       ref_no,
            'amount':      amt_str,
            'type':        txn_type,
            'balance_val': balance_val,
        })

    # Final pass: deduce type from running balance
    for i in range(1, len(result)):
        if result[i]['type'] == 'unknown':
            b_cur  = result[i]['balance_val']
            b_prev = result[i-1]['balance_val']
            amt    = float(result[i]['amount'].replace(',', '') or 0)
            if b_cur is not None and b_prev is not None:
                diff = b_cur - b_prev
                if abs(diff - amt) < 0.02:
                    result[i]['type'] = 'credit'
                elif abs(diff + amt) < 0.02:
                    result[i]['type'] = 'debit'
                else:
                    result[i]['type'] = 'debit'

    return result


def parse_pdf(pdf_path):
    try:
        doc = fitz.open(pdf_path)
        if doc.needs_pass:
            print(json.dumps({'error': 'Password-protected PDF. Please remove the password.'}))
            return

        all_lines = []
        full_text = ''
        for page in doc:
            text = page.get_text()
            full_text += text
            all_lines.extend(text.split('\n'))
        doc.close()

        if not full_text.strip():
            print(json.dumps({'error': 'Scanned/image PDF detected. Use a digitally-generated bank PDF.'}))
            return

        raw  = _parse_transactions(all_lines)
        data = _post_process(raw)
        print(json.dumps(data, indent=2))

    except Exception as e:
        if 'password' in str(e).lower() or 'encrypt' in str(e).lower():
            print(json.dumps({'error': 'Password-protected PDF. Please remove the password.'}))
        else:
            print(json.dumps({'error': f'Failed to parse PDF: {e}'}))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python tallyParser.py <path_to_pdf>')
        sys.exit(1)
    parse_pdf(sys.argv[1])
