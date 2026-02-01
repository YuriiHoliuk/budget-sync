#!/usr/bin/env bun
/**
 * Fixes the "Місячний огляд" sheet formulas.
 * This script writes formulas directly without shell escaping issues.
 */

import { SpreadsheetsClient } from '../src/modules/spreadsheet/index.ts';

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: Environment variable ${name} is required but not set.`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const spreadsheetId = getRequiredEnvVar('SPREADSHEET_ID');
  const serviceAccountFile = getRequiredEnvVar('GOOGLE_SERVICE_ACCOUNT_FILE');

  const client = new SpreadsheetsClient({
    serviceAccountFile,
  });

  const sheetName = 'Місячний огляд';

  // Header section formulas (using semicolons for European/Ukrainian locale)
  const headerFormulas: Array<{ range: string; values: string[][] }> = [
    // Row 1
    { range: `'${sheetName}'!A1:B1`, values: [['Обраний місяць', '2025-01']] },
    // Row 3 - Capital (savings accounts)
    { range: `'${sheetName}'!A3:B3`, values: [['Капітал (заощадження)', '=SUMIF(Рахунки!E:E;"Накопичувальний";Рахунки!D:D)']] },
    // Row 4 - Available funds (operational accounts)
    { range: `'${sheetName}'!A4:B4`, values: [['Доступні кошти', '=SUMIF(Рахунки!E:E;"Операційний";Рахунки!D:D)']] },
    // Row 5 - Total allocated
    { range: `'${sheetName}'!A5:B5`, values: [['Всього виділено', '=SUM(E12:E100)']] },
    // Row 6 - Ready to assign
    { range: `'${sheetName}'!A6:B6`, values: [['Готівка до розподілу', '=B3-B5']] },
  ];

  try {
    // Write header formulas
    console.log('Writing header section...');
    for (const item of headerFormulas) {
      await client.writeRange(spreadsheetId, item.range, item.values);
      console.log(`  Written: ${item.range}`);
    }

    // Clear test cells from debugging (rows 2-9 columns C-H)
    console.log('Clearing test cells...');
    await client.writeRange(spreadsheetId, `'${sheetName}'!C1:G9`, [
      ['', '', '', '', ''],
      ['', '', '', '', ''],
      ['', '', '', '', ''],
      ['', '', '', '', ''],
      ['', '', '', '', ''],
      ['', '', '', '', ''],
      ['', '', '', '', ''],
      ['', '', '', '', ''],
      ['', '', '', '', ''],
    ]);

    // Write budget table headers
    console.log('Writing budget table headers...');
    const tableHeaders = ['Бюджет', 'Бюджет', 'Ліміт', 'Переносити', 'Виділено', 'Витрачено', 'Доступно', 'Прогрес'];
    await client.writeRange(spreadsheetId, `'${sheetName}'!A11:H11`, [tableHeaders]);

    // Write budget table formulas (rows 9-30)
    // Using semicolons for European/Ukrainian locale
    console.log('Writing budget table formulas...');
    const startRow = 12;
    const endRow = 50;
    const rows: string[][] = [];

    for (let row = startRow; row <= endRow; row++) {
      const budgetRow = row - 10; // row 12 -> Бюджети row 2

      const colA = `=Бюджети!A${budgetRow}`;
      const colB = `=A${row}`;
      const colC = `=IFERROR(VLOOKUP(A${row};Бюджети!A:C;3;FALSE);"")`;
      const colD = `=IFERROR(VLOOKUP(A${row};Бюджети!A:G;7;FALSE);"")`;

      // Allocated with rollover logic
      const colE = `=IF(A${row}="";"";IF(D${row}="Так";SUMIFS('Виділені кошти'!C:C;'Виділені кошти'!B:B;A${row};'Виділені кошти'!D:D;"<="&$B$1);SUMIFS('Виділені кошти'!C:C;'Виділені кошти'!B:B;A${row};'Виділені кошти'!D:D;$B$1)))`;

      // Spent with rollover logic
      const colF = `=IF(A${row}="";"";IF(D${row}="Так";SUMIFS(Транзакції!B:B;Транзакції!E:E;A${row};Транзакції!B:B;"<0";Транзакції!M:M;"<="&EOMONTH($B$1&"-01";0))*-1;SUMIFS(Транзакції!B:B;Транзакції!E:E;A${row};Транзакції!B:B;"<0";Транзакції!M:M;">="&$B$1&"-01";Транзакції!M:M;"<="&EOMONTH($B$1&"-01";0))*-1))`;

      // Available
      const colG = `=IF(A${row}="";"";E${row}-F${row})`;

      // Progress
      const colH = `=IF(OR(A${row}="";C${row}=0;C${row}="");"";F${row}/C${row})`;

      rows.push([colA, colB, colC, colD, colE, colF, colG, colH]);
    }

    await client.writeRange(spreadsheetId, `'${sheetName}'!A${startRow}:H${endRow}`, rows);
    console.log(`  Written rows ${startRow}-${endRow}`);

    console.log('\nDone! Verifying...');

    // Verify by reading back
    const verifyData = await client.readRange(spreadsheetId, `'${sheetName}'!A1:B6`);
    console.log('\nHeader section values:');
    for (const row of verifyData) {
      console.log(`  ${row.join(' | ')}`);
    }

  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('Error: Unknown error');
    }
    process.exit(1);
  }
}

main();
