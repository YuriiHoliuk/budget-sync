/**
 * Share the spreadsheet with a service account
 *
 * Usage: bun scripts/share-spreadsheet.ts <email>
 */

import 'dotenv/config';
import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SERVICE_ACCOUNT_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;

async function shareSpreadsheet(email: string) {
  if (!SPREADSHEET_ID) {
    throw new Error('SPREADSHEET_ID is not set');
  }
  if (!SERVICE_ACCOUNT_FILE) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_FILE is not set');
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_FILE,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const drive = google.drive({ version: 'v3', auth });

  // Add permission to the spreadsheet
  await drive.permissions.create({
    fileId: SPREADSHEET_ID,
    requestBody: {
      type: 'user',
      role: 'writer',
      emailAddress: email,
    },
    sendNotificationEmail: false,
  });

  console.log(`Shared spreadsheet with ${email}`);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: bun scripts/share-spreadsheet.ts <email>');
  process.exit(1);
}

shareSpreadsheet(email).catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
