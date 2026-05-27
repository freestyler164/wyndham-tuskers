import path from 'node:path';
import process from 'node:process';
import xlsx from 'xlsx';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { awsClientConfig } from './awsConfig.js';

const MEMBERSHIP_YEAR = '2026-27';
const SOURCE = 'tuskers-members-2026';
const SHEET_NAME = '2026';

const COLUMNS = {
  email: 'Email address',
  name: 'Name',
  mobile: 'Mobile',
  renewal: 'Would you like to renew your membership with Wyndham Tuskers Sports Club for the year 2026-27?',
  adults: 'Adults',
  kidsUnder5: 'Kids - Under 5 years old',
  kidsOver5: 'Kids - Above 5 years old',
  partnerUpdates: 'I want my wife / partner to be kept informed about Wyndham Tuskers family events and club achievements.',
  partnerName: "Partner's Name",
  partnerPhone: "Partner's mobile number",
  sportsLastYear: 'Which sports did you take part in the last year?',
  sportsLastYearFallback: 'Which sports did you take part in last year?',
  sportsNextYear: 'Which sports would you be taking part in the next year?',
  engagement: 'How engaged do you feel with Wyndham Tuskers activities and community?”\n1: Not engaged\n2: Slightly engaged\n3: Moderately engaged\n4: Highly engaged\n5: Very highly engaged',
  feedback: 'Questions and Feedback ',
  policyAccepted: 'As a member, I will abide by the rules and policies of the Wyndham Tuskers CC Inc and accept responsibilities for all materials owned by the club.\n\nI also understand that the club membership fees will be communicated later and have to be paid in full without delay.',
};

const args = process.argv.slice(2);
const mode = args.find((arg) => ['--dry-run', '--import', '--send-welcome'].includes(arg));
const workbookPath = args.find((arg) => !arg.startsWith('--'));

const usage = () => {
  console.log(`Usage:
  node src/importMembers.js --dry-run <workbook.xlsx>
  node src/importMembers.js --import <workbook.xlsx>

Phase 1 is import-only. --send-welcome is intentionally disabled.`);
};

if (!mode || !workbookPath) {
  usage();
  process.exit(1);
}

if (mode === '--send-welcome' || args.includes('--force-welcome')) {
  console.error('Welcome email/setup-token generation is not implemented in Phase 1.');
  process.exit(1);
}

const USERS_TABLE = process.env.USERS_TABLE;

if (!USERS_TABLE) {
  throw new Error('USERS_TABLE is required. Refusing to import members into an implicit/default table.');
}

const cleanText = (value) => String(value ?? '').trim();
const normalizeEmail = (value) => cleanText(value).toLowerCase();
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const toBoolean = (value) => cleanText(value).toLowerCase() === 'yes';
const splitList = (value) => cleanText(value)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const normalizePhone = (value) => cleanText(value).replace(/[^\d+]/g, '');
const cleanPhone = (value) => {
  const text = cleanText(value);
  return /\d/.test(text) ? text : '';
};

const getColumn = (row, columnName) => row[columnName];

const readRows = (filePath) => {
  const resolvedPath = path.resolve(filePath);
  const workbook = xlsx.readFile(resolvedPath);
  const sheet = workbook.Sheets[SHEET_NAME];

  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" was not found in ${resolvedPath}.`);
  }

  return xlsx.utils.sheet_to_json(sheet, { defval: '' });
};

