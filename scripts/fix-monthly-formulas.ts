/**
 * Fix formulas in the Monthly Overview dashboard
 *
 * Updates formulas in columns F (Доступно) and G (Витрачено) for all budget rows.
 */

import 'reflect-metadata';
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const spreadsheetId = process.env.SPREADSHEET_ID!;
const serviceAccountFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE!;

// Formula for "Витрачено" (Spent) - Column G
// Logic:
// - If carry-over = "Так": Sum all transactions with this budget up to end of selected month
// - If carry-over = "Ні": Sum only transactions within the selected month
function getSpentFormula(row: number): string {
  return `=IF(B${row}="";"";IF(D${row}="Так";SUMPRODUCT(('Транзакції'!$E$2:$E=$B${row})*(LEFT('Транзакції'!$M$2:$M;10)<=TEXT(EOMONTH($B$1;0);"YYYY-MM-DD"))*'Транзакції'!$B$2:$B);SUMPRODUCT(('Транзакції'!$E$2:$E=$B${row})*(LEFT('Транзакції'!$M$2:$M;10)>=TEXT($B$1;"YYYY-MM")&"-01")*(LEFT('Транзакції'!$M$2:$M;10)<=TEXT(EOMONTH($B$1;0);"YYYY-MM-DD"))*'Транзакції'!$B$2:$B)))`;
}

// Formula for "Доступно" (Available) - Column F
function getAvailableFormula(row: number): string {
  return `=IF(A${row}="";"";E${row}-G${row})`;
}

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: serviceAccountFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const dataStartRow = 12;
  const dataEndRow = 50;

  console.log('Preparing formula updates...');

  const updates: { range: string; values: string[][] }[] = [];

  for (let row = dataStartRow; row <= dataEndRow; row++) {
    updates.push({
      range: `Місячний огляд!F${row}`,
      values: [[getAvailableFormula(row)]],
    });

    updates.push({
      range: `Місячний огляд!G${row}`,
      values: [[getSpentFormula(row)]],
    });
  }

  console.log(`Updating ${updates.length} cells (rows ${dataStartRow}-${dataEndRow})...`);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: updates,
    },
  });

  console.log('Done!');
}

main().catch(console.error);
