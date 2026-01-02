# Spreadsheet Scripts

Utility scripts for manually reading and editing the Google Spreadsheet.

## Prerequisites

Environment variables must be set (via `.env` file):
- `SPREADSHEET_ID` - Google Spreadsheet document ID
- `GOOGLE_SERVICE_ACCOUNT_FILE` - Path to Google service account JSON

## Available Scripts

### List Sheets

List all sheet names in the spreadsheet.

```bash
bun scripts/list-spreadsheet-sheets.ts
```

**Output:** JSON array of sheet names.

### Read Headers

Read column headers (first row) from a specific sheet.

```bash
bun scripts/read-spreadsheet-headers.ts <sheetName>
```

**Example:**
```bash
bun scripts/read-spreadsheet-headers.ts "Рахунки"
```

**Output:** JSON array of header names.

### Add Columns

Add new columns to a sheet (appends to end of existing headers). Skips columns that already exist.

```bash
bun scripts/add-spreadsheet-columns.ts <sheetName> <column1> [column2] ...
```

**Example:**
```bash
bun scripts/add-spreadsheet-columns.ts "Рахунки" "ID (зовнішній)" "IBAN"
```

**Output:** Confirmation of added columns and their range.
