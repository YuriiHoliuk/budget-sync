#!/usr/bin/env bun
/**
 * Creates the "Дашборд" (Dashboard) sheet with embedded charts.
 *
 * This script:
 * 1. Creates (or recreates) the "Дашборд" sheet
 * 2. Sets up helper data tables with formulas for chart data sources
 * 3. Creates embedded charts (pie, line, bar charts)
 *
 * Data sources:
 * - "Місячний огляд" for budget data and selected month
 * - "Транзакції" for transaction aggregation
 * - "Категорії" for category names
 *
 * Usage: bun scripts/setup-dashboard.ts
 */

import { google, type sheets_v4 } from 'googleapis';

// Configuration
const DASHBOARD_SHEET_NAME = 'Дашборд';
const MONTHLY_OVERVIEW_SHEET_NAME = 'Місячний огляд';

interface SheetInfo {
  id: number;
  title: string;
}

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Error: Environment variable ${name} is required but not set.`,
    );
    process.exit(1);
  }
  return value;
}

async function getSheets(): Promise<sheets_v4.Sheets> {
  const serviceAccountFile = getRequiredEnvVar('GOOGLE_SERVICE_ACCOUNT_FILE');
  const auth = new google.auth.GoogleAuth({
    keyFile: serviceAccountFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function getSpreadsheetSheets(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
): Promise<SheetInfo[]> {
  const response = await sheets.spreadsheets.get({ spreadsheetId });
  return (response.data.sheets ?? []).map((sheet) => ({
    id: sheet.properties?.sheetId ?? 0,
    title: sheet.properties?.title ?? '',
  }));
}

async function deleteSheetIfExists(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
): Promise<void> {
  const sheetList = await getSpreadsheetSheets(sheets, spreadsheetId);
  const existingSheet = sheetList.find((sheet) => sheet.title === sheetName);

  if (existingSheet) {
    console.log(`Deleting existing sheet "${sheetName}"...`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ deleteSheet: { sheetId: existingSheet.id } }],
      },
    });
  }
}

async function createDashboardSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
): Promise<number> {
  console.log(`Creating sheet "${DASHBOARD_SHEET_NAME}"...`);

  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: DASHBOARD_SHEET_NAME,
              gridProperties: {
                rowCount: 100,
                columnCount: 20,
              },
            },
          },
        },
      ],
    },
  });

  const sheetId =
    response.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
  console.log(`Created sheet with ID: ${sheetId}`);
  return sheetId;
}

async function writeHelperTables(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
): Promise<void> {
  console.log('Writing helper data tables and formulas...');

  // Using semicolons for European/Ukrainian locale
  const data = [
    // Title row
    {
      range: `'${DASHBOARD_SHEET_NAME}'!A1:F1`,
      values: [
        [
          'Фінансовий дашборд',
          '',
          '',
          '',
          'Обраний місяць:',
          `='${MONTHLY_OVERVIEW_SHEET_NAME}'!B1`,
        ],
      ],
    },

    // Section 1: Category Spending Data (for Donut Chart) - rows 4-20
    // Use QUERY with STARTS WITH for month filtering
    // This gets expense categories (B > 0) for the selected month
    {
      range: `'${DASHBOARD_SHEET_NAME}'!A3:B3`,
      values: [['Витрати по категоріях', '']],
    },
    {
      range: `'${DASHBOARD_SHEET_NAME}'!A4:B4`,
      values: [['Категорія', 'Сума']],
    },
    // Use QUERY with STARTS WITH operator for timestamp matching
    // Filter: B > 0 (expenses), D <> '' (has category), M starts with selected month
    // Use TEXT() to ensure month value is treated as text string "YYYY-MM"
    {
      range: `'${DASHBOARD_SHEET_NAME}'!A5`,
      values: [
        [
          `=IFERROR(QUERY(Транзакції!A:M;"SELECT D, SUM(B) WHERE B > 0 AND D <> '' AND M STARTS WITH '"&TEXT('${MONTHLY_OVERVIEW_SHEET_NAME}'!$B$1;"YYYY-MM")&"' GROUP BY D ORDER BY SUM(B) DESC LIMIT 10 LABEL D '', SUM(B) ''");"Немає даних")`,
        ],
      ],
    },

    // Section 2: Monthly Trend Data (for Line Chart) - rows 18-30
    // Reference the existing helper table in Місячний огляд (rows 78-84)
    {
      range: `'${DASHBOARD_SHEET_NAME}'!A17:D17`,
      values: [['Місячні тренди (6 місяців)', '', '', '']],
    },
    {
      range: `'${DASHBOARD_SHEET_NAME}'!A18:D18`,
      values: [['Місяць', 'Витрати', 'Доходи', 'Баланс']],
    },
    // Reference monthly summary from Місячний огляд (rows 82-87 contain the data)
    {
      range: `'${DASHBOARD_SHEET_NAME}'!A19:D24`,
      values: Array.from({ length: 6 }, (_, rowIndex) => {
        const sourceRow = 82 + rowIndex; // Monthly overview has data starting at row 82
        return [
          `='${MONTHLY_OVERVIEW_SHEET_NAME}'!A${sourceRow}`, // Month
          `='${MONTHLY_OVERVIEW_SHEET_NAME}'!B${sourceRow}`, // Expenses
          `='${MONTHLY_OVERVIEW_SHEET_NAME}'!C${sourceRow}`, // Income
          `='${MONTHLY_OVERVIEW_SHEET_NAME}'!D${sourceRow}`, // Balance
        ];
      }),
    },

    // Section 3: Top 5 Budget Spending (for Horizontal Bar Chart) - rows 27-35
    // Direct reference to budget table in Місячний огляд (starts at row 11 with data at row 12+)
    // Using LARGE/INDEX/MATCH to find top 5 by spending
    {
      range: `'${DASHBOARD_SHEET_NAME}'!A27:B27`,
      values: [['Топ-5 витратних бюджетів', '']],
    },
    {
      range: `'${DASHBOARD_SHEET_NAME}'!A28:B28`,
      values: [['Бюджет', 'Витрачено']],
    },
    // Top 5 budgets by spending - use LARGE to find top values and INDEX/MATCH to get names
    // Column B = Budget name, Column F = Spent amount in Місячний огляд
    {
      range: `'${DASHBOARD_SHEET_NAME}'!A29:B33`,
      values: Array.from({ length: 5 }, (_, rowIndex) => {
        const rank = rowIndex + 1;
        // Get the rank-th largest spending amount
        const spentFormula = `=IFERROR(LARGE('${MONTHLY_OVERVIEW_SHEET_NAME}'!$F$12:$F$50;${rank});"")`;
        // Get the corresponding budget name
        const budgetFormula = `=IFERROR(INDEX('${MONTHLY_OVERVIEW_SHEET_NAME}'!$B$12:$B$50;MATCH(B${29 + rowIndex};'${MONTHLY_OVERVIEW_SHEET_NAME}'!$F$12:$F$50;0));"")`;
        return [budgetFormula, spentFormula];
      }),
    },

    // Section 4: Budget Utilization Data (for Bar Chart) - rows 36-68
    // Direct reference to all budgets from Місячний огляд (up to 30)
    {
      range: `'${DASHBOARD_SHEET_NAME}'!A36:C36`,
      values: [['Використання бюджетів', '', '']],
    },
    {
      range: `'${DASHBOARD_SHEET_NAME}'!A37:C37`,
      values: [['Бюджет', 'Ліміт', 'Витрачено']],
    },
    // Budget utilization - direct reference to budget table rows
    // Місячний огляд columns: A=ID, B=Бюджет, C=Ліміт, D=Переносити, E=Виділено, F=Витрачено
    {
      range: `'${DASHBOARD_SHEET_NAME}'!A38:C67`,
      values: Array.from({ length: 30 }, (_, rowIndex) => {
        const sourceRow = 12 + rowIndex; // Budget data starts at row 12 in Місячний огляд
        return [
          `=IF('${MONTHLY_OVERVIEW_SHEET_NAME}'!A${sourceRow}="";"";'${MONTHLY_OVERVIEW_SHEET_NAME}'!B${sourceRow})`, // Budget name (blank if no ID)
          `=IF('${MONTHLY_OVERVIEW_SHEET_NAME}'!A${sourceRow}="";"";'${MONTHLY_OVERVIEW_SHEET_NAME}'!C${sourceRow})`, // Limit
          `=IF('${MONTHLY_OVERVIEW_SHEET_NAME}'!A${sourceRow}="";"";'${MONTHLY_OVERVIEW_SHEET_NAME}'!F${sourceRow})`, // Spent
        ];
      }),
    },

    // Summary statistics at the top right
    // Reference the existing computed values from Місячний огляд helper tables
    // Row 82 = current month data in monthly summary
    {
      range: `'${DASHBOARD_SHEET_NAME}'!E3:F7`,
      values: [
        ['Загальна статистика', ''],
        [
          'Всього витрат',
          `='${MONTHLY_OVERVIEW_SHEET_NAME}'!B82`, // Monthly expenses from helper table
        ],
        [
          'Всього доходів',
          `='${MONTHLY_OVERVIEW_SHEET_NAME}'!C82`, // Monthly income from helper table
        ],
        ['Баланс', `='${MONTHLY_OVERVIEW_SHEET_NAME}'!D82`], // Monthly balance from helper table
        [
          'Норма заощаджень',
          `=IF(F5>0;TEXT((F5-F4)/F5;"0,0%");"N/A")`, // Savings rate = (Income - Expenses) / Income
        ],
      ],
    },
  ];

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: data.map((item) => ({
        range: item.range,
        values: item.values,
      })),
    },
  });

  console.log('Helper tables created successfully.');
}

async function createCharts(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  dashboardSheetId: number,
): Promise<void> {
  console.log('Creating embedded charts...');

  const chartRequests: sheets_v4.Schema$Request[] = [
    // Chart 1: Spending by Category (Pie/Donut Chart) - Position: top-left area
    {
      addChart: {
        chart: {
          spec: {
            title: 'Витрати по категоріях',
            pieChart: {
              legendPosition: 'RIGHT_LEGEND',
              domain: {
                sourceRange: {
                  sources: [
                    {
                      sheetId: dashboardSheetId,
                      startRowIndex: 4,
                      endRowIndex: 14,
                      startColumnIndex: 0, // Column A (Category names)
                      endColumnIndex: 1,
                    },
                  ],
                },
              },
              series: {
                sourceRange: {
                  sources: [
                    {
                      sheetId: dashboardSheetId,
                      startRowIndex: 4,
                      endRowIndex: 14,
                      startColumnIndex: 1, // Column B (Amounts)
                      endColumnIndex: 2,
                    },
                  ],
                },
              },
              pieHole: 0.4, // Makes it a donut chart
            },
          },
          position: {
            overlayPosition: {
              anchorCell: {
                sheetId: dashboardSheetId,
                rowIndex: 0,
                columnIndex: 7, // Column H
              },
              widthPixels: 450,
              heightPixels: 300,
            },
          },
        },
      },
    },

    // Chart 2: Monthly Trend (Line Chart) - Position: below category chart
    {
      addChart: {
        chart: {
          spec: {
            title: 'Місячні тренди (Витрати vs Доходи)',
            basicChart: {
              chartType: 'LINE',
              legendPosition: 'BOTTOM_LEGEND',
              axis: [
                {
                  position: 'BOTTOM_AXIS',
                  title: 'Місяць',
                },
                {
                  position: 'LEFT_AXIS',
                  title: 'Сума (грн)',
                },
              ],
              domains: [
                {
                  domain: {
                    sourceRange: {
                      sources: [
                        {
                          sheetId: dashboardSheetId,
                          startRowIndex: 18,
                          endRowIndex: 24,
                          startColumnIndex: 0, // Column A (Month)
                          endColumnIndex: 1,
                        },
                      ],
                    },
                  },
                },
              ],
              series: [
                {
                  series: {
                    sourceRange: {
                      sources: [
                        {
                          sheetId: dashboardSheetId,
                          startRowIndex: 18,
                          endRowIndex: 24,
                          startColumnIndex: 1, // Column B (Expenses)
                          endColumnIndex: 2,
                        },
                      ],
                    },
                  },
                  targetAxis: 'LEFT_AXIS',
                  color: {
                    red: 0.92,
                    green: 0.26,
                    blue: 0.21,
                  },
                },
                {
                  series: {
                    sourceRange: {
                      sources: [
                        {
                          sheetId: dashboardSheetId,
                          startRowIndex: 18,
                          endRowIndex: 24,
                          startColumnIndex: 2, // Column C (Income)
                          endColumnIndex: 3,
                        },
                      ],
                    },
                  },
                  targetAxis: 'LEFT_AXIS',
                  color: {
                    red: 0.18,
                    green: 0.69,
                    blue: 0.29,
                  },
                },
              ],
              headerCount: 1,
            },
          },
          position: {
            overlayPosition: {
              anchorCell: {
                sheetId: dashboardSheetId,
                rowIndex: 16,
                columnIndex: 7, // Column H
              },
              widthPixels: 500,
              heightPixels: 300,
            },
          },
        },
      },
    },

    // Chart 3: Top 5 Spending Categories (Horizontal Bar Chart)
    {
      addChart: {
        chart: {
          spec: {
            title: 'Топ-5 витратних бюджетів',
            basicChart: {
              chartType: 'BAR',
              legendPosition: 'NO_LEGEND',
              axis: [
                {
                  position: 'BOTTOM_AXIS',
                  title: 'Сума (грн)',
                },
                {
                  position: 'LEFT_AXIS',
                  title: '',
                },
              ],
              domains: [
                {
                  domain: {
                    sourceRange: {
                      sources: [
                        {
                          sheetId: dashboardSheetId,
                          startRowIndex: 28,
                          endRowIndex: 33,
                          startColumnIndex: 0, // Column A (Budget names)
                          endColumnIndex: 1,
                        },
                      ],
                    },
                  },
                },
              ],
              series: [
                {
                  series: {
                    sourceRange: {
                      sources: [
                        {
                          sheetId: dashboardSheetId,
                          startRowIndex: 28,
                          endRowIndex: 33,
                          startColumnIndex: 1, // Column B (Spent amounts)
                          endColumnIndex: 2,
                        },
                      ],
                    },
                  },
                  targetAxis: 'BOTTOM_AXIS',
                  color: {
                    red: 0.26,
                    green: 0.52,
                    blue: 0.96,
                  },
                },
              ],
              headerCount: 1,
            },
          },
          position: {
            overlayPosition: {
              anchorCell: {
                sheetId: dashboardSheetId,
                rowIndex: 32,
                columnIndex: 7, // Column H
              },
              widthPixels: 450,
              heightPixels: 280,
            },
          },
        },
      },
    },

    // Chart 4: Budget Utilization (Grouped Bar Chart - Limit vs Spent)
    // Shows all budgets (up to 30)
    {
      addChart: {
        chart: {
          spec: {
            title: 'Використання бюджетів (Ліміт vs Витрачено)',
            basicChart: {
              chartType: 'BAR',
              legendPosition: 'TOP_LEGEND',
              axis: [
                {
                  position: 'BOTTOM_AXIS',
                  title: 'Сума (грн)',
                },
                {
                  position: 'LEFT_AXIS',
                  title: '',
                },
              ],
              domains: [
                {
                  domain: {
                    sourceRange: {
                      sources: [
                        {
                          sheetId: dashboardSheetId,
                          startRowIndex: 37,
                          endRowIndex: 67, // Up to 30 budgets
                          startColumnIndex: 0, // Column A (Budget names)
                          endColumnIndex: 1,
                        },
                      ],
                    },
                  },
                },
              ],
              series: [
                {
                  series: {
                    sourceRange: {
                      sources: [
                        {
                          sheetId: dashboardSheetId,
                          startRowIndex: 37,
                          endRowIndex: 67, // Up to 30 budgets
                          startColumnIndex: 1, // Column B (Limit)
                          endColumnIndex: 2,
                        },
                      ],
                    },
                  },
                  targetAxis: 'BOTTOM_AXIS',
                  color: {
                    red: 0.6,
                    green: 0.6,
                    blue: 0.6,
                  },
                },
                {
                  series: {
                    sourceRange: {
                      sources: [
                        {
                          sheetId: dashboardSheetId,
                          startRowIndex: 37,
                          endRowIndex: 67, // Up to 30 budgets
                          startColumnIndex: 2, // Column C (Spent)
                          endColumnIndex: 3,
                        },
                      ],
                    },
                  },
                  targetAxis: 'BOTTOM_AXIS',
                  color: {
                    red: 0.92,
                    green: 0.49,
                    blue: 0.13,
                  },
                },
              ],
              headerCount: 1,
            },
          },
          position: {
            overlayPosition: {
              anchorCell: {
                sheetId: dashboardSheetId,
                rowIndex: 48,
                columnIndex: 7, // Column H
              },
              widthPixels: 550,
              heightPixels: 600, // Taller to fit more budgets
            },
          },
        },
      },
    },
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: chartRequests,
    },
  });

  console.log('Charts created successfully.');
}

async function applyFormatting(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  dashboardSheetId: number,
): Promise<void> {
  console.log('Applying formatting...');

  const formatRequests: sheets_v4.Schema$Request[] = [
    // Format title row (A1)
    {
      repeatCell: {
        range: {
          sheetId: dashboardSheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
              fontSize: 16,
            },
          },
        },
        fields: 'userEnteredFormat.textFormat',
      },
    },

    // Format section headers (bold)
    {
      repeatCell: {
        range: {
          sheetId: dashboardSheetId,
          startRowIndex: 2,
          endRowIndex: 3,
          startColumnIndex: 0,
          endColumnIndex: 2,
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
            },
            backgroundColor: {
              red: 0.9,
              green: 0.9,
              blue: 0.9,
            },
          },
        },
        fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      },
    },

    // Format table headers (row 4 - Category table)
    {
      repeatCell: {
        range: {
          sheetId: dashboardSheetId,
          startRowIndex: 3,
          endRowIndex: 4,
          startColumnIndex: 0,
          endColumnIndex: 2,
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
            },
            backgroundColor: {
              red: 0.85,
              green: 0.85,
              blue: 0.85,
            },
          },
        },
        fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      },
    },

    // Format Monthly Trends section header
    {
      repeatCell: {
        range: {
          sheetId: dashboardSheetId,
          startRowIndex: 16,
          endRowIndex: 17,
          startColumnIndex: 0,
          endColumnIndex: 4,
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
            },
            backgroundColor: {
              red: 0.9,
              green: 0.9,
              blue: 0.9,
            },
          },
        },
        fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      },
    },

    // Format Monthly Trends table headers
    {
      repeatCell: {
        range: {
          sheetId: dashboardSheetId,
          startRowIndex: 17,
          endRowIndex: 18,
          startColumnIndex: 0,
          endColumnIndex: 4,
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
            },
            backgroundColor: {
              red: 0.85,
              green: 0.85,
              blue: 0.85,
            },
          },
        },
        fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      },
    },

    // Format statistics section header
    {
      repeatCell: {
        range: {
          sheetId: dashboardSheetId,
          startRowIndex: 2,
          endRowIndex: 3,
          startColumnIndex: 4,
          endColumnIndex: 6,
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
            },
            backgroundColor: {
              red: 0.9,
              green: 0.9,
              blue: 0.9,
            },
          },
        },
        fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      },
    },

    // Format Top 5 section header
    {
      repeatCell: {
        range: {
          sheetId: dashboardSheetId,
          startRowIndex: 26,
          endRowIndex: 27,
          startColumnIndex: 0,
          endColumnIndex: 2,
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
            },
            backgroundColor: {
              red: 0.9,
              green: 0.9,
              blue: 0.9,
            },
          },
        },
        fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      },
    },

    // Format Top 5 table headers
    {
      repeatCell: {
        range: {
          sheetId: dashboardSheetId,
          startRowIndex: 27,
          endRowIndex: 28,
          startColumnIndex: 0,
          endColumnIndex: 2,
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
            },
            backgroundColor: {
              red: 0.85,
              green: 0.85,
              blue: 0.85,
            },
          },
        },
        fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      },
    },

    // Format Budget Utilization section header
    {
      repeatCell: {
        range: {
          sheetId: dashboardSheetId,
          startRowIndex: 35,
          endRowIndex: 36,
          startColumnIndex: 0,
          endColumnIndex: 3,
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
            },
            backgroundColor: {
              red: 0.9,
              green: 0.9,
              blue: 0.9,
            },
          },
        },
        fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      },
    },

    // Format Budget Utilization table headers
    {
      repeatCell: {
        range: {
          sheetId: dashboardSheetId,
          startRowIndex: 36,
          endRowIndex: 37,
          startColumnIndex: 0,
          endColumnIndex: 3,
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
            },
            backgroundColor: {
              red: 0.85,
              green: 0.85,
              blue: 0.85,
            },
          },
        },
        fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      },
    },

    // Set column widths
    {
      updateDimensionProperties: {
        range: {
          sheetId: dashboardSheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 1,
        },
        properties: {
          pixelSize: 180,
        },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: dashboardSheetId,
          dimension: 'COLUMNS',
          startIndex: 1,
          endIndex: 4,
        },
        properties: {
          pixelSize: 120,
        },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: dashboardSheetId,
          dimension: 'COLUMNS',
          startIndex: 4,
          endIndex: 5,
        },
        properties: {
          pixelSize: 150,
        },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: dashboardSheetId,
          dimension: 'COLUMNS',
          startIndex: 5,
          endIndex: 6,
        },
        properties: {
          pixelSize: 120,
        },
        fields: 'pixelSize',
      },
    },

    // Format currency columns (B, C in data tables)
    {
      repeatCell: {
        range: {
          sheetId: dashboardSheetId,
          startRowIndex: 4,
          endRowIndex: 50,
          startColumnIndex: 1,
          endColumnIndex: 4,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'NUMBER',
              pattern: '#,##0.00',
            },
          },
        },
        fields: 'userEnteredFormat.numberFormat',
      },
    },

    // Format statistics values (F column)
    {
      repeatCell: {
        range: {
          sheetId: dashboardSheetId,
          startRowIndex: 3,
          endRowIndex: 7,
          startColumnIndex: 5,
          endColumnIndex: 6,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'NUMBER',
              pattern: '#,##0.00',
            },
          },
        },
        fields: 'userEnteredFormat.numberFormat',
      },
    },
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: formatRequests,
    },
  });

  console.log('Formatting applied successfully.');
}

async function main(): Promise<void> {
  const spreadsheetId = getRequiredEnvVar('SPREADSHEET_ID');

  console.log('Setting up Dashboard sheet...');
  console.log(`Spreadsheet ID: ${spreadsheetId}`);

  const sheets = await getSheets();

  // Step 1: Delete existing sheet if it exists
  await deleteSheetIfExists(sheets, spreadsheetId, DASHBOARD_SHEET_NAME);

  // Step 2: Create new dashboard sheet
  const dashboardSheetId = await createDashboardSheet(sheets, spreadsheetId);

  // Step 3: Write helper data tables with formulas
  await writeHelperTables(sheets, spreadsheetId);

  // Step 4: Create embedded charts
  await createCharts(sheets, spreadsheetId, dashboardSheetId);

  // Step 5: Apply formatting
  await applyFormatting(sheets, spreadsheetId, dashboardSheetId);

  console.log('\nDashboard setup complete!');
  console.log(
    `Open the spreadsheet to see the "${DASHBOARD_SHEET_NAME}" sheet.`,
  );
}

main().catch((error) => {
  console.error('Error:', error.message || error);
  process.exit(1);
});
