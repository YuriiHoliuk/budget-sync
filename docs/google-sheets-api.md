# Google Sheets API Reference

A comprehensive guide for integrating with the Google Sheets API v4 using Node.js.

## Table of Contents

- [Authentication Methods](#authentication-methods)
- [Getting Credentials](#getting-credentials)
- [Available Scopes](#available-scopes)
- [API Endpoints and Methods](#api-endpoints-and-methods)
- [Request/Response Formats](#requestresponse-formats)
- [Rate Limits](#rate-limits)
- [Code Examples](#code-examples)

---

## Authentication Methods

Google Sheets API supports three authentication methods:

### 1. OAuth 2.0 (User Authentication)

Best for: Applications that need to access user data with their consent.

**How it works:**
1. User is redirected to Google's authorization server
2. User grants permission to your application
3. Your app receives an authorization code
4. Exchange code for access token and refresh token
5. Use access token to make API requests

**Token specifications:**
- Authorization codes: max 256 bytes
- Access tokens: max 2,048 bytes
- Refresh tokens: max 512 bytes (100 per account per client ID)

### 2. Service Account (Server-to-Server)

Best for: Server-side applications, automated scripts, background jobs without user interaction.

**How it works:**
1. Create a service account in Google Cloud Console
2. Generate a JSON key file
3. Share the target spreadsheet with the service account email
4. Authenticate using the JSON key file

**Key advantage:** No user interaction required; ideal for automated processes.

### 3. API Keys

Best for: Accessing publicly-available data only (read-only, public spreadsheets).

**Limitations:**
- Cannot access private data
- Limited functionality (no write operations)
- Should be restricted by HTTP referrers

---

## Getting Credentials

### Prerequisites

1. A Google Cloud project
2. Google Sheets API enabled
3. Node.js and npm installed

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

### Step 2: Enable the Google Sheets API

1. Navigate to **APIs & Services** > **Library**
2. Search for "Google Sheets API"
3. Click **Enable**

### Step 3: Create Credentials

#### Option A: OAuth 2.0 Client ID (for user-facing apps)

1. Go to **Menu** > **Google Auth platform** > **Clients**
2. Click **Create Client**
3. Select application type (Web application, Desktop app, etc.)
4. Enter a name for the credential
5. For web apps, add authorized redirect URIs
6. Click **Create**
7. Download the JSON file and save as `credentials.json`

**Configure OAuth Consent Screen (required for OAuth 2.0):**
1. Go to **APIs & Services** > **OAuth consent screen**
2. Select user type (Internal for testing, External for production)
3. Fill in app name, support email, and contact information
4. Add required scopes
5. Save

#### Option B: Service Account (for server-side apps)

1. Go to **Menu** > **IAM & Admin** > **Service Accounts**
2. Click **Create service account**
3. Enter service account name and description
4. Click **Create and Continue**
5. (Optional) Assign roles
6. Click **Done**
7. Click on the created service account
8. Go to **Keys** tab > **Add Key** > **Create new key**
9. Select **JSON** format
10. Download and save securely as `service-account.json`

**Important:** Share your spreadsheet with the service account email (found in the JSON file as `client_email`) with "Editor" permission.

#### Option C: API Key (for public data only)

1. Go to **APIs & Services** > **Credentials**
2. Click **Create credentials** > **API key**
3. Copy the API key
4. Restrict usage (recommended):
   - Add API restrictions (Google Sheets API only)
   - Add HTTP referrer restrictions

---

## Available Scopes

| Scope | Access Level | Sensitivity | Use Case |
|-------|--------------|-------------|----------|
| `https://www.googleapis.com/auth/spreadsheets` | Full read/write | Sensitive | Create, edit, delete spreadsheets |
| `https://www.googleapis.com/auth/spreadsheets.readonly` | Read-only | Sensitive | View spreadsheet data only |
| `https://www.googleapis.com/auth/drive.file` | Per-file access | Non-sensitive | Access only files opened/created by app |
| `https://www.googleapis.com/auth/drive` | Full Drive access | Restricted | Full access to all Drive files |
| `https://www.googleapis.com/auth/drive.readonly` | Read-only Drive | Restricted | View all Drive files |

**Recommendation:** Use `drive.file` when possible (non-sensitive, simpler verification). Use spreadsheet-specific scopes only when needed.

---

## API Endpoints and Methods

Base URL: `https://sheets.googleapis.com/v4`

### Reading Data

#### Get Single Range
```
GET /spreadsheets/{spreadsheetId}/values/{range}
```

**Parameters:**
- `spreadsheetId` (required): The ID of the spreadsheet
- `range` (required): A1 notation (e.g., `Sheet1!A1:D5`)
- `majorDimension`: `ROWS` (default) or `COLUMNS`
- `valueRenderOption`: `FORMATTED_VALUE` (default), `UNFORMATTED_VALUE`, or `FORMULA`
- `dateTimeRenderOption`: `SERIAL_NUMBER` (default) or `FORMATTED_STRING`

#### Get Multiple Ranges (Batch)
```
GET /spreadsheets/{spreadsheetId}/values:batchGet?ranges={range1}&ranges={range2}
```

### Writing Data

#### Update Single Range
```
PUT /spreadsheets/{spreadsheetId}/values/{range}?valueInputOption={option}
```

**Required parameter:**
- `valueInputOption`: `RAW` or `USER_ENTERED`

| Option | Behavior |
|--------|----------|
| `RAW` | Values inserted as literal strings; `=1+2` stays as text |
| `USER_ENTERED` | Parsed like user input; formulas execute, dates convert |

#### Update Multiple Ranges (Batch)
```
POST /spreadsheets/{spreadsheetId}/values:batchUpdate
```

#### Append Data
```
POST /spreadsheets/{spreadsheetId}/values/{range}:append?valueInputOption={option}
```

**Optional parameter:**
- `insertDataOption`: `OVERWRITE` (default) or `INSERT_ROWS`

#### Clear Data
```
POST /spreadsheets/{spreadsheetId}/values/{range}:clear
```

### Spreadsheet Operations

#### Get Spreadsheet Metadata
```
GET /spreadsheets/{spreadsheetId}
```

#### Batch Update (Formatting, Sheets Management)
```
POST /spreadsheets/{spreadsheetId}:batchUpdate
```

Used for: adding/deleting sheets, formatting cells, merging cells, creating charts, etc.

---

## Request/Response Formats

### ValueRange Object (Read/Write Operations)

```json
{
  "range": "Sheet1!A1:D5",
  "majorDimension": "ROWS",
  "values": [
    ["Name", "Age", "City"],
    ["Alice", 30, "New York"],
    ["Bob", 25, "Los Angeles"]
  ]
}
```

### BatchUpdateValuesRequest

```json
{
  "valueInputOption": "USER_ENTERED",
  "data": [
    {
      "range": "Sheet1!A1:C1",
      "values": [["Header1", "Header2", "Header3"]]
    },
    {
      "range": "Sheet1!A2:C2",
      "values": [["Value1", "Value2", "Value3"]]
    }
  ]
}
```

### UpdateValuesResponse

```json
{
  "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
  "updatedRange": "Sheet1!A1:C3",
  "updatedRows": 3,
  "updatedColumns": 3,
  "updatedCells": 9
}
```

---

## Rate Limits

### Quotas

| Request Type | Per Project | Per User |
|--------------|-------------|----------|
| Read requests | 300/min | 60/min |
| Write requests | 300/min | 60/min |

### Other Limits

- **Payload size:** 2 MB maximum recommended
- **Request timeout:** 180 seconds maximum
- **Daily limit:** None (if within per-minute quotas)
- **Cost:** Free (no charges for API usage)

### Error Handling

When quota is exceeded, API returns `429: Too many requests`.

**Exponential Backoff Strategy:**

```javascript
async function makeRequestWithBackoff(requestFn, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      if (error.code === 429 && attempt < maxRetries - 1) {
        const delay = Math.min(
          Math.pow(2, attempt) * 1000 + Math.random() * 1000,
          64000 // max 64 seconds
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}
```

---

## Code Examples

### Installation

```bash
npm install googleapis @google-cloud/local-auth
```

### Authentication with Service Account

```javascript
const { google } = require('googleapis');

async function authorize() {
  const auth = new google.auth.GoogleAuth({
    keyFile: 'service-account.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth.getClient();
}

async function main() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });
  // Use sheets client...
}
```

### Authentication with OAuth 2.0

```javascript
const { google } = require('googleapis');
const { authenticate } = require('@google-cloud/local-auth');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

async function authorize() {
  const auth = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  return auth;
}
```

### Reading Data

```javascript
async function readSpreadsheet(auth, spreadsheetId, range) {
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    console.log('No data found.');
    return [];
  }

  return rows;
}

// Usage
const data = await readSpreadsheet(auth, 'SPREADSHEET_ID', 'Sheet1!A1:D10');
```

### Reading Multiple Ranges

```javascript
async function readMultipleRanges(auth, spreadsheetId, ranges) {
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
  });

  return response.data.valueRanges;
}

// Usage
const data = await readMultipleRanges(auth, 'SPREADSHEET_ID', [
  'Sheet1!A1:B10',
  'Sheet2!A1:C5'
]);
```

### Writing Data

```javascript
async function writeToSpreadsheet(auth, spreadsheetId, range, values) {
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values,
    },
  });

  console.log(`${response.data.updatedCells} cells updated.`);
  return response.data;
}

// Usage
await writeToSpreadsheet(auth, 'SPREADSHEET_ID', 'Sheet1!A1:C2', [
  ['Name', 'Age', 'City'],
  ['Alice', 30, 'New York']
]);
```

### Appending Data

```javascript
async function appendToSpreadsheet(auth, spreadsheetId, range, values) {
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values,
    },
  });

  console.log(`${response.data.updates.updatedCells} cells appended.`);
  return response.data;
}

// Usage - appends after existing data in the range
await appendToSpreadsheet(auth, 'SPREADSHEET_ID', 'Sheet1!A:C', [
  ['Bob', 25, 'Los Angeles'],
  ['Charlie', 35, 'Chicago']
]);
```

### Batch Update (Multiple Ranges)

```javascript
async function batchUpdateSpreadsheet(auth, spreadsheetId, data) {
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });

  console.log(`${response.data.totalUpdatedCells} cells updated.`);
  return response.data;
}

// Usage
await batchUpdateSpreadsheet(auth, 'SPREADSHEET_ID', [
  {
    range: 'Sheet1!A1:B1',
    values: [['Header1', 'Header2']]
  },
  {
    range: 'Sheet1!A2:B3',
    values: [
      ['Value1', 'Value2'],
      ['Value3', 'Value4']
    ]
  }
]);
```

### Clearing Data

```javascript
async function clearRange(auth, spreadsheetId, range) {
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range,
  });

  return response.data;
}

// Usage
await clearRange(auth, 'SPREADSHEET_ID', 'Sheet1!A1:D10');
```

### Getting Spreadsheet Metadata

```javascript
async function getSpreadsheetInfo(auth, spreadsheetId) {
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
  });

  const { title, sheets: sheetList } = response.data;

  return {
    title,
    sheets: sheetList.map(s => ({
      id: s.properties.sheetId,
      title: s.properties.title,
      rowCount: s.properties.gridProperties.rowCount,
      columnCount: s.properties.gridProperties.columnCount,
    }))
  };
}
```

### Complete Working Example

```javascript
const { google } = require('googleapis');

// Configuration
const SPREADSHEET_ID = 'your-spreadsheet-id';
const SERVICE_ACCOUNT_FILE = 'service-account.json';

async function main() {
  // Authenticate
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // Read existing data
  const readResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!A:Z',
  });
  console.log('Current data:', readResponse.data.values);

  // Append new row
  const appendResponse = await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!A:Z',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[new Date().toISOString(), 'New Entry', 100]]
    },
  });
  console.log('Appended:', appendResponse.data.updates.updatedCells, 'cells');
}

main().catch(console.error);
```

---

## Finding the Spreadsheet ID

The spreadsheet ID is found in the URL:

```
https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
```

For example, in:
```
https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
```

The spreadsheet ID is: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`

---

## A1 Notation Reference

| Notation | Description |
|----------|-------------|
| `Sheet1!A1` | Single cell A1 on Sheet1 |
| `Sheet1!A1:B2` | Range from A1 to B2 |
| `Sheet1!A:A` | Entire column A |
| `Sheet1!1:1` | Entire row 1 |
| `Sheet1!A1:A` | Column A starting from row 1 |
| `A1:B2` | Uses first visible sheet |
| `'Sheet Name'!A1` | Sheet name with spaces (use quotes) |

---

## Additional Resources

- [Official Google Sheets API Documentation](https://developers.google.com/sheets/api)
- [Node.js Quickstart Guide](https://developers.google.com/workspace/sheets/api/quickstart/nodejs)
- [API Reference](https://developers.google.com/sheets/api/reference/rest)
- [google-spreadsheet npm package](https://www.npmjs.com/package/google-spreadsheet) - Higher-level wrapper
