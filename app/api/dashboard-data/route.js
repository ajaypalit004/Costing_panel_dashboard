import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

function parseDate(val) {
  if (!val) return new Date();
  if (typeof val === 'number') {
    return new Date(Math.floor((val - 25569) * 86400 * 1000));
  }
  const num = parseFloat(val);
  if (!isNaN(num) && num > 30000 && !String(val).includes('-') && !String(val).includes('/')) {
    return new Date(Math.floor((num - 25569) * 86400 * 1000));
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
}

function getSundayWeek(dateObj) {
  const d = new Date(dateObj);
  const day = d.getDay(); // 0 is Sunday
  const sunStart = new Date(d);
  sunStart.setDate(d.getDate() - day);
  sunStart.setHours(0, 0, 0, 0);

  const sunEnd = new Date(sunStart);
  sunEnd.setDate(sunStart.getDate() + 7);
  sunEnd.setHours(23, 59, 59, 999);

  const startStr = sunStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const endStr = sunEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return {
    weekKey: sunStart.toISOString().split('T')[0],
    weekLabel: `${startStr} – ${endStr}`
  };
}

const CANDIDATE_FILES = [
  'costing-report-updated-latest.xlsx',
  'costing-report-2026-10-01-updated.xlsx',
  'costing-report-2026-10-01-updated.csv',
  'costing-report-2026-10-01-10-25-17.csv',
  'costing-report-2026-09-28-05-05-57.csv',
  'costing-report-2026-09-21-05-42-31.csv',
  'costing-report-2026-09-12-04-43-39.csv',
  'costing-report-2026-09-07-05-54-30.csv',
  'costing-report-2026-08-26-09-53-12.csv',
  'nn.xlsx',
  'leads-report-20260709-104204.xlsx'
];

function getLatestDataFile() {
  const dir = process.cwd();
  for (const filename of CANDIDATE_FILES) {
    const fullPath = path.join(dir, filename);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  try {
    const files = fs.readdirSync(dir);
    const costingFiles = files.filter(f => (f.startsWith('costing-report') && (f.endsWith('.csv') || f.endsWith('.xlsx')))).sort().reverse();
    if (costingFiles.length > 0) {
      return path.join(dir, costingFiles[0]);
    }
  } catch (e) {
    console.error('Error scanning directory for costing file:', e);
  }
  return path.join(dir, CANDIDATE_FILES[0]);
}

export async function GET() {
  try {
    const filePath = getLatestDataFile();
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });

    const leads = [];

    data.forEach(row => {
      const rawId = String(row.ID || row['\ufeffID'] || '').trim();
      const customer = String(row['Customer'] || row.client || '').trim();
      const assignedTo = String(row['Costing Person'] || row['Assigned To'] || row.engineer || '').trim();

      // Skip non-data or summary rows (e.g. Total Rows, Total Leads, etc.)
      if (!rawId || isNaN(Number(rawId))) return;
      if (!customer || customer.toLowerCase().startsWith('total')) return;
      if (!assignedTo || assignedTo.toLowerCase().includes('total')) return;

      const salesPerson = String(row['Sales Person'] || row['Lead Person'] || row.salesPerson || '').trim();
      const currentStatus = String(row['Current Status'] || '').trim().toLowerCase();
      const costingStatus = String(row['Costing Status'] || '').trim().toLowerCase();
      const offerPrice = parseFloat(String(row['Offer Price'] || 0).replace(/,/g, '')) || 0;

      const enqDate = parseDate(row['Enquiry Date']);
      const daysOpen = Math.floor((Date.now() - enqDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const offerSubDateRaw = row['Offer Submission Date'] || row['Costing completion date'];
      let offerSubDate = null;
      if (offerSubDateRaw) {
        const d = parseDate(offerSubDateRaw);
        if (!isNaN(d.getTime())) offerSubDate = d;
      }

      // Primary reporting date: use offer submission date if available, else enquiry date
      const primaryDate = offerSubDate || enqDate;
      const monthYear = primaryDate.toLocaleString('default', { month: 'long', year: 'numeric' });
      const weekInfo = getSundayWeek(primaryDate);

      // Collect all associated months and weeks for multi-period matching
      const allMonths = new Set();
      const allWeeks = new Set();
      
      if (!isNaN(enqDate.getTime())) {
        allMonths.add(enqDate.toLocaleString('default', { month: 'long', year: 'numeric' }));
        allWeeks.add(getSundayWeek(enqDate).weekKey);
      }
      if (offerSubDate) {
        allMonths.add(offerSubDate.toLocaleString('default', { month: 'long', year: 'numeric' }));
        allWeeks.add(getSundayWeek(offerSubDate).weekKey);
      }
      
      const isPending = costingStatus === 'pending' || costingStatus === 'revision_in_progress' || !costingStatus;
      if (isPending) {
        allMonths.add('September 2026');
        allMonths.add('October 2026');
      }

      const formatDateStr = (val) => {
        if (!val) return '-';
        const d = parseDate(val);
        if (isNaN(d.getTime())) return String(val);
        return d.toISOString().split('T')[0];
      };

      leads.push({
        id: rawId,
        client: customer || 'Unknown',
        engineer: assignedTo,
        salesPerson: salesPerson || 'Unassigned',
        currentStatus,
        costingStatus,
        costingAccepted: String(row['costing accepted or rejected'] || '').trim(),
        costingAcceptedDate: formatDateStr(row['Costing accepted date']),
        completionDate: formatDateStr(row['Costing completion date']),
        offerSubmissionDate: formatDateStr(offerSubDateRaw),
        offerPrice,
        enqDate: enqDate.toISOString(),
        enqDateRaw: formatDateStr(row['Enquiry Date']),
        monthYear,
        months: Array.from(allMonths),
        weekKey: weekInfo.weekKey,
        weekLabel: weekInfo.weekLabel,
        weeks: Array.from(allWeeks),
        daysOpen: daysOpen >= 0 ? daysOpen : 0
      });
    });

    return NextResponse.json({
      leads
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to process data file' }, { status: 500 });
  }
}