const mapRow = (row, index) => {
  const sportsLastYear = cleanText(getColumn(row, COLUMNS.sportsLastYear))
    ? splitList(getColumn(row, COLUMNS.sportsLastYear))
    : splitList(getColumn(row, COLUMNS.sportsLastYearFallback));

  return {
    rowNumber: index + 2,
    email: normalizeEmail(getColumn(row, COLUMNS.email)),
    fullName: cleanText(getColumn(row, COLUMNS.name)),
    phone: cleanPhone(getColumn(row, COLUMNS.mobile)),
    membershipStatus: 'active',
    membershipYear: MEMBERSHIP_YEAR,
    source: SOURCE,
    family: {
      adults: toNumber(getColumn(row, COLUMNS.adults)),
      kidsUnder5: toNumber(getColumn(row, COLUMNS.kidsUnder5)),
      kidsOver5: toNumber(getColumn(row, COLUMNS.kidsOver5)),
    },
    partner: {
      name: cleanText(getColumn(row, COLUMNS.partnerName)),
      phone: cleanPhone(getColumn(row, COLUMNS.partnerPhone)),
      wantsUpdates: toBoolean(getColumn(row, COLUMNS.partnerUpdates)),
    },
    sportsLastYear,
    sportsNextYear: splitList(getColumn(row, COLUMNS.sportsNextYear)),
    engagementScore: toNumber(getColumn(row, COLUMNS.engagement)) || undefined,
    feedback: cleanText(getColumn(row, COLUMNS.feedback)),
    policyAccepted: toBoolean(getColumn(row, COLUMNS.policyAccepted)),
  };
};

const getDuplicates = (values) => {
  const counts = new Map();
  for (const value of values.filter(Boolean)) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }));
};

const buildReport = (rows, members) => {
  const missingEmails = members.filter((member) => !member.email);
  const missingMobiles = members.filter((member) => !member.phone);
  const duplicateEmails = getDuplicates(members.map((member) => member.email));
  const duplicateMobiles = getDuplicates(members.map((member) => normalizePhone(member.phone)));

  return {
    sheet: SHEET_NAME,
    totalRows: rows.length,
    renewalYesRows: members.length,
    validImportRows: members.length - missingEmails.length,
    missingEmailCount: missingEmails.length,
    missingEmailRows: missingEmails.map((member) => member.rowNumber),
    missingMobileCount: missingMobiles.length,
    missingMobileRows: missingMobiles.map((member) => member.rowNumber),
    duplicateEmailCount: duplicateEmails.length,
    duplicateEmails,
    duplicateMobileCount: duplicateMobiles.length,
    duplicateMobiles,
  };
};

const printReport = (report) => {
  console.log(JSON.stringify(report, null, 2));
};

const rows = readRows(workbookPath);
const renewedRows = rows.filter((row) => cleanText(getColumn(row, COLUMNS.renewal)).toLowerCase() === 'yes');
const members = renewedRows.map(mapRow);
const report = buildReport(rows, members);

console.log(`Member import Phase 1 (${mode === '--dry-run' ? 'dry run' : 'import'})`);
console.log(`Workbook: ${path.resolve(workbookPath)}`);
console.log(`Target table: ${USERS_TABLE}`);
printReport(report);

const importableMembers = members.filter((member) => member.email);

if (mode === '--dry-run') {
  console.log('Dry run complete. No DynamoDB writes were performed.');
  process.exit(0);
}

if (report.duplicateEmailCount > 0) {
  throw new Error('Duplicate emails found in import set. Resolve duplicates before importing.');
}

const dynamoClient = new DynamoDBClient(awsClientConfig);
const db = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

let created = 0;
let updated = 0;
let preservedAdmins = 0;
let preservedPasswords = 0;
const now = new Date().toISOString();

for (const member of importableMembers) {
  const { rowNumber, ...memberItem } = member;
  const existingResult = await db.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { email: member.email },
  }));
  const existing = existingResult.Item || {};
  const existingRole = existing.role;

  const item = {
    ...existing,
    ...memberItem,
    role: existingRole === 'admin' ? 'admin' : 'member',
    importedAt: existing.importedAt || now,
    updatedAt: now,
  };

  if (existing.passwordHash) {
    item.passwordHash = existing.passwordHash;
    preservedPasswords += 1;
  }

  if (existingRole === 'admin') {
    preservedAdmins += 1;
  }

  await db.send(new PutCommand({
    TableName: USERS_TABLE,
    Item: item,
  }));

  if (existing.email) {
    updated += 1;
  } else {
    created += 1;
  }
}

console.log(JSON.stringify({
  imported: importableMembers.length,
  created,
  updated,
  skippedMissingEmail: report.missingEmailCount,
  preservedAdmins,
  preservedPasswords,
  emailsSent: 0,
  setupTokensCreated: 0,
}, null, 2));
