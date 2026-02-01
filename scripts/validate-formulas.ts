#!/usr/bin/env bun
/**
 * Validate spreadsheet formulas and data integrity for budget allocation.
 * Usage: bun scripts/validate-formulas.ts
 *
 * This script:
 * 1. Reads all raw data from sheets
 * 2. Manually calculates summary values
 * 3. Compares calculated values with spreadsheet values
 * 4. Reports any discrepancies
 */

import { SpreadsheetsClient } from '../src/modules/spreadsheet/index.ts';

interface ValidationResult {
  passed: boolean;
  message: string;
  expected?: string | number;
  actual?: string | number;
}

interface ValidationReport {
  passed: ValidationResult[];
  failed: ValidationResult[];
  warnings: ValidationResult[];
}

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: Environment variable ${name} is required but not set.`);
    process.exit(1);
  }
  return value;
}

function parseNumber(value: string | null | undefined): number {
  if (!value) return 0;
  // Handle European number format (comma as decimal separator)
  const normalized = value.toString().replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

async function main(): Promise<void> {
  const spreadsheetId = getRequiredEnvVar('SPREADSHEET_ID');
  const serviceAccountFile = getRequiredEnvVar('GOOGLE_SERVICE_ACCOUNT_FILE');

  const client = new SpreadsheetsClient({
    serviceAccountFile,
  });

  const report: ValidationReport = {
    passed: [],
    failed: [],
    warnings: [],
  };

  console.log('Starting validation...\n');

  // 1. Read all data
  console.log('Reading data from sheets...');

  const [accountsData, budgetsData, allocationsData, monthlyViewData, transactionsData] =
    await Promise.all([
      client.readAllRows(spreadsheetId, 'Рахунки'),
      client.readAllRows(spreadsheetId, 'Бюджети'),
      client.readAllRows(spreadsheetId, 'Виділені кошти'),
      client.readAllRows(spreadsheetId, 'Місячний огляд'),
      client.readAllRows(spreadsheetId, 'Транзакції'),
    ]);

  // 2. Validate sheet headers
  console.log('Validating sheet headers...\n');

  // Expected headers
  const expectedBudgetsHeaders = [
    'Назва',
    'Тип',
    'Сума',
    'Валюта',
    'Дата початку',
    'Дата закінчення',
    'Переносити залишок',
  ];
  const expectedAccountsHeaders = [
    'Назва',
    'Тип',
    'Валюта',
    'Залишок',
    'Роль',
    'ID (зовнішній)',
    'IBAN',
    'Назва (зовнішня)',
    'Кредитний ліміт',
    'Банк',
    'Остання синхронізація',
  ];
  const expectedAllocationsHeaders = ['ID', 'Бюджет', 'Сума', 'Період', 'Дата', 'Примітки'];

  // Validate Budgets headers
  const budgetsHeaders = budgetsData[0] || [];
  if (JSON.stringify(budgetsHeaders) === JSON.stringify(expectedBudgetsHeaders)) {
    report.passed.push({
      passed: true,
      message: 'Budgets sheet has correct headers',
    });
  } else {
    report.failed.push({
      passed: false,
      message: 'Budgets sheet has incorrect headers',
      expected: JSON.stringify(expectedBudgetsHeaders),
      actual: JSON.stringify(budgetsHeaders),
    });
  }

  // Validate Accounts headers
  const accountsHeaders = accountsData[0] || [];
  if (JSON.stringify(accountsHeaders) === JSON.stringify(expectedAccountsHeaders)) {
    report.passed.push({
      passed: true,
      message: 'Accounts sheet has correct headers',
    });
  } else {
    report.failed.push({
      passed: false,
      message: 'Accounts sheet has incorrect headers',
      expected: JSON.stringify(expectedAccountsHeaders),
      actual: JSON.stringify(accountsHeaders),
    });
  }

  // Validate Allocations headers
  const allocationsHeaders = allocationsData[0] || [];
  if (JSON.stringify(allocationsHeaders) === JSON.stringify(expectedAllocationsHeaders)) {
    report.passed.push({
      passed: true,
      message: 'Allocations sheet has correct headers',
    });
  } else {
    report.failed.push({
      passed: false,
      message: 'Allocations sheet has incorrect headers',
      expected: JSON.stringify(expectedAllocationsHeaders),
      actual: JSON.stringify(allocationsHeaders),
    });
  }

  // Validate Monthly View structure (row 11 = budget table headers)
  const expectedMonthlyViewTableHeaders = [
    'Бюджет',
    'Бюджет',
    'Ліміт',
    'Переносити',
    'Виділено',
    'Витрачено',
    'Доступно',
    'Прогрес',
    'Прогрес (візуал)',
  ];
  const monthlyViewTableHeaders = monthlyViewData[10] || []; // Row 11 (0-indexed: 10)
  if (JSON.stringify(monthlyViewTableHeaders) === JSON.stringify(expectedMonthlyViewTableHeaders)) {
    report.passed.push({
      passed: true,
      message: 'Monthly View budget table has correct headers',
    });
  } else {
    report.failed.push({
      passed: false,
      message: 'Monthly View budget table has incorrect headers',
      expected: JSON.stringify(expectedMonthlyViewTableHeaders),
      actual: JSON.stringify(monthlyViewTableHeaders),
    });
  }

  // 3. Validate data integrity
  console.log('Validating data integrity...\n');

  // All budgets should have names
  const budgetsWithoutName = budgetsData.slice(1).filter((row) => !row[0] || row[0] === '');
  if (budgetsWithoutName.length === 0) {
    report.passed.push({
      passed: true,
      message: 'All budgets have names',
    });
  } else {
    report.failed.push({
      passed: false,
      message: `${budgetsWithoutName.length} budgets are missing names`,
      expected: 'All budgets should have names',
      actual: `Found ${budgetsWithoutName.length} budgets without names`,
    });
  }

  // All budgets should have rollover setting
  const budgetsWithoutRollover = budgetsData.slice(1).filter((row) => {
    const rollover = row[6];
    return !rollover || (rollover !== 'Так' && rollover !== 'Ні');
  });
  if (budgetsWithoutRollover.length === 0) {
    report.passed.push({
      passed: true,
      message: 'All budgets have valid rollover setting (Так/Ні)',
    });
  } else {
    report.warnings.push({
      passed: false,
      message: `${budgetsWithoutRollover.length} budgets have missing or invalid rollover setting (expected Так/Ні, empty is allowed for one-time/ongoing budgets)`,
    });
  }

  // All accounts should have role
  const accountsWithoutRole = accountsData.slice(1).filter((row) => {
    const role = row[4];
    return !role || (role !== 'Операційний' && role !== 'Накопичувальний');
  });
  if (accountsWithoutRole.length === 0) {
    report.passed.push({
      passed: true,
      message: 'All accounts have valid role (Операційний/Накопичувальний)',
    });
  } else {
    report.failed.push({
      passed: false,
      message: `${accountsWithoutRole.length} accounts have missing or invalid role`,
      expected: 'Операційний or Накопичувальний',
      actual: `Found ${accountsWithoutRole.length} accounts with invalid role`,
    });
  }

  // 4. Validate formula calculations
  console.log('Validating formula calculations...\n');

  // Get selected month from Monthly View
  const selectedMonth = String(monthlyViewData[0]?.[1] || '');
  console.log(`Selected month in Monthly View: ${selectedMonth}`);

  // Calculate "Доступні кошти" (Available funds from operational accounts)
  const operationalAccounts = accountsData.slice(1).filter((row) => row[4] === 'Операційний');
  const calculatedAvailableFunds = operationalAccounts.reduce((sum, row) => {
    return sum + parseNumber(row[3] as string);
  }, 0);

  // Calculate "Капітал" (Capital from savings accounts)
  const savingsAccounts = accountsData.slice(1).filter((row) => row[4] === 'Накопичувальний');
  const calculatedCapital = savingsAccounts.reduce((sum, row) => {
    return sum + parseNumber(row[3] as string);
  }, 0);

  // Calculate "Всього виділено" by summing E column from the budget table in Monthly View
  // This matches the spreadsheet formula =SUM(E12:E100) which respects per-budget rollover logic
  let calculatedTotalAllocated = 0;
  for (let rowIndex = 11; rowIndex <= 49; rowIndex++) {
    const row = monthlyViewData[rowIndex];
    if (row && row[4]) {
      calculatedTotalAllocated += parseNumber(row[4] as string);
    }
  }

  // Get actual values from Monthly View
  // Row 3 (index 2) = Капітал (заощадження), Row 4 (index 3) = Доступні кошти
  // Row 5 (index 4) = Всього виділено, Row 6 (index 5) = Готівка для розподілу
  const actualCapital = parseNumber(monthlyViewData[2]?.[1] as string);
  const actualAvailableFunds = parseNumber(monthlyViewData[3]?.[1] as string);
  const actualTotalAllocated = parseNumber(monthlyViewData[4]?.[1] as string);
  const actualReadyToAssign = parseNumber(monthlyViewData[5]?.[1] as string);

  // Compare calculations
  const tolerance = 0.01; // Allow small rounding differences

  if (Math.abs(calculatedAvailableFunds - actualAvailableFunds) < tolerance) {
    report.passed.push({
      passed: true,
      message: `"Доступні кошти" calculation is correct: ${actualAvailableFunds}`,
    });
  } else {
    report.failed.push({
      passed: false,
      message: '"Доступні кошти" calculation mismatch',
      expected: calculatedAvailableFunds,
      actual: actualAvailableFunds,
    });
  }

  if (Math.abs(calculatedCapital - actualCapital) < tolerance) {
    report.passed.push({
      passed: true,
      message: `"Капітал (заощадження)" calculation is correct: ${actualCapital}`,
    });
  } else {
    report.failed.push({
      passed: false,
      message: '"Капітал (заощадження)" calculation mismatch',
      expected: calculatedCapital,
      actual: actualCapital,
    });
  }

  if (Math.abs(calculatedTotalAllocated - actualTotalAllocated) < tolerance) {
    report.passed.push({
      passed: true,
      message: `"Всього виділено" calculation is correct: ${actualTotalAllocated}`,
    });
  } else {
    report.failed.push({
      passed: false,
      message: '"Всього виділено" calculation mismatch',
      expected: calculatedTotalAllocated,
      actual: actualTotalAllocated,
    });
  }

  // Verify "Готівка до розподілу" = "Доступні кошти" - "Всього виділено"
  const calculatedReadyToAssign = actualAvailableFunds - actualTotalAllocated;
  if (Math.abs(calculatedReadyToAssign - actualReadyToAssign) < tolerance) {
    report.passed.push({
      passed: true,
      message: `"Готівка до розподілу" calculation is correct: ${actualReadyToAssign}`,
    });
  } else {
    report.failed.push({
      passed: false,
      message: '"Готівка до розподілу" calculation mismatch',
      expected: calculatedReadyToAssign,
      actual: actualReadyToAssign,
    });
  }

  // 5. Check for transactions using budget names
  console.log('Checking transaction budget references...\n');

  const budgetNames = new Set(budgetsData.slice(1).map((row) => row[0]));
  const transactionsWithBudget = transactionsData.slice(1).filter((row) => {
    const budget = row[4]; // Column E = Budget
    return budget && budget !== '';
  });

  const transactionsWithInvalidBudget = transactionsWithBudget.filter((row) => {
    const budget = row[4];
    return !budgetNames.has(budget);
  });

  if (transactionsWithInvalidBudget.length === 0) {
    report.passed.push({
      passed: true,
      message: `All ${transactionsWithBudget.length} transactions with budgets use valid budget names`,
    });
  } else {
    report.failed.push({
      passed: false,
      message: `${transactionsWithInvalidBudget.length} transactions have invalid budget references`,
      expected: 'Budget names from Бюджети sheet',
      actual: `Found: ${[...new Set(transactionsWithInvalidBudget.map((row) => row[4]))].slice(0, 5).join(', ')}`,
    });
  }

  // 6. Warnings
  console.log('Checking for warnings...\n');

  // Warning: Allocations sheet is empty
  if (allocationsData.length <= 1) {
    report.warnings.push({
      passed: false,
      message: 'Allocations sheet is empty - no funds have been allocated yet',
    });
  }

  // Warning: Negative "Готівка до розподілу"
  if (actualReadyToAssign < 0) {
    report.warnings.push({
      passed: false,
      message: `"Готівка до розподілу" is negative: ${actualReadyToAssign} (overspent)`,
    });
  }

  // Warning: Transactions without budget
  const transactionsWithoutBudget = transactionsData.slice(1).filter((row) => {
    const budget = row[4];
    const amount = parseNumber(row[1] as string);
    return (!budget || budget === '') && amount < 0; // Only expenses
  });
  if (transactionsWithoutBudget.length > 0) {
    report.warnings.push({
      passed: false,
      message: `${transactionsWithoutBudget.length} expense transactions have no budget assigned`,
    });
  }

  // Print report
  console.log('\n========================================');
  console.log('          VALIDATION REPORT');
  console.log('========================================\n');

  console.log(`PASSED: ${report.passed.length}`);
  report.passed.forEach((item) => {
    console.log(`  [OK] ${item.message}`);
  });

  console.log(`\nFAILED: ${report.failed.length}`);
  report.failed.forEach((item) => {
    console.log(`  [FAIL] ${item.message}`);
    if (item.expected !== undefined) {
      console.log(`         Expected: ${item.expected}`);
      console.log(`         Actual:   ${item.actual}`);
    }
  });

  console.log(`\nWARNINGS: ${report.warnings.length}`);
  report.warnings.forEach((item) => {
    console.log(`  [WARN] ${item.message}`);
  });

  console.log('\n========================================');
  const overallStatus = report.failed.length === 0 ? 'PASSED' : 'FAILED';
  console.log(`         Overall: ${overallStatus}`);
  console.log('========================================\n');

  if (report.failed.length > 0) {
    process.exit(1);
  }
}

main();
