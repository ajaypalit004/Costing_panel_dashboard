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

const CANDIDATE_FILES = [
  'costing-report-2026-08-26-09-53-12.csv',
  'nn.xlsx',
  'leads-report-20260709-104204.xlsx'
];

function getLatestDataFile() {
  for (const filename of CANDIDATE_FILES) {
    const fullPath = path.join(process.cwd(), filename);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return path.join(process.cwd(), CANDIDATE_FILES[0]);
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
      const assignedTo = String(row['Assigned To'] || row.engineer || '').trim();
      const salesPerson = String(row['Sales Person'] || row['Lead Person'] || row.salesPerson || '').trim();
      const currentStatus = String(row['Current Status'] || '').trim().toLowerCase();
      const costingStatus = String(row['Costing Status'] || '').trim().toLowerCase();
      const offerPrice = parseFloat(String(row['Offer Price'] || 0).replace(/,/g, '')) || 0;
      const customer = String(row['Customer'] || row.client || '').trim();
      
      if (!assignedTo || assignedTo.toLowerCase().includes('total')) return;

      const enqDate = parseDate(row['Enquiry Date']);
      const daysOpen = Math.floor((Date.now() - enqDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Formatting Month Name (e.g., "April 2026")
      const monthYear = enqDate.toLocaleString('default', { month: 'long', year: 'numeric' });

      leads.push({
        id: row.ID || Math.random(),
        client: customer || 'Unknown',
        engineer: assignedTo,
        salesPerson: salesPerson || 'Unassigned',
        currentStatus,
        costingStatus,
        offerPrice,
        enqDate: enqDate.toISOString(),
        monthYear,
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
