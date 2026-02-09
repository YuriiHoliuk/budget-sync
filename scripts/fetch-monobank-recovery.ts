/**
 * Fetch Monobank Recovery Data
 *
 * Fetches transactions from Monobank API for Iron and White cards
 * for the period Jan 1, 2026 to Feb 9, 2026.
 * Also fetches current account info for balances.
 *
 * Rate limit: 60 seconds between requests.
 * Max range per request: 31 days.
 *
 * Usage:
 *   bun run scripts/fetch-monobank-recovery.ts
 */

import 'dotenv/config';

const MONOBANK_TOKEN = process.env['MONOBANK_TOKEN'];
if (!MONOBANK_TOKEN) {
  console.error('ERROR: MONOBANK_TOKEN environment variable is required');
  process.exit(1);
}

const BASE_URL = 'https://api.monobank.ua';
const OUTPUT_DIR = './recovery/monobank-data';

// Account IDs
const IRON_CARD = 'tZ7TK0SXUSTPPPdVpgHf0g';
const WHITE_CARD = 'kM9m2i5TaZuzI_Ft8prkbA';

// Time ranges (Unix seconds)
const JAN_1 = Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000);
const JAN_31 = Math.floor(new Date('2026-01-31T23:59:59Z').getTime() / 1000);
const FEB_1 = Math.floor(new Date('2026-02-01T00:00:00Z').getTime() / 1000);
const FEB_9 = Math.floor(new Date('2026-02-09T23:59:59Z').getTime() / 1000);

const RATE_LIMIT_DELAY_MS = 62_000; // 62 seconds to be safe

async function monoFetch(path: string): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  console.log(`  GET ${path}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Token': MONOBANK_TOKEN!,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Monobank API error ${response.status}: ${body}`);
  }

  return response.json();
}

async function delay(ms: number, label: string): Promise<void> {
  const seconds = Math.round(ms / 1000);
  console.log(`  Waiting ${seconds}s for rate limit (${label})...`);

  const interval = 10_000;
  let elapsed = 0;
  while (elapsed < ms) {
    const waitTime = Math.min(interval, ms - elapsed);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    elapsed += waitTime;
    if (elapsed < ms) {
      console.log(`    ${Math.round((ms - elapsed) / 1000)}s remaining...`);
    }
  }
}

async function ensureDir(path: string): Promise<void> {
  await Bun.write(`${path}/.gitkeep`, '');
}

async function main() {
  console.log('='.repeat(60));
  console.log('Fetch Monobank Recovery Data');
  console.log('='.repeat(60));
  console.log(`\nIron Card: ${IRON_CARD}`);
  console.log(`White Card: ${WHITE_CARD}`);
  console.log(`Period: 2026-01-01 to 2026-02-09`);
  console.log(`Jan 1 timestamp: ${JAN_1}`);
  console.log(`Feb 9 timestamp: ${FEB_9}`);

  await ensureDir(OUTPUT_DIR);

  // Step 1: Fetch account info
  console.log('\n--- Step 1: Fetch account info ---');
  const clientInfo = await monoFetch('/personal/client-info');
  await Bun.write(
    `${OUTPUT_DIR}/client-info.json`,
    JSON.stringify(clientInfo, null, 2),
  );
  console.log('  Saved client-info.json');

  // Step 2: Fetch Iron Card - January
  await delay(RATE_LIMIT_DELAY_MS, 'before Iron Jan');
  console.log('\n--- Step 2: Iron Card - January (Jan 1-31) ---');
  const ironJan = await monoFetch(
    `/personal/statement/${IRON_CARD}/${JAN_1}/${JAN_31}`,
  );
  await Bun.write(
    `${OUTPUT_DIR}/iron-jan.json`,
    JSON.stringify(ironJan, null, 2),
  );
  const ironJanCount = Array.isArray(ironJan) ? ironJan.length : 0;
  console.log(`  Saved iron-jan.json (${ironJanCount} transactions)`);

  // Step 3: Fetch Iron Card - February
  await delay(RATE_LIMIT_DELAY_MS, 'before Iron Feb');
  console.log('\n--- Step 3: Iron Card - February (Feb 1-9) ---');
  const ironFeb = await monoFetch(
    `/personal/statement/${IRON_CARD}/${FEB_1}/${FEB_9}`,
  );
  await Bun.write(
    `${OUTPUT_DIR}/iron-feb.json`,
    JSON.stringify(ironFeb, null, 2),
  );
  const ironFebCount = Array.isArray(ironFeb) ? ironFeb.length : 0;
  console.log(`  Saved iron-feb.json (${ironFebCount} transactions)`);

  // Step 4: Fetch White Card - January
  await delay(RATE_LIMIT_DELAY_MS, 'before White Jan');
  console.log('\n--- Step 4: White Card - January (Jan 1-31) ---');
  const whiteJan = await monoFetch(
    `/personal/statement/${WHITE_CARD}/${JAN_1}/${JAN_31}`,
  );
  await Bun.write(
    `${OUTPUT_DIR}/white-jan.json`,
    JSON.stringify(whiteJan, null, 2),
  );
  const whiteJanCount = Array.isArray(whiteJan) ? whiteJan.length : 0;
  console.log(`  Saved white-jan.json (${whiteJanCount} transactions)`);

  // Step 5: Fetch White Card - February
  await delay(RATE_LIMIT_DELAY_MS, 'before White Feb');
  console.log('\n--- Step 5: White Card - February (Feb 1-9) ---');
  const whiteFeb = await monoFetch(
    `/personal/statement/${WHITE_CARD}/${FEB_1}/${FEB_9}`,
  );
  await Bun.write(
    `${OUTPUT_DIR}/white-feb.json`,
    JSON.stringify(whiteFeb, null, 2),
  );
  const whiteFebCount = Array.isArray(whiteFeb) ? whiteFeb.length : 0;
  console.log(`  Saved white-feb.json (${whiteFebCount} transactions)`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('FETCH COMPLETE');
  console.log('='.repeat(60));
  console.log(`
Summary:
  - Iron Card January:  ${ironJanCount} transactions
  - Iron Card February: ${ironFebCount} transactions
  - White Card January: ${whiteJanCount} transactions
  - White Card February: ${whiteFebCount} transactions
  - Total: ${ironJanCount + ironFebCount + whiteJanCount + whiteFebCount} transactions
  - Files saved to: ${OUTPUT_DIR}/
`);
}

main().catch((error) => {
  console.error('\nFetch failed:', error);
  process.exit(1);
});
