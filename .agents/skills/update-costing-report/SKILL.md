---
name: update-costing-report
description: >-
  Use this skill whenever the user provides, pastes, or asks to update the costing dashboard
  with a new costing report (CSV or Excel file, such as costing-report-YYYY-MM-DD-*.csv).
---

# Update Costing Report & Dashboard Workflow

This skill outlines the step-by-step procedure to ingest a newly updated costing report CSV/Excel file, sanitize the data, update the Next.js API route, regenerate all Playwright PDF reports, verify the build, and deploy the changes to GitHub.

---

## Workflow Steps

### 1. Identify the New Data File
- Run `git status` in `d:/source_code/costing_team_dashboard` to detect any deleted previous CSVs and untracked/newly added CSVs (e.g., `costing-report-YYYY-MM-DD-*.csv`).
- Note the exact filename of the newest report.

### 2. Inspect & Sanitize Trailing Metadata
- View the bottom 30 lines of the newly added CSV file.
- **Critical Sanitization**: If trailing summary rows exist (e.g., `"Total Rows"`, `"Total Leads"`, `"Total Users"`, `"Total Statuses"`, `"Total Offer Price"` or empty lines), remove them using `replace_file_content` so the file strictly ends on the last genuine lead data record.
- Verify the header columns: Check whether column names use `"Costing Person"` or `"Assigned To"`, and `"Sales Person"` or `"Lead Person"`.

### 3. Update Dashboard API Route
- In `d:/source_code/costing_team_dashboard/app/api/dashboard-data/route.js`:
  - Ensure `CANDIDATE_FILES` has the newly added CSV at the top of the array.
  - Verify that `assignedTo` fallback handles `row['Costing Person'] || row['Assigned To'] || row.engineer`.
  - Verify that `salesPerson` fallback handles `row['Sales Person'] || row['Lead Person'] || row.salesPerson`.

### 4. Regenerate All Playwright PDF Reports
- Run the PDF generator from `d:/source_code/costing_team_dashboard`:
  ```bash
  python generate_costing_pdf.py
  ```
- Verify that it completes with exit code 0 and renders:
  - `costing_report.pdf` & `public/costing_report.pdf` (Master report for all records)
  - `public/reports/costing_report_<month>_<year>.pdf` for all months in the dataset
  - `public/reports/costing_report_latest_week.pdf` (Weekly output + all cumulative pending costings till date with their respective pending duration)

### 5. Verify Next.js Production Build
- Run the production build to ensure TypeScript and Next.js bundle without errors:
  ```bash
  npm run build
  ```
- Ensure output displays `✓ Compiled successfully`.

### 6. Commit & Deploy to GitHub
- Check `git status` to ensure all generated PDFs, code changes, and new CSV are staged:
  ```bash
  git add .
  git commit -m "Update dashboard and PDF reports with latest costing report <DATE>"
  git push
  ```
- Always ensure git author/committer email is `shekhawat.ajaypal1997@gmail.com`.
