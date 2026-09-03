export async function generateFilteredPdf(leads, filterInfo = {}) {
  const { jsPDF } = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  const autoTable = autoTableModule.default || autoTableModule;

  const doc = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

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
    return decPart === '00' ? 'Rs. ' + res : 'Rs. ' + res + '.' + decPart;
  }

  function formatCr(val) {
    if (!val || isNaN(val) || val === 0) return 'Rs. 0.00 Cr';
    return 'Rs. ' + (Number(val) / 10000000).toFixed(2) + ' Cr';
  }

  // Calculate Metrics
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

  // Single top performer with tiebreaker
  const topCostingPerson = engList.length > 0 ? engList[0] : { name: '-', done: 0 };
  const topWinsPerson = [...engList].sort((a, b) => b.won - a.won)[0] || { name: '-', won: 0 };
  const topValWonPerson = [...engList].sort((a, b) => b.wonVal - a.wonVal)[0] || { name: '-', wonVal: 0 };

  // Page 1: Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(30, 58, 138);
  doc.text('ENEEPL • COSTING TEAM REPORT', 10, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Comprehensive Costing Tracking & Status Report', 10, 15.5);

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Period: ' + (filterInfo.periodLabel || 'All Records'), pageWidth - 10, 10, { align: 'right' });
  doc.text('Total Enquiries: ' + totalLeads + ' Records', pageWidth - 10, 14, { align: 'right' });
  doc.text('Generated: ' + new Date().toLocaleDateString('en-GB'), pageWidth - 10, 18, { align: 'right' });

  // Top Line
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.5);
  doc.line(10, 20, pageWidth - 10, 20);

  // Draw 6 KPI Cards in Row 1
  const kpiRow1 = [
    { title: 'TOTAL PIPELINE VALUE', val: formatCr(totalPipeline), sub: totalLeads + ' Total Leads', bg: [239, 246, 255], border: [37, 99, 235], valColor: [15, 23, 42] },
    { title: 'ORDERS WON', val: String(wonCount), sub: formatCr(wonValue) + ' Won', bg: [240, 253, 244], border: [16, 185, 129], valColor: [22, 101, 52] },
    { title: 'QUOTED OFFERS', val: String(quotedCount), sub: formatCr(quotedValue) + ' Quoted', bg: [240, 249, 255], border: [2, 132, 199], valColor: [29, 78, 216] },
    { title: 'UNDER NEGOTIATION', val: String(negCount), sub: 'Active Discussions', bg: [250, 245, 255], border: [139, 92, 246], valColor: [126, 34, 206] },
    { title: 'PENDING ENQUIRIES', val: String(pendingCount), sub: 'Awaiting Quote/Review', bg: [255, 251, 235], border: [245, 158, 11], valColor: [180, 83, 9] },
    { title: 'LOST / INACTIVE', val: String(lostCount), sub: 'Closed Unsuccessful', bg: [254, 242, 242], border: [239, 68, 68], valColor: [185, 28, 28] }
  ];

  const cardW = (pageWidth - 20 - 5 * 3) / 6;
  let cardX = 10;
  const cardY1 = 22;
  const cardH = 14;

  kpiRow1.forEach(c => {
    doc.setFillColor(c.bg[0], c.bg[1], c.bg[2]);
    doc.roundedRect(cardX, cardY1, cardW, cardH, 1.5, 1.5, 'F');
    doc.setDrawColor(c.border[0], c.border[1], c.border[2]);
    doc.setLineWidth(0.7);
    doc.line(cardX, cardY1, cardX + cardW, cardY1);
    doc.setLineWidth(0.2);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cardX, cardY1, cardW, cardH, 1.5, 1.5, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text(c.title, cardX + cardW / 2, cardY1 + 3.5, { align: 'center' });

    doc.setFontSize(9);
    doc.setTextColor(c.valColor[0], c.valColor[1], c.valColor[2]);
    doc.text(c.val, cardX + cardW / 2, cardY1 + 8.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text(c.sub, cardX + cardW / 2, cardY1 + 12.2, { align: 'center' });

    cardX += cardW + 3;
  });

  // Draw 5 KPI Cards in Row 2
  const kpiRow2 = [
    { title: 'HIGHEST COSTINGS COMPLETED', val: topCostingPerson.name, sub: topCostingPerson.done + ' Costings Completed', bg: [240, 253, 244], border: [22, 163, 74], valColor: [22, 101, 52] },
    { title: 'HIGHEST WINS (LEADS)', val: topWinsPerson.name, sub: topWinsPerson.won + ' Won Leads', bg: [239, 246, 255], border: [37, 99, 235], valColor: [15, 23, 42] },
    { title: 'HIGHEST ORDER VALUE WON', val: topValWonPerson.name, sub: formatInr(topValWonPerson.wonVal), bg: [240, 253, 244], border: [16, 185, 129], valColor: [22, 101, 52] },
    { title: 'TOTAL ORDER VALUE QUOTED', val: formatInr(totalPipeline), sub: quotedCount + ' Offers Quoted', bg: [248, 250, 252], border: [2, 132, 199], valColor: [29, 78, 216] },
    { title: 'TOTAL ORDER VALUE WON', val: formatInr(wonValue), sub: wonCount + ' Orders Won', bg: [248, 250, 252], border: [16, 185, 129], valColor: [22, 101, 52] }
  ];

  const cardW2 = (pageWidth - 20 - 4 * 3) / 5;
  let cardX2 = 10;
  const cardY2 = 38;

  kpiRow2.forEach(c => {
    doc.setFillColor(c.bg[0], c.bg[1], c.bg[2]);
    doc.roundedRect(cardX2, cardY2, cardW2, cardH, 1.5, 1.5, 'F');
    doc.setDrawColor(c.border[0], c.border[1], c.border[2]);
    doc.setLineWidth(0.7);
    doc.line(cardX2, cardY2, cardX2 + cardW2, cardY2);
    doc.setLineWidth(0.2);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cardX2, cardY2, cardW2, cardH, 1.5, 1.5, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text(c.title, cardX2 + cardW2 / 2, cardY2 + 3.5, { align: 'center' });

    doc.setFontSize(8);
    doc.setTextColor(c.valColor[0], c.valColor[1], c.valColor[2]);
    doc.text(c.val, cardX2 + cardW2 / 2, cardY2 + 8.2, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text(c.sub, cardX2 + cardW2 / 2, cardY2 + 12.2, { align: 'center' });

    cardX2 += cardW2 + 3;
  });

  // Section Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 58, 138);
  doc.text('Costing Person Workload & Performance Breakdown', 10, 55);

  // Breakdown Table Data
  const breakdownRows = engList.map(e => [
    e.name,
    String(e.assigned),
    String(e.done),
    String(e.pending),
    (e.assigned > 0 ? (e.done / e.assigned * 100) : 0).toFixed(1) + '%',
    String(e.won),
    String(e.pendingLeads),
    formatInr(e.totalVal),
    formatInr(e.wonVal)
  ]);

  const totAssigned = engList.reduce((acc, e) => acc + e.assigned, 0);
  const totDone = engList.reduce((acc, e) => acc + e.done, 0);
  const totPending = engList.reduce((acc, e) => acc + e.pending, 0);
  const totWon = engList.reduce((acc, e) => acc + e.won, 0);
  const totPendingLeads = engList.reduce((acc, e) => acc + e.pendingLeads, 0);
  const totVal = engList.reduce((acc, e) => acc + e.totalVal, 0);
  const totWonVal = engList.reduce((acc, e) => acc + e.wonVal, 0);

  breakdownRows.push([
    'TOTAL',
    String(totAssigned),
    String(totDone),
    String(totPending),
    (totAssigned > 0 ? (totDone / totAssigned * 100) : 0).toFixed(1) + '%',
    String(totWon),
    String(totPendingLeads),
    formatInr(totVal),
    formatInr(totWonVal)
  ]);

  autoTable(doc, {
    startY: 57,
    margin: { left: 10, right: 10 },
    head: [['COSTING PERSON', 'TOTAL ASSIGNED', 'COSTINGS COMPLETED', 'COSTINGS PENDING', 'COMPLETION %', 'ORDERS WON', 'PENDING LEADS', 'TOTAL VALUE QUOTED', 'TOTAL VALUE WON']],
    body: breakdownRows,
    theme: 'grid',
    styles: { fontSize: 6.5, cellPadding: 1.2, textColor: [30, 41, 59] },
    headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'left', cellWidth: 42 },
      1: { halign: 'center', cellWidth: 24 },
      2: { halign: 'center', textColor: [22, 101, 52], fontStyle: 'bold', cellWidth: 28 },
      3: { halign: 'center', textColor: [180, 83, 9], fontStyle: 'bold', cellWidth: 26 },
      4: { halign: 'center', cellWidth: 24 },
      5: { halign: 'center', textColor: [22, 163, 74], fontStyle: 'bold', cellWidth: 22 },
      6: { halign: 'center', textColor: [180, 83, 9], cellWidth: 24 },
      7: { halign: 'right', font: 'courier', cellWidth: 42 },
      8: { halign: 'right', font: 'courier', textColor: [22, 101, 52], fontStyle: 'bold', cellWidth: 45 }
    },
    didParseCell: (data) => {
      if (data.row.index === breakdownRows.length - 1) {
        data.cell.styles.fillColor = [226, 232, 240];
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  // Page 2+: Raw Data Ledger
  doc.addPage('a4', 'landscape');

  // Ledger Table Data
  const sortedLeads = [...leads].sort((a, b) => new Date(b.enqDate || 0) - new Date(a.enqDate || 0));
  const ledgerRows = sortedLeads.map(l => {
    let cStatus = String(l.costingStatus || '-').replace(/_/g, ' ');
    if (cStatus.toLowerCase() === 'done') cStatus = 'First Offer Submitted';
    else if (cStatus !== '-') cStatus = cStatus.replace(/\b\w/g, c => c.toUpperCase());

    let currStatus = String(l.currentStatus || '-').replace(/_/g, ' ');
    if (currStatus !== '-') currStatus = currStatus.replace(/\b\w/g, c => c.toUpperCase());

    return [
      String(l.id),
      String(l.client || '-'),
      String(l.engineer || '-'),
      l.enqDateRaw || (l.enqDate ? String(l.enqDate).substring(0, 10) : '-'),
      currStatus,
      formatInr(l.offerPrice),
      cStatus,
      String(l.costingAccepted || 'Accepted'),
      String(l.completionDate || '-')
    ];
  });

  autoTable(doc, {
    startY: 18,
    margin: { left: 10, right: 10 },
    head: [['ID', 'CUSTOMER', 'ASSIGNED TO', 'ENQUIRY DATE', 'CURRENT STATUS', 'OFFER PRICE', 'COSTING STATUS', 'COSTING RESULT', 'COMPLETION DATE']],
    body: ledgerRows,
    theme: 'grid',
    styles: { fontSize: 6.5, cellPadding: 1.2, textColor: [30, 41, 59] },
    headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold', cellWidth: 12 },
      1: { halign: 'left', fontStyle: 'bold', cellWidth: 55 },
      2: { halign: 'left', cellWidth: 28 },
      3: { halign: 'center', cellWidth: 22 },
      4: { halign: 'center', cellWidth: 28 },
      5: { halign: 'right', font: 'courier', cellWidth: 32 },
      6: { halign: 'center', fontStyle: 'bold', cellWidth: 42 },
      7: { halign: 'center', cellWidth: 28 },
      8: { halign: 'center', cellWidth: 30 }
    },
    didDrawPage: (data) => {
      // Header on Page 2+
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 58, 138);
      doc.text('ENEEPL • COSTING TEAM REPORT', 10, 9);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Raw Data Ledger (' + (filterInfo.periodLabel || 'All Records') + ')', 10, 13.5);
      doc.text('Total Records: ' + leads.length, pageWidth - 10, 11, { align: 'right' });
    }
  });

  // Footers on all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('ENEEPL • Costing Team Report', 10, pageHeight - 5);
    doc.text('Page ' + i + ' of ' + totalPages, pageWidth - 10, pageHeight - 5, { align: 'right' });
  }

  // Determine dynamic filename
  let filename = 'Costing_Report';
  if (filterInfo.month && filterInfo.month !== 'All') {
    filename += '_' + filterInfo.month.replace(/\s+/g, '_');
  } else if (filterInfo.week && filterInfo.week !== 'All') {
    filename += '_' + (filterInfo.weekLabel ? filterInfo.weekLabel.replace(/[^a-zA-Z0-9]/g, '_') : 'Week');
  }
  if (filterInfo.engineer && filterInfo.engineer !== 'All') {
    filename += '_' + filterInfo.engineer.replace(/\s+/g, '_');
  }
  filename += '.pdf';

  doc.save(filename);
}
