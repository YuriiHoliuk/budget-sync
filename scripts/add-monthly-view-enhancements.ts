#!/usr/bin/env bun
/**
 * Adds SPARKLINE progress bars and helper data tables to the "Місячний огляд" sheet.
 *
 * Features added:
 * 1. Progress Bar Column (Column I) - SPARKLINE visual bars for budget progress
 * 2. Savings Rate in Header Section (D3:D4)
 * 3. Category Breakdown Table (Rows 55-75) - Spending by category
 * 4. Monthly Summary Table (Rows 80-92) - Last 6 months data for charts
 *
 * Usage: bun scripts/add-monthly-view-enhancements.ts
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

  try {
    // 1. Add Progress Bar Column (Column I)
    console.log('1. Adding Progress Bar column (Column I)...');
    await addProgressBarColumn(client, spreadsheetId, sheetName);

    // 2. Add Savings Rate to Header Section
    console.log('2. Adding Savings Rate to header section...');
    await addSavingsRate(client, spreadsheetId, sheetName);

    // 3. Add Category Breakdown Table
    console.log('3. Adding Category Breakdown table (rows 55-75)...');
    await addCategoryBreakdownTable(client, spreadsheetId, sheetName);

    // 4. Add Monthly Summary Table
    console.log('4. Adding Monthly Summary table (rows 80-92)...');
    await addMonthlySummaryTable(client, spreadsheetId, sheetName);

    console.log('\nAll enhancements added successfully!');

    // Verify changes
    console.log('\nVerifying changes...');
    await verifyChanges(client, spreadsheetId, sheetName);

  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('Error: Unknown error');
    }
    process.exit(1);
  }
}

async function addProgressBarColumn(
  client: SpreadsheetsClient,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  // Add header in row 11
  await client.writeRange(spreadsheetId, `'${sheetName}'!I11`, [['Прогрес (візуал)']]);
  console.log('  Added header "Прогрес (візуал)" in I11');

  // Add text-based progress bar formulas for rows 12-50
  // Using REPT function to create visual progress bars with Unicode block characters
  // H column contains progress percentage (0-100% or more if over budget)
  // Shows filled blocks for progress and empty blocks for remaining
  // Formula uses 10-character bar width
  const startRow = 12;
  const endRow = 50;
  const progressBarFormulas: string[][] = [];

  for (let row = startRow; row <= endRow; row++) {
    // Text-based progress bar:
    // - Uses H column (Progress %) which is F/C (Spent/Limit)
    // - 10 character bar width
    // - Shows filled blocks (█) and empty blocks (░)
    // - Caps at 10 filled blocks even if over 100%
    const formula =
      `=IF(OR(A${row}="";H${row}="");"";` +
      `REPT("█";MIN(10;ROUND(H${row}*10;0)))&` +
      `REPT("░";MAX(0;10-ROUND(H${row}*10;0))))`;
    progressBarFormulas.push([formula]);
  }

  await client.writeRange(spreadsheetId, `'${sheetName}'!I${startRow}:I${endRow}`, progressBarFormulas);
  console.log(`  Added text progress bar formulas for rows ${startRow}-${endRow}`);
}

async function addSavingsRate(
  client: SpreadsheetsClient,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  // Add label in D3 and formula in D4
  // Savings Rate = (Income - Expenses) / Income
  // Income = transactions with category "Дохід" or its subcategories (Зарплата, Відсотки від облігацій, etc.)
  // Expenses = all other transactions (positive amounts, excluding income categories)
  // Selected month is in B1

  // Income categories are identified by having "Дохід" in Категорії sheet hierarchy
  // For simplicity, we'll match categories that are "Дохід", "Зарплата", or "Відсотки від облігацій"
  // A more robust approach would use the Категорії sheet to find all subcategories

  const savingsRateData: Array<{ range: string; values: string[][] }> = [
    // Label
    { range: `'${sheetName}'!D3`, values: [['Рівень заощаджень']] },
    // Formula: (Income - Expenses) / Income
    // Income = SUM of amounts where category matches income categories for selected month
    // Expenses = SUM of positive amounts excluding income categories for selected month
    {
      range: `'${sheetName}'!D4`,
      values: [[
        `=IFERROR(LET(` +
        `income;SUMPRODUCT((LEFT(Транзакції!M2:M;7)=TEXT($B$1;"YYYY-MM"))*` +
        `((Транзакції!D2:D="Дохід")+(Транзакції!D2:D="Зарплата")+(Транзакції!D2:D="Відсотки від облігацій"))*` +
        `Транзакції!B2:B);` +
        `expenses;SUMPRODUCT((LEFT(Транзакції!M2:M;7)=TEXT($B$1;"YYYY-MM"))*` +
        `(Транзакції!D2:D<>"Дохід")*(Транзакції!D2:D<>"Зарплата")*(Транзакції!D2:D<>"Відсотки від облігацій")*` +
        `(Транзакції!B2:B>0)*Транзакції!B2:B);` +
        `IF(income=0;0;(income-expenses)/income));0)`
      ]],
    },
  ];

  for (const item of savingsRateData) {
    await client.writeRange(spreadsheetId, item.range, item.values);
  }
  console.log('  Added "Рівень заощаджень" label in D3');
  console.log('  Added savings rate formula in D4');
}

async function addCategoryBreakdownTable(
  client: SpreadsheetsClient,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  // Header row at 55
  const headerRow = 55;

  // Write table title and headers
  await client.writeRange(spreadsheetId, `'${sheetName}'!A${headerRow}:C${headerRow}`, [
    ['Витрати за категоріями', '', ''],
  ]);
  await client.writeRange(spreadsheetId, `'${sheetName}'!A${headerRow + 1}:C${headerRow + 1}`, [
    ['Категорія', 'Сума', 'Відсоток'],
  ]);
  console.log(`  Added header "Витрати за категоріями" at row ${headerRow}`);
  console.log(`  Added column headers at row ${headerRow + 1}`);

  // Add formulas for category breakdown
  // Use QUERY to aggregate spending by category from Транзакції for selected month
  // Categories are in column D, amounts in column B, timestamps in column M
  const queryStartRow = headerRow + 2; // Row 57

  // QUERY formula outputs results starting with a summary header row (empty category, "sum" label)
  // which we'll handle by placing our own header above and accepting the summary row
  // Note: Using direct range Транзакції!B2:M to skip source header
  // header=0 because we're starting from row 2 (data only)
  const queryFormula =
    `=IFERROR(QUERY(Транзакції!B2:M;` +
    `"SELECT D, SUM(B) ` +
    `WHERE D <> '' ` +
    `AND D <> 'Дохід' ` +
    `AND D <> 'Зарплата' ` +
    `AND D <> 'Відсотки від облігацій' ` +
    `AND M STARTS WITH '"&TEXT($B$1;"YYYY-MM")&"' ` +
    `GROUP BY D ` +
    `ORDER BY SUM(B) DESC ` +
    `LIMIT 18";0);"Немає даних")`;

  await client.writeRange(spreadsheetId, `'${sheetName}'!A${queryStartRow}`, [[queryFormula]]);
  console.log(`  Added QUERY formula for categories at row ${queryStartRow}`);

  // The QUERY outputs a summary row first (row 57), then data rows start at row 58
  // Clear C57 (the summary row percentage cell)
  await client.writeRange(spreadsheetId, `'${sheetName}'!C${queryStartRow}`, [['']]);

  // Percentage formulas start from row 58 (where actual data begins)
  // Need to calculate percentage based on total expenses for the month (excluding income)
  const dataStartRow = queryStartRow + 1; // Row 58
  const totalExpensesRef =
    `SUMPRODUCT((LEFT(Транзакції!M2:M;7)=TEXT($B$1;"YYYY-MM"))*` +
    `(Транзакції!D2:D<>"Дохід")*(Транзакції!D2:D<>"Зарплата")*(Транзакції!D2:D<>"Відсотки від облігацій")*` +
    `(Транзакції!B2:B>0)*Транзакції!B2:B)`;

  // Add percentage formulas for rows 58-75 (18 rows of actual data)
  const percentageFormulas: string[][] = [];
  for (let i = 0; i < 18; i++) {
    const row = dataStartRow + i;
    const formula = `=IF(B${row}="";"";B${row}/${totalExpensesRef})`;
    percentageFormulas.push([formula]);
  }
  await client.writeRange(
    spreadsheetId,
    `'${sheetName}'!C${dataStartRow}:C${dataStartRow + 17}`,
    percentageFormulas
  );
  console.log(`  Added percentage formulas for rows ${dataStartRow}-${dataStartRow + 17}`);
}

async function addMonthlySummaryTable(
  client: SpreadsheetsClient,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  // Header row at 80
  const headerRow = 80;

  // Write table title and headers
  await client.writeRange(spreadsheetId, `'${sheetName}'!A${headerRow}:D${headerRow}`, [
    ['Щомісячний підсумок (6 міс)', '', '', ''],
  ]);
  await client.writeRange(spreadsheetId, `'${sheetName}'!A${headerRow + 1}:D${headerRow + 1}`, [
    ['Місяць', 'Витрати', 'Доходи', 'Баланс'],
  ]);
  console.log(`  Added header "Щомісячний підсумок (6 міс)" at row ${headerRow}`);
  console.log(`  Added column headers at row ${headerRow + 1}`);

  // Add data for last 6 months (rows 82-87)
  // Month offset: 0 = current month, -1 = previous month, etc.
  const dataStartRow = headerRow + 2;
  const monthRows: string[][] = [];

  for (let monthOffset = 0; monthOffset >= -5; monthOffset--) {
    const rowIndex = Math.abs(monthOffset);

    // Month column - calculate month based on offset from B1
    const monthFormula = `=TEXT(EDATE(DATE(LEFT($B$1;4);RIGHT($B$1;2);1);${monthOffset});"YYYY-MM")`;

    // Expenses - sum of amounts for that month (excluding income categories)
    const expensesFormula =
      `=SUMPRODUCT((LEFT(Транзакції!M$2:M;7)=A${dataStartRow + rowIndex})*` +
      `(Транзакції!D$2:D<>"Дохід")*(Транзакції!D$2:D<>"Зарплата")*(Транзакції!D$2:D<>"Відсотки від облігацій")*` +
      `(Транзакції!B$2:B>0)*Транзакції!B$2:B)`;

    // Income - sum of amounts for income categories (Дохід, Зарплата, Відсотки від облігацій)
    const incomeFormula =
      `=SUMPRODUCT((LEFT(Транзакції!M$2:M;7)=A${dataStartRow + rowIndex})*` +
      `((Транзакції!D$2:D="Дохід")+(Транзакції!D$2:D="Зарплата")+(Транзакції!D$2:D="Відсотки від облігацій"))*` +
      `Транзакції!B$2:B)`;

    // Balance - Income - Expenses
    const balanceFormula = `=C${dataStartRow + rowIndex}-B${dataStartRow + rowIndex}`;

    monthRows.push([monthFormula, expensesFormula, incomeFormula, balanceFormula]);
  }

  await client.writeRange(
    spreadsheetId,
    `'${sheetName}'!A${dataStartRow}:D${dataStartRow + 5}`,
    monthRows
  );
  console.log(`  Added monthly data formulas for rows ${dataStartRow}-${dataStartRow + 5}`);
}

async function verifyChanges(
  client: SpreadsheetsClient,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  // Verify Progress Bar column
  const progressBarHeader = await client.readRange(spreadsheetId, `'${sheetName}'!I11`);
  console.log(`  Progress Bar header (I11): ${progressBarHeader[0]?.[0] ?? 'MISSING'}`);

  // Verify Savings Rate
  const savingsRateLabel = await client.readRange(spreadsheetId, `'${sheetName}'!D3`);
  const savingsRateValue = await client.readRange(spreadsheetId, `'${sheetName}'!D4`);
  console.log(`  Savings Rate label (D3): ${savingsRateLabel[0]?.[0] ?? 'MISSING'}`);
  console.log(`  Savings Rate value (D4): ${savingsRateValue[0]?.[0] ?? 'MISSING'}`);

  // Verify Category Breakdown
  const categoryHeader = await client.readRange(spreadsheetId, `'${sheetName}'!A55`);
  console.log(`  Category Breakdown header (A55): ${categoryHeader[0]?.[0] ?? 'MISSING'}`);

  // Verify Monthly Summary
  const monthlySummaryHeader = await client.readRange(spreadsheetId, `'${sheetName}'!A80`);
  console.log(`  Monthly Summary header (A80): ${monthlySummaryHeader[0]?.[0] ?? 'MISSING'}`);
}

main();
