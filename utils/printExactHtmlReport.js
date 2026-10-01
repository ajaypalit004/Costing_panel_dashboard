export function openExactHtmlPrintReport(leads, filterInfo = {}) {
  function formatInr(val) {
    if (!val || isNaN(val) || val === 0) return '-';
    const num = Number(val);
    const parts = num.toFixed(2).split('.');
    let intPart = parts[0];
    const decPart = parts[1];
    let res = '';
    if (intPart.length <= 3) {
      res = intPart;
    } else {
      const last3 = intPart.substring(intPart.length - 3);
      let rest = intPart.substring(0, intPart.length - 3);
      const groups = [];
      while (rest.length > 2) {
        groups.unshift(rest.substring(rest.length - 2));
        rest = rest.substring(0, rest.length - 2);
      }
      if (rest.length > 0) groups.unshift(rest);
      res = groups.join(',') + ',' + last3;
    }
    return decPart === '00' ? '₹ ' + res : '₹ ' + res + '.' + decPart;
  }

  function formatCr(val) {
    if (!val || isNaN(val) || val === 0) return '₹ 0.00 Cr';
    return '₹ ' + (Number(val) / 10000000).toFixed(2) + ' Cr';
  }

  function escapeHtml(str) {
    if (!str) return '-';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatStatus(val) {
    if (!val) return '-';
    const s = String(val).trim().toLowerCase();
    let badgeClass = 'badge-default';
    if (s === 'won') badgeClass = 'badge-won';
    else if (s === 'quoted') badgeClass = 'badge-quoted';
    else if (s.includes('negotiat')) badgeClass = 'badge-negotiation';
    else if (s === 'pending') badgeClass = 'badge-pending';
    else if (s === 'lost') badgeClass = 'badge-lost';
    else if (s.includes('tech')) badgeClass = 'badge-tech';
    const label = s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `<span class="badge ${badgeClass}">${escapeHtml(label)}</span>`;
  }

  function formatCostingStatus(val, enqDate = null) {
    if (!val) return '-';
    const s = String(val).trim().toLowerCase();
    let label = s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    let badgeClass = 'cost-default';
    if (s === 'done' || s === 'first_offer_submitted') {
      label = 'First Offer Submitted';
      badgeClass = 'cost-done';
    } else if (['revised_offer_submitted', 'submitted', 'accepted', 'technical_offer_submitted'].includes(s) || s.includes('submitted')) {
      badgeClass = 'cost-submitted';
    } else if (s === 'pending') {
      badgeClass = 'cost-pending';
      if (enqDate) {
        const d = new Date(enqDate);
        if (!isNaN(d.getTime())) {
          const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
          const weeks = Math.floor(days / 7);
          if (weeks >= 1) {
            label = `Pending (${weeks} wks)`;
          } else if (days > 0) {
            label = `Pending (${days}d)`;
          }
        }
      }
    } else if (s.includes('progress') || s.includes('negotiat')) {
      badgeClass = 'cost-progress';
    } else if (s.includes('query') || s.includes('rejected')) {
      badgeClass = 'cost-query';
    }
    return `<span class="cost-badge ${badgeClass}">${escapeHtml(label)}</span>`;
  }

  const totalLeads = leads.length;
  let totalPipeline = 0;
  let wonCount = 0;
  let wonValue = 0;
  let quotedCount = 0;
  let quotedValue = 0;
  let negCount = 0;
  let pendingCount = 0;
  let lostCount = 0;

  const engMap = {};
  leads.forEach(l => {
    const price = Number(l.offerPrice || 0);
    totalPipeline += price;
    const st = String(l.currentStatus || '').toLowerCase().trim();
    if (st === 'won') {
      wonCount++;
      wonValue += price;
    } else if (st === 'quoted') {
      quotedCount++;
      quotedValue += price;
    } else if (st.includes('negotiat')) {
      negCount++;
    } else if (st === 'pending' || st.includes('technical')) {
      pendingCount++;
    } else if (st === 'lost') {
      lostCount++;
    }

    const eng = l.engineer || 'Unassigned';
    if (!engMap[eng]) {
      engMap[eng] = { name: eng, assigned: 0, done: 0, pending: 0, won: 0, pendingLeads: 0, totalVal: 0, wonVal: 0 };
    }
    engMap[eng].assigned++;
    engMap[eng].totalVal += price;
    const cst = String(l.costingStatus || '').toLowerCase().trim();
    const isDone = cst !== 'pending' && cst !== 'revision_in_progress' && cst !== '';
    if (isDone) engMap[eng].done++;
    else engMap[eng].pending++;

    if (st === 'won') {
      engMap[eng].won++;
      engMap[eng].wonVal += price;
    }
    if (st === 'pending') {
      engMap[eng].pendingLeads++;
    }
  });

  const engList = Object.values(engMap).sort((a, b) => {
    if (b.done !== a.done) return b.done - a.done;
    return b.totalVal - a.totalVal;
  });

  const topCostingPerson = engList.length > 0 ? engList[0] : { name: '-', done: 0 };
  const topWinsPerson = [...engList].sort((a, b) => b.won - a.won)[0] || { name: '-', won: 0 };
  const topValWonPerson = [...engList].sort((a, b) => b.wonVal - a.wonVal)[0] || { name: '-', wonVal: 0 };

  let summaryHtml = '';
  let totAssigned = 0, totDone = 0, totPending = 0, totWon = 0, totPendingLeads = 0, totMoney = 0, totWonMoney = 0;
  engList.forEach(s => {
    totAssigned += s.assigned;
    totDone += s.done;
    totPending += s.pending;
    totWon += s.won;
    totPendingLeads += s.pendingLeads;
    totMoney += s.totalVal;
    totWonMoney += s.wonVal;

    const pct = s.assigned > 0 ? (s.done / s.assigned * 100) : 0;
    summaryHtml += `
    <tr class="even-row">
      <td class="font-semibold" style="color: #0f172a;">${escapeHtml(s.name)}</td>
      <td class="text-center font-bold">${s.assigned}</td>
      <td class="text-center font-bold" style="color: #166534;"><span class="cost-badge cost-done">${s.done}</span></td>
      <td class="text-center font-bold" style="color: #b45309;"><span class="cost-badge cost-pending">${s.pending}</span></td>
      <td class="text-center font-bold"><span class="cost-badge cost-submitted">${pct.toFixed(1)}%</span></td>
      <td class="text-center font-bold" style="color: #16a34a;">${s.won}</td>
      <td class="text-center font-bold" style="color: #b45309;"><span class="badge badge-pending">${s.pendingLeads}</span></td>
      <td class="text-right font-mono price-cell">${formatInr(s.totalVal)}</td>
      <td class="text-right font-mono" style="color: #166534; font-weight: 700;">${formatInr(s.wonVal)}</td>
    </tr>`;
  });

  const totPct = totAssigned > 0 ? (totDone / totAssigned * 100) : 0;
  summaryHtml += `
  <tr style="background: #e2e8f0; font-weight: 800; border-top: 2px solid #64748b;">
    <td class="font-bold">TOTAL</td>
    <td class="text-center font-bold">${totAssigned}</td>
    <td class="text-center font-bold" style="color: #166534;">${totDone}</td>
    <td class="text-center font-bold" style="color: #b45309;">${totPending}</td>
    <td class="text-center font-bold">${totPct.toFixed(1)}%</td>
    <td class="text-center font-bold" style="color: #16a34a;">${totWon}</td>
    <td class="text-center font-bold" style="color: #b45309;">${totPendingLeads}</td>
    <td class="text-right font-mono font-bold">${formatInr(totMoney)}</td>
    <td class="text-right font-mono font-bold" style="color: #166534;">${formatInr(totWonMoney)}</td>
  </tr>`;

  const sortedLeads = [...leads].sort((a, b) => new Date(b.enqDate || 0) - new Date(a.enqDate || 0));
  let rowsHtml = '';
  sortedLeads.forEach((r, idx) => {
    const rowClass = idx % 2 === 0 ? 'even-row' : 'odd-row';
    const dateStr = r.enqDateRaw || (r.enqDate ? String(r.enqDate).substring(0, 10) : '-');
    rowsHtml += `<tr class="${rowClass}">
      <td class="text-center font-bold">${escapeHtml(r.id)}</td>
      <td class="customer-name font-semibold">${escapeHtml(r.client)}</td>
      <td>${escapeHtml(r.engineer)}</td>
      <td class="text-center nowrap">${escapeHtml(dateStr)}</td>
      <td class="text-center">${formatStatus(r.currentStatus)}</td>
      <td class="text-center">${formatCostingStatus(r.costingStatus, r.enqDate || r.enqDateRaw)}</td>
      <td class="text-center">${formatCostingStatus(r.costingAccepted || 'Accepted')}</td>
      <td class="text-center nowrap">${escapeHtml(r.completionDate || '-')}</td>
    </tr>`;
  });

  const periodLabel = filterInfo.month && filterInfo.month !== 'All' 
    ? filterInfo.month 
    : filterInfo.weekLabel 
      ? filterInfo.weekLabel 
      : 'All Records';

  const monthNameToRange = {
    'march 2026': '01-Mar-2026 to 31-Mar-2026',
    'april 2026': '01-Apr-2026 to 30-Apr-2026',
    'may 2026': '01-May-2026 to 31-May-2026',
    'june 2026': '01-Jun-2026 to 30-Jun-2026',
    'july 2026': '01-Jul-2026 to 31-Jul-2026',
    'august 2026': '01-Aug-2026 to 31-Aug-2026',
    'september 2026': '01-Sep-2026 to 30-Sep-2026',
    'october 2026': '01-Oct-2026 to 31-Oct-2026',
  };
  const pLower = String(periodLabel).toLowerCase().trim();
  const dateRangeStr = monthNameToRange[pLower] || (filterInfo.weekLabel ? filterInfo.weekLabel : periodLabel);

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Costing Team Report - ${escapeHtml(periodLabel)}</title>
<style>
    @page { size: A4 landscape; margin: 8mm 6mm 10mm 6mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background-color: #ffffff; color: #1e293b; font-size: 8pt; line-height: 1.3; padding: 6mm; }
    .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 2.5px solid #1e3a8a; padding-bottom: 6px; margin-bottom: 8px; }
    .company-title { font-size: 15pt; font-weight: 800; color: #1e3a8a; letter-spacing: -0.5px; }
    .report-subtitle { font-size: 9.5pt; color: #475569; font-weight: 500; margin-top: 1px; }
    .header-meta { text-align: right; font-size: 7.5pt; color: #64748b; }
    .header-meta strong { color: #0f172a; }
    
    .kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 8px; }
    .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 6px; text-align: center; }
    .kpi-card.highlight { background: #eff6ff; border-color: #bfdbfe; }
    .kpi-card.won-card { background: #f0fdf4; border-color: #bbf7d0; }
    .kpi-title { font-size: 6pt; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.5px; }
    .kpi-value { font-size: 10.5pt; font-weight: 800; color: #0f172a; margin-top: 1px; }
    .kpi-sub { font-size: 6pt; color: #475569; }
    
    .kpi-grid-5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 12px; }
    .kpi-card-5 { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 6px; text-align: center; border-top: 3px solid #3b82f6; }
    .kpi-card-5.highlight-costing { background: #f0fdf4; border-color: #86efac; border-top-color: #16a34a; }
    .kpi-card-5.highlight { background: #eff6ff; border-color: #bfdbfe; border-top-color: #2563eb; }
    .kpi-card-5.won-card { background: #f0fdf4; border-color: #bbf7d0; border-top-color: #10b981; }
    
    .section-title { font-size: 10pt; font-weight: 700; color: #1e3a8a; margin-bottom: 4px; padding-left: 2px; line-height: 1; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th { background-color: #1e3a8a; color: #ffffff; font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; padding: 4.5px 5px; border: 1px solid #1e3a8a; text-align: left; }
    th.text-center { text-align: center; }
    th.text-right { text-align: right; }
    td { padding: 3.5px 5px; font-size: 7pt; border: 1px solid #cbd5e1; vertical-align: middle; }
    .even-row { background-color: #ffffff; }
    .odd-row { background-color: #f8fafc; }
    .customer-name { color: #0f172a; max-width: 170px; word-wrap: break-word; }
    .price-cell { color: #0f172a; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .nowrap { white-space: nowrap; }
    
    .badge { display: inline-block; padding: 1px 4px; border-radius: 3px; font-size: 6pt; font-weight: 700; text-transform: capitalize; white-space: nowrap; }
    .badge-won { background-color: #dcfce7; color: #15803d; border: 1px solid #86efac; }
    .badge-quoted { background-color: #dbeafe; color: #1d4ed8; border: 1px solid #93c5fd; }
    .badge-negotiation { background-color: #f3e8ff; color: #7e22ce; border: 1px solid #d8b4fe; }
    .badge-pending { background-color: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
    .badge-lost { background-color: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
    .badge-tech { background-color: #ccfbf1; color: #0f766e; border: 1px solid #5eead4; }
    .badge-default { background-color: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
    
    .cost-badge { display: inline-block; padding: 1px 4px; border-radius: 3px; font-size: 6pt; font-weight: 600; white-space: nowrap; }
    .cost-done { background-color: #dcfce7; color: #166534; }
    .cost-submitted { background-color: #e0f2fe; color: #0369a1; }
    .cost-pending { background-color: #fef3c7; color: #92400e; }
    .cost-progress { background-color: #ffedd5; color: #9a3412; }
    .cost-query { background-color: #ffe4e6; color: #9f1239; }
    .cost-default { background-color: #f1f5f9; color: #475569; }

    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
</style>
</head>
<body>
<div class="no-print" style="margin-bottom: 12px; background: #1e3a8a; color: white; padding: 8px 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
  <span style="font-weight: 600; font-size: 11px;">ENEEPL Costing Report (${escapeHtml(periodLabel)}) - Print / Save as PDF Preview</span>
  <div>
    <button onclick="window.print()" style="background: #16a34a; color: white; border: none; padding: 4px 12px; border-radius: 4px; font-weight: bold; cursor: pointer; margin-right: 8px; font-size: 11px;">Save as PDF / Print</button>
    <button onclick="window.close()" style="background: #475569; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;">Close</button>
  </div>
</div>

<div class="header-container">
    <div>
        <div class="company-title">ENEEPL &bull; COSTING TEAM REPORT</div>
        <div class="report-subtitle">Comprehensive Costing Tracking & Status Report</div>
    </div>
    <div class="header-meta">
        <div><strong>Period / Date Range:</strong> ${escapeHtml(dateRangeStr)}</div>
        <div><strong>Total Enquiries:</strong> ${totalLeads} Records</div>
        <div><strong>Generated:</strong> ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
    </div>
</div>

<div class="kpi-grid">
    <div class="kpi-card highlight">
        <div class="kpi-title">Total Pipeline Value</div>
        <div class="kpi-value">${formatCr(totalPipeline)}</div>
        <div class="kpi-sub">${totalLeads} Total Leads</div>
    </div>
    <div class="kpi-card won-card">
        <div class="kpi-title">Orders Won</div>
        <div class="kpi-value" style="color:#166534;">${wonCount}</div>
        <div class="kpi-sub">${formatCr(wonValue)} Won</div>
    </div>
    <div class="kpi-card">
        <div class="kpi-title">Quoted Offers</div>
        <div class="kpi-value" style="color:#1d4ed8;">${quotedCount}</div>
        <div class="kpi-sub">${formatCr(quotedValue)} Quoted</div>
    </div>
    <div class="kpi-card">
        <div class="kpi-title">Under Negotiation</div>
        <div class="kpi-value" style="color:#7e22ce;">${negCount}</div>
        <div class="kpi-sub">Active Discussions</div>
    </div>
    <div class="kpi-card">
        <div class="kpi-title">Pending Enquiries</div>
        <div class="kpi-value" style="color:#b45309;">${pendingCount}</div>
        <div class="kpi-sub">Awaiting Quote/Review</div>
    </div>
    <div class="kpi-card">
        <div class="kpi-title">Lost / Inactive</div>
        <div class="kpi-value" style="color:#b91c1c;">${lostCount}</div>
        <div class="kpi-sub">Closed Unsuccessful</div>
    </div>
</div>

<div class="kpi-grid-5">
    <div class="kpi-card-5 highlight-costing">
        <div class="kpi-title">HIGHEST COSTINGS COMPLETED</div>
        <div class="kpi-value" style="color: #166534;">${escapeHtml(topCostingPerson.name)}</div>
        <div class="kpi-sub"><span class="cost-badge cost-done">${topCostingPerson.done} Costings Completed</span></div>
    </div>
    <div class="kpi-card-5 highlight">
        <div class="kpi-title">HIGHEST WINS (LEADS)</div>
        <div class="kpi-value">${escapeHtml(topWinsPerson.name)}</div>
        <div class="kpi-sub"><span class="cost-badge cost-done">${topWinsPerson.won} Won Leads</span></div>
    </div>
    <div class="kpi-card-5 won-card">
        <div class="kpi-title">HIGHEST ORDER VALUE WON</div>
        <div class="kpi-value">${escapeHtml(topValWonPerson.name)}</div>
        <div class="kpi-sub"><span class="cost-badge cost-done">${formatInr(topValWonPerson.wonVal)}</span></div>
    </div>
    <div class="kpi-card-5">
        <div class="kpi-title">TOTAL ORDER VALUE QUOTED</div>
        <div class="kpi-value" style="color:#1d4ed8;">${formatInr(totalPipeline)}</div>
        <div class="kpi-sub">${quotedCount} Offers Quoted</div>
    </div>
    <div class="kpi-card-5">
        <div class="kpi-title">TOTAL ORDER VALUE WON</div>
        <div class="kpi-value" style="color:#166534;">${formatInr(wonValue)}</div>
        <div class="kpi-sub">${wonCount} Orders Won</div>
    </div>
</div>

<div class="section-title">Costing Person Workload & Performance Breakdown</div>
<table>
    <thead>
        <tr>
            <th>Costing Person</th>
            <th class="text-center">Total Assigned</th>
            <th class="text-center">Costings Completed</th>
            <th class="text-center">Costings Pending</th>
            <th class="text-center">Completion %</th>
            <th class="text-center">Orders Won</th>
            <th class="text-center">Pending Leads</th>
            <th class="text-right">Total Value Quoted</th>
            <th class="text-right">Total Value Won</th>
        </tr>
    </thead>
    <tbody>
        ${summaryHtml}
    </tbody>
</table>

<div style="page-break-before: always;"></div>
<div class="header-container">
    <div>
        <div class="company-title">ENEEPL &bull; COSTING TEAM REPORT</div>
        <div class="report-subtitle">Raw Data Ledger (${escapeHtml(periodLabel)})</div>
    </div>
    <div class="header-meta">
        <div><strong>Generated:</strong> ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        <div><strong>Total Enquiries:</strong> ${totalLeads} Records</div>
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
        ${rowsHtml}
    </tbody>
</table>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to preview and save the PDF report.');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 500);
}
