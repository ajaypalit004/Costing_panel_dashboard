import pandas as pd
import html
import os
import glob
from playwright.sync_api import sync_playwright

def generate_pdf():
    # Find latest csv in the dashboard folder
    csv_files = glob.glob('costing-report*.csv')
    if not csv_files:
        print("No CSV found.")
        return
    csv_path = max(csv_files, key=os.path.getctime)
    df = pd.read_csv(csv_path)

    # Filter out blank rows, summary rows (e.g. "Total Rows", "Total Leads", etc.), and non-numeric IDs
    df['ID_num'] = pd.to_numeric(df.iloc[:, 0], errors='coerce')
    df = df.dropna(subset=['ID_num'])
    df['ID'] = df['ID_num'].astype(int)

    # Filter out any summary rows in Customer column
    cust_str = df['Customer'].astype(str).str.strip().str.lower()
    df = df[~cust_str.str.startswith('total ')]
    df = df[~cust_str.isin(['total rows', 'total leads', 'total users', 'total statuses', 'total offer price', 'nan', '', '-'])]

    # Clean Assigned To
    df['Assigned To'] = df['Assigned To'].fillna('Unassigned').astype(str).str.strip()
    df['Assigned To'] = df['Assigned To'].replace(r'^\s*$', 'Unassigned', regex=True)

    # Sort by enquiry date, latest first
    df['Enquiry Date dt'] = pd.to_datetime(df['Enquiry Date'], errors='coerce')
    df = df.sort_values(by=['Enquiry Date dt', 'ID'], ascending=[False, False])

    def format_inr(val):
        if pd.isna(val) or val == '' or val == 0:
            return '-'
        try:
            val = float(val)
            parts = f'{val:.2f}'.split('.')
            int_part = parts[0]
            dec_part = parts[1]
            if len(int_part) <= 3:
                res = int_part
            else:
                last3 = int_part[-3:]
                rest = int_part[:-3]
                groups = []
                while len(rest) > 2:
                    groups.insert(0, rest[-2:])
                    rest = rest[:-2]
                if rest:
                    groups.insert(0, rest)
                res = ','.join(groups) + ',' + last3
            if dec_part == '00':
                return '₹ ' + res
            return '₹ ' + res + '.' + dec_part
        except:
            return str(val)

    def format_status(val):
        if pd.isna(val): return '-'
        val_str = str(val).strip()
        label = val_str.replace('_', ' ').title()
        badge_class = 'badge-default'
        if val_str.lower() == 'won': badge_class = 'badge-won'
        elif val_str.lower() == 'quoted': badge_class = 'badge-quoted'
        elif val_str.lower() == 'under_negotiation': badge_class = 'badge-negotiation'
        elif val_str.lower() == 'pending': badge_class = 'badge-pending'
        elif val_str.lower() == 'lost': badge_class = 'badge-lost'
        elif 'tech' in val_str.lower(): badge_class = 'badge-tech'
        return f'<span class="badge {badge_class}">{html.escape(label)}</span>'

    def format_costing_status(val):
        if pd.isna(val): return '-'
        val_str = str(val).strip()
        label = val_str.replace('_', ' ').title()
        badge_class = 'cost-default'
        if val_str.lower() == 'done': badge_class = 'cost-done'
        elif val_str.lower() in ['revised_offer_submitted', 'submitted', 'accepted']: badge_class = 'cost-submitted'
        elif val_str.lower() == 'pending': badge_class = 'cost-pending'
        elif 'progress' in val_str.lower() or 'negotiat' in val_str.lower(): badge_class = 'cost-progress'
        elif 'query' in val_str.lower() or 'rejected' in val_str.lower(): badge_class = 'cost-query'
        return f'<span class="cost-badge {badge_class}">{html.escape(label)}</span>'

    df['Current Status Lower'] = df['Current Status'].astype(str).str.lower()
    total_leads = len(df)
    won_count = (df['Current Status Lower'] == 'won').sum()
    quoted_count = (df['Current Status Lower'] == 'quoted').sum()
    pending_count = (df['Current Status Lower'] == 'pending').sum()
    negotiation_count = (df['Current Status Lower'] == 'under_negotiation').sum()
    lost_count = (df['Current Status Lower'] == 'lost').sum()

    df['Offer Price Num'] = pd.to_numeric(df['Offer Price'], errors='coerce').fillna(0)
    total_pipeline = df['Offer Price Num'].sum()
    won_value = df[df['Current Status Lower'] == 'won']['Offer Price Num'].sum()
    quoted_value = df[df['Current Status Lower'] == 'quoted']['Offer Price Num'].sum()

    # Costing Done rule: Costing Status not in ['pending', 'revision_in_progress', '']
    df['Costing Status Lower'] = df['Costing Status'].astype(str).str.lower().str.strip()
    df['is_costing_done'] = ~df['Costing Status Lower'].isin(['pending', 'revision_in_progress', ''])

    # CALCULATE HIGHEST NUMBER OF COSTING DONE BY COSTING PERSON
    costing_done_counts = df[df['is_costing_done']].groupby('Assigned To').size().sort_values(ascending=False)
    if not costing_done_counts.empty:
        max_costing_done = int(costing_done_counts.iloc[0])
        top_costing_persons = costing_done_counts[costing_done_counts == max_costing_done].index.tolist()
        top_costing_person_name = " & ".join(top_costing_persons)
        top_costing_person_val = max_costing_done
    else:
        top_costing_person_name = "-"
        top_costing_person_val = 0

    # CALCULATE COSTING PERSON BREAKDOWN
    grouped = df.groupby('Assigned To', dropna=False)
    summary_data = []
    highest_wins = {"name": "-", "val": 0}
    highest_value = {"name": "-", "val": 0}

    for name, group in grouped:
        display_name = str(name) if pd.notna(name) else '-'
        g_assigned = len(group)
        g_done = int(group['is_costing_done'].sum())
        g_pending = g_assigned - g_done
        g_done_pct = (g_done / g_assigned * 100) if g_assigned > 0 else 0
        
        g_won = (group['Current Status Lower'] == 'won').sum()
        g_pending_leads = (group['Current Status Lower'] == 'pending').sum()
        g_won_money = group[group['Current Status Lower'] == 'won']['Offer Price Num'].sum()
        g_total_money = group['Offer Price Num'].sum()
        
        if g_won > highest_wins['val']:
            highest_wins = {"name": display_name, "val": g_won}
        if g_won_money > highest_value['val']:
            highest_value = {"name": display_name, "val": g_won_money}
            
        summary_data.append({
            "name": display_name,
            "assigned": g_assigned,
            "done": g_done,
            "pending": g_pending,
            "done_pct": g_done_pct,
            "won": g_won,
            "pending_leads": g_pending_leads,
            "total_money": g_total_money,
            "won_money": g_won_money
        })

    # Sort summary data by Costings Done descending, then Assigned descending
    summary_data.sort(key=lambda x: (x['done'], x['assigned']), reverse=True)

    # Summary Table HTML
    summary_html = ''
    total_sum_assigned = sum(s['assigned'] for s in summary_data)
    total_sum_done = sum(s['done'] for s in summary_data)
    total_sum_pending = sum(s['pending'] for s in summary_data)
    total_sum_won = sum(s['won'] for s in summary_data)
    total_sum_pending_leads = sum(s['pending_leads'] for s in summary_data)
    total_sum_money = sum(s['total_money'] for s in summary_data)
    total_sum_won_money = sum(s['won_money'] for s in summary_data)

    for s in summary_data:
        summary_html += f'''
        <tr class="even-row">
            <td class="font-semibold" style="color: #0f172a;">{html.escape(str(s['name']))}</td>
            <td class="text-center font-bold">{s['assigned']}</td>
            <td class="text-center font-bold" style="color: #166534;"><span class="cost-badge cost-done">{s['done']}</span></td>
            <td class="text-center font-bold" style="color: #b45309;"><span class="cost-badge cost-pending">{s['pending']}</span></td>
            <td class="text-center font-bold"><span class="cost-badge cost-submitted">{s['done_pct']:.1f}%</span></td>
            <td class="text-center font-bold" style="color: #16a34a;">{s['won']}</td>
            <td class="text-center font-bold" style="color: #b45309;"><span class="badge badge-pending">{s['pending_leads']}</span></td>
            <td class="text-right font-mono price-cell">{format_inr(s['total_money'])}</td>
            <td class="text-right font-mono" style="color: #166534; font-weight: 700;">{format_inr(s['won_money'])}</td>
        </tr>
        '''

    # Add Total Row to Summary Table
    summary_html += f'''
    <tr style="background: #e2e8f0; font-weight: 800; border-top: 2px solid #64748b;">
        <td class="font-bold">TOTAL</td>
        <td class="text-center font-bold">{total_sum_assigned}</td>
        <td class="text-center font-bold" style="color: #166534;">{total_sum_done}</td>
        <td class="text-center font-bold" style="color: #b45309;">{total_sum_pending}</td>
        <td class="text-center font-bold">{(total_sum_done/total_sum_assigned*100):.1f}%</td>
        <td class="text-center font-bold" style="color: #16a34a;">{total_sum_won}</td>
        <td class="text-center font-bold" style="color: #b45309;">{total_sum_pending_leads}</td>
        <td class="text-right font-mono font-bold">{format_inr(total_sum_money)}</td>
        <td class="text-right font-mono font-bold" style="color: #166534;">{format_inr(total_sum_won_money)}</td>
    </tr>
    '''

    rows_html = ''
    for idx, r in df.iterrows():
        lead_id = str(r['ID'])
        customer = html.escape(str(r['Customer']) if pd.notna(r['Customer']) else '-')
        assigned = html.escape(str(r['Assigned To']) if pd.notna(r['Assigned To']) else '-')
        enq_date = html.escape(str(r['Enquiry Date']) if pd.notna(r['Enquiry Date']) else '-')
        curr_status = format_status(r['Current Status'])
        price = format_inr(r['Offer Price'])
        cost_status = format_costing_status(r['Costing Status'])
        result = format_costing_status(r['costing accepted or rejected'])
        completion = html.escape(str(r['Costing completion date']) if pd.notna(r['Costing completion date']) else '-')
        
        row_class = 'even-row' if idx % 2 == 0 else 'odd-row'
        rows_html += f'<tr class="{row_class}"><td class="text-center font-bold">{lead_id}</td><td class="customer-name font-semibold">{customer}</td><td>{assigned}</td><td class="text-center nowrap">{enq_date}</td><td class="text-center">{curr_status}</td><td class="text-right nowrap font-mono font-semibold price-cell">{price}</td><td class="text-center">{cost_status}</td><td class="text-center">{result}</td><td class="text-center nowrap">{completion}</td></tr>\n'

    min_date = df['Enquiry Date dt'].min().strftime('%d-%b-%Y')
    max_date = df['Enquiry Date dt'].max().strftime('%d-%b-%Y')

    html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Costing Team Report</title>
