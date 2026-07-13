import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

function excelDateToJSDate(serial) {
  if (!serial) return new Date();
  const utc_days  = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;                                        
  const date_info = new Date(utc_value * 1000);
  return date_info;
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'nn.xlsx');
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });

    const leads = [];

    data.forEach(row => {
      const assignedTo = String(row['Assigned To'] || '').trim();
      const salesPerson = String(row['Sales Person'] || '').trim();
      const currentStatus = String(row['Current Status'] || '').trim().toLowerCase();
      const costingStatus = String(row['Costing Status'] || '').trim().toLowerCase();
      const offerPrice = parseFloat(row['Offer Price']) || 0;
      const customer = String(row['Customer'] || '').trim();
      
      if (!assignedTo) return;

      const enqDate = excelDateToJSDate(row['Enquiry Date']);
      const daysOpen = Math.floor((Date.now() - enqDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Formatting Month Name (e.g., "May 2026")
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
    return NextResponse.json({ error: 'Failed to process Excel' }, { status: 500 });
  }
}
