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

### Insert Column

Insert a column at a specific position in a sheet. Existing columns are shifted to the right.

```bash
bun scripts/insert-spreadsheet-column.ts <sheetName> <columnName> <position>
```

**Example:**
```bash
bun scripts/insert-spreadsheet-column.ts "Транзакції" "Category" 3
```

Position is 1-based (1 = first column).

**Output:** Confirmation of inserted column and its position.

### Read Data

Read all data from a sheet (headers + rows).

```bash
bun scripts/read-spreadsheet-data.ts <sheetName> [--formulas]
```

**Examples:**
```bash
# Read formatted values (default)
bun scripts/read-spreadsheet-data.ts "Бюджети"

# Read formulas instead of values
bun scripts/read-spreadsheet-data.ts "Бюджети" --formulas
```

**Output:** JSON object with `headers`, `rows`, `totalRows`, and `mode`.

### Write Cell

Write a value or formula to a specific cell.

```bash
bun scripts/write-spreadsheet-cell.ts <sheetName> <cell> <value>
```

**Examples:**
```bash
# Write a formula
bun scripts/write-spreadsheet-cell.ts "Бюджети" "A2" "=ROW()-1"

# Write a value
bun scripts/write-spreadsheet-cell.ts "Транзакції" "B5" "Hello World"
```

Cell reference uses A1 notation (e.g., A1, B2, AA10). Values starting with `=` are treated as formulas.

**Output:** Confirmation of written value and cell range.

### Create Sheet

Create a new sheet with optional headers.

```bash
bun scripts/create-spreadsheet-sheet.ts <sheetName> [header1] [header2] ...
```

**Examples:**
```bash
# Create empty sheet
bun scripts/create-spreadsheet-sheet.ts "NewSheet"

# Create sheet with headers
bun scripts/create-spreadsheet-sheet.ts "Transactions" "ID" "Date" "Amount" "Description"
```

**Output:** Confirmation of created sheet with its ID, and headers if provided.
