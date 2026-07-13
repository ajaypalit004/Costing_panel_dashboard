const XLSX = require('xlsx');

const workbook = XLSX.readFile('nn.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

console.log(data.slice(0, 3));