<style>
    @page {{ size: A4 landscape; margin: 10mm 8mm 12mm 8mm; }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }}
    body {{ background-color: #ffffff; color: #1e293b; font-size: 8pt; line-height: 1.3; }}
    .header-container {{ display: flex; justify-content: space-between; align-items: center; border-bottom: 2.5px solid #1e3a8a; padding-bottom: 6px; margin-bottom: 8px; }}
    .company-title {{ font-size: 15pt; font-weight: 800; color: #1e3a8a; letter-spacing: -0.5px; }}
    .report-subtitle {{ font-size: 9.5pt; color: #475569; font-weight: 500; margin-top: 1px; }}
    .header-meta {{ text-align: right; font-size: 7.5pt; color: #64748b; }}
    .header-meta strong {{ color: #0f172a; }}
    
    .kpi-grid {{ display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 8px; }}
    .kpi-card {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 6px; text-align: center; }}
    .kpi-card.highlight {{ background: #eff6ff; border-color: #bfdbfe; }}
    .kpi-card.won-card {{ background: #f0fdf4; border-color: #bbf7d0; }}
    .kpi-title {{ font-size: 6pt; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.5px; }}
    .kpi-value {{ font-size: 10.5pt; font-weight: 800; color: #0f172a; margin-top: 1px; }}
    .kpi-sub {{ font-size: 6pt; color: #475569; }}
    
    .kpi-grid-5 {{ display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 12px; }}
    .kpi-card-5 {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 6px; text-align: center; border-top: 3px solid #3b82f6; }}
    .kpi-card-5.highlight-costing {{ background: #f0fdf4; border-color: #86efac; border-top-color: #16a34a; }}
    .kpi-card-5.highlight {{ background: #eff6ff; border-color: #bfdbfe; border-top-color: #2563eb; }}
    .kpi-card-5.won-card {{ background: #f0fdf4; border-color: #bbf7d0; border-top-color: #10b981; }}
    
    .section-title {{ font-size: 10pt; font-weight: 700; color: #1e3a8a; margin-bottom: 4px; padding-left: 2px; line-height: 1; }}

    table {{ width: 100%; border-collapse: collapse; margin-bottom: 12px; }}
    thead {{ display: table-header-group; }}
    tr {{ page-break-inside: avoid; }}
    th {{ background-color: #1e3a8a; color: #ffffff; font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; padding: 4.5px 5px; border: 1px solid #1e3a8a; text-align: left; }}
    th.text-center {{ text-align: center; }}
    th.text-right {{ text-align: right; }}
    td {{ padding: 3.5px 5px; font-size: 7pt; border: 1px solid #cbd5e1; vertical-align: middle; }}
    .even-row {{ background-color: #ffffff; }}
    .odd-row {{ background-color: #f8fafc; }}
    .customer-name {{ color: #0f172a; max-width: 170px; word-wrap: break-word; }}
    .price-cell {{ color: #0f172a; }}
    .font-bold {{ font-weight: 700; }}
    .font-semibold {{ font-weight: 600; }}
    .font-mono {{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }}
    .text-center {{ text-align: center; }}
    .text-right {{ text-align: right; }}
    .nowrap {{ white-space: nowrap; }}
    
    .badge {{ display: inline-block; padding: 1px 4px; border-radius: 3px; font-size: 6pt; font-weight: 700; text-transform: capitalize; white-space: nowrap; }}
    .badge-won {{ background-color: #dcfce7; color: #15803d; border: 1px solid #86efac; }}
    .badge-quoted {{ background-color: #dbeafe; color: #1d4ed8; border: 1px solid #93c5fd; }}
    .badge-negotiation {{ background-color: #f3e8ff; color: #7e22ce; border: 1px solid #d8b4fe; }}
    .badge-pending {{ background-color: #fef3c7; color: #b45309; border: 1px solid #fde68a; }}
    .badge-lost {{ background-color: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }}
    .badge-tech {{ background-color: #ccfbf1; color: #0f766e; border: 1px solid #5eead4; }}
    .badge-default {{ background-color: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }}
    
    .cost-badge {{ display: inline-block; padding: 1px 4px; border-radius: 3px; font-size: 6pt; font-weight: 600; white-space: nowrap; }}
    .cost-done {{ background-color: #dcfce7; color: #166534; }}
    .cost-submitted {{ background-color: #e0f2fe; color: #0369a1; }}
    .cost-pending {{ background-color: #fef3c7; color: #92400e; }}
    .cost-progress {{ background-color: #ffedd5; color: #9a3412; }}
    .cost-query {{ background-color: #ffe4e6; color: #9f1239; }}
    .cost-default {{ background-color: #f1f5f9; color: #475569; }}
</style>
</head>
<body>
<div class="header-container">
    <div>
        <div class="company-title">ENEEPL &bull; COSTING TEAM REPORT</div>
        <div class="report-subtitle">Comprehensive Costing Tracking & Status Report</div>
    </div>
    <div class="header-meta">
        <div><strong>Date Range:</strong> {min_date} to {max_date}</div>
        <div><strong>Total Enquiries:</strong> {total_leads} Records</div>
        <div><strong>Generated:</strong> 26-Aug-2026</div>
    </div>
</div>

<!-- ORIGINAL 6 KPI BOXES -->
<div class="kpi-grid">
    <div class="kpi-card highlight">
        <div class="kpi-title">Total Pipeline Value</div>
        <div class="kpi-value">₹ {total_pipeline/10000000:.2f} Cr</div>
        <div class="kpi-sub">{total_leads} Total Leads</div>
    </div>
    <div class="kpi-card won-card">
        <div class="kpi-title">Orders Won</div>
        <div class="kpi-value" style="color:#166534;">{won_count}</div>
        <div class="kpi-sub">₹ {won_value/10000000:.2f} Cr Won</div>
    </div>
    <div class="kpi-card">
        <div class="kpi-title">Quoted Offers</div>
        <div class="kpi-value" style="color:#1d4ed8;">{quoted_count}</div>
        <div class="kpi-sub">₹ {quoted_value/10000000:.2f} Cr Quoted</div>
    </div>
    <div class="kpi-card">
        <div class="kpi-title">Under Negotiation</div>
        <div class="kpi-value" style="color:#7e22ce;">{negotiation_count}</div>
        <div class="kpi-sub">Active Discussions</div>
    </div>
    <div class="kpi-card">
        <div class="kpi-title">Pending Enquiries</div>
        <div class="kpi-value" style="color:#b45309;">{pending_count}</div>
        <div class="kpi-sub">Awaiting Quote/Review</div>
    </div>
    <div class="kpi-card">
        <div class="kpi-title">Lost / Inactive</div>
        <div class="kpi-value" style="color:#b91c1c;">{lost_count}</div>
        <div class="kpi-sub">Closed Unsuccessful</div>
    </div>
</div>

<!-- 5 KPI DASHBOARD BOXES -->
<div class="kpi-grid-5">
    <div class="kpi-card-5 highlight-costing">
        <div class="kpi-title">HIGHEST COSTINGS COMPLETED</div>
        <div class="kpi-value" style="color: #166534;">{top_costing_person_name}</div>
        <div class="kpi-sub"><span class="cost-badge cost-done">{top_costing_person_val} Costings Done</span></div>
    </div>
    <div class="kpi-card-5 highlight">
        <div class="kpi-title">HIGHEST WINS (LEADS)</div>
        <div class="kpi-value">{highest_wins['name']}</div>
        <div class="kpi-sub"><span class="cost-badge cost-done">{highest_wins['val']} Won Leads</span></div>
    </div>
    <div class="kpi-card-5 won-card">
        <div class="kpi-title">HIGHEST ORDER VALUE WON</div>
        <div class="kpi-value">{highest_value['name']}</div>
        <div class="kpi-sub"><span class="cost-badge cost-done">{format_inr(highest_value['val'])}</span></div>
    </div>
    <div class="kpi-card-5">
        <div class="kpi-title">TOTAL ORDER VALUE QUOTED</div>
        <div class="kpi-value" style="color:#1d4ed8;">{format_inr(total_pipeline)}</div>
        <div class="kpi-sub">{quoted_count} Offers Quoted</div>
    </div>
    <div class="kpi-card-5">
        <div class="kpi-title">TOTAL ORDER VALUE WON</div>
        <div class="kpi-value" style="color:#166534;">{format_inr(won_value)}</div>
        <div class="kpi-sub">{won_count} Orders Won</div>
    </div>
</div>

<!-- DETAILED BREAKDOWN TABLE -->
<div class="section-title">Costing Person Workload & Performance Breakdown</div>
<table>
    <thead>
        <tr>
            <th>Costing Person</th>
            <th class="text-center">Total Assigned</th>
            <th class="text-center">Costings Done</th>
            <th class="text-center">Costings Pending</th>
            <th class="text-center">Completion %</th>
            <th class="text-center">Orders Won</th>
            <th class="text-center">Pending Leads</th>
            <th class="text-right">Total Value Quoted</th>
            <th class="text-right">Total Value Won</th>
        </tr>
    </thead>
    <tbody>
        {summary_html}
    </tbody>
</table>

<!-- ORIGINAL RAW DATA TABLE -->
<div style="page-break-before: always;"></div>
<div class="header-container">
    <div>
        <div class="company-title">ENEEPL &bull; COSTING TEAM REPORT</div>
        <div class="report-subtitle">Raw Data Ledger</div>
    </div>
    <div class="header-meta">
        <div><strong>Generated:</strong> 26-Aug-2026</div>
        <div><strong>Total Enquiries:</strong> {total_leads} Records</div>
    </div>
</div>

<table>
    <thead>
        <tr>
            <th class="text-center" style="width: 26px;">ID</th>
            <th style="width: 170px;">Customer</th>
            <th style="width: 105px;">Assigned To</th>
            <th class="text-center" style="width: 65px;">Enquiry Date</th>
            <th class="text-center" style="width: 85px;">Current Status</th>
            <th class="text-right" style="width: 95px;">Offer Price</th>
            <th class="text-center" style="width: 110px;">Costing Status</th>
            <th class="text-center" style="width: 85px;">Costing Result</th>
            <th class="text-center" style="width: 75px;">Completion Date</th>
        </tr>
    </thead>
    <tbody>
        {rows_html}
    </tbody>
</table>
</body>
</html>
'''
    html_path = 'costing_report.html'
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html_content)

    pdf_path = 'costing_report.pdf'
    public_pdf_path = os.path.join('public', 'costing_report.pdf')
    root_pdf_path = os.path.join('..', 'costing_report.pdf')

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto('file:///' + os.path.abspath(html_path).replace('\\', '/'))
        page.pdf(
            path=pdf_path,
            format='A4',
            landscape=True,
            print_background=True,
            margin={'top': '8mm', 'bottom': '10mm', 'left': '6mm', 'right': '6mm'},
            display_header_footer=True,
            header_template='<div></div>',
            footer_template='<div style="width: 100%; font-size: 6.5pt; color: #64748b; display: flex; justify-content: space-between; padding: 0 6mm; font-family: sans-serif;"><span>ENEEPL &bull; Costing Team Report</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>'
        )
        browser.close()

    # Also copy to public/ folder and root
    import shutil
    try:
        os.makedirs('public', exist_ok=True)
        shutil.copy2(pdf_path, public_pdf_path)
    except Exception as e:
        print(f"Notice: public copy: {e}")

    try:
        shutil.copy2(pdf_path, root_pdf_path)
    except Exception as e:
        pass

    print(f"Successfully generated clean report with {total_leads} leads!")
    print(f"Top Costing Performer: {top_costing_person_name} ({top_costing_person_val} costings done)")
    print(f"Saved PDF to {pdf_path} and {public_pdf_path}")

if __name__ == '__main__':
    generate_pdf()
