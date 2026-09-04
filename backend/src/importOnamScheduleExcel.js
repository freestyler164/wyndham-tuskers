import crypto from 'crypto';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { awsClientConfig } from './awsConfig.js';

const require = createRequire(import.meta.url);
const readXlsxFile = require('read-excel-file/node');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TABLE = process.env.ONAM_SCHEDULE_TABLE || 'onam_schedule';
const db = DynamoDBDocumentClient.from(new DynamoDBClient(awsClientConfig), {
  marshallOptions: { removeUndefinedValues: true },
});

const DEFAULT_FILE = path.resolve(__dirname, '../../Wyndham_Tuskers_Onam_2026_Program_Schedule 2.xlsx');

const formatTimeLabel = (value) => {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    const hours = value.getHours();
    const minutes = value.getMinutes();
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
  }
  if (typeof value === 'number') {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
  }
  return String(value).trim();
};

const formatDuration = (value) => {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    const minutes = value.getHours() * 60 + value.getMinutes();
    const seconds = value.getSeconds();
    if (minutes && seconds) return `${minutes} min ${seconds}s`;
    if (minutes) return `${minutes} min`;
    return `${seconds}s`;
  }
  if (typeof value === 'number') {
    const totalSeconds = Math.round(value * 24 * 60 * 60);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes && seconds) return `${minutes} min ${seconds}s`;
    if (minutes) return `${minutes} min`;
    return `${seconds}s`;
  }
  return String(value).trim();
};

const formatMobile = (value) => {
  if (value == null || value === '') return '';
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 9 && digits.startsWith('4')) return `0${digits}`;
  return digits;
};

const clean = (value, max = 500) => String(value ?? '')
  .replace(/\u00a0/g, ' ')
  .replace(/\0/g, '')
  .trim()
  .slice(0, max);

const mapRow = (row, sortOrder) => {
  const [
    entryId,
    time,
    programType,
    duration,
    contactPerson,
    mobile,
    programName,
    ageGroup,
    performanceFormat,
    teamName,
    choreographer,
    participants,
  ] = row;

  const timeLabel = formatTimeLabel(time);
  const contact = clean(contactPerson, 100);
  const title = clean(programName, 180) || contact || clean(programType, 180) || 'Program item';
  const choreographerText = clean(choreographer, 1200);
  const looksLikeDescription = choreographerText.length > 140;
  const description = looksLikeDescription ? choreographerText.slice(0, 1200) : '';
  const choreographerValue = looksLikeDescription ? '' : choreographerText.slice(0, 200);

  if (!timeLabel && !clean(programName) && !contact && !clean(programType)) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id: `item#${crypto.randomUUID()}`,
    type: 'scheduleItem',
    timeLabel: timeLabel || clean(programType, 40) || 'TBA',
    title,
    location: '',
    description,
    entryId: clean(entryId, 20),
    programType: clean(programType, 40),
    duration: formatDuration(duration),
    contactPerson: contact,
    mobile: formatMobile(mobile),
    ageGroup: clean(ageGroup, 40),
    performanceFormat: clean(performanceFormat, 40),
    teamName: clean(teamName, 120),
    choreographer: choreographerValue,
    participants: clean(participants, 800),
    status: 'upcoming',
    published: true,
    sortOrder,
    createdAt: now,
    updatedAt: now,
    updatedBy: 'excel-import',
  };
};

const replaceScheduleItems = async (items) => {
  const existing = await db.send(new ScanCommand({ TableName: TABLE }));
  const oldItems = (existing.Items || []).filter((item) => item.type === 'scheduleItem');
  for (const item of oldItems) {
    await db.send(new DeleteCommand({ TableName: TABLE, Key: { id: item.id } }));
  }
  for (const item of items) {
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
  }
};

const loadRows = async (filePath) => {
  const result = await readXlsxFile(filePath);
  // read-excel-file v9 may return either a row matrix or [{ sheet, data }].
  if (Array.isArray(result) && result[0] && Array.isArray(result[0].data)) {
    return result[0].data;
  }
  if (result && Array.isArray(result.data)) {
    return result.data;
  }
  return result;
};

const main = async () => {
  const filePath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_FILE;
  if (!existsSync(filePath)) {
    throw new Error(`Excel file not found: ${filePath}`);
  }

  const rows = await loadRows(filePath);
  if (!rows.length) throw new Error('Excel sheet is empty.');

  const [, ...dataRows] = rows;
  const items = dataRows
    .map((row, index) => mapRow(row, (index + 1) * 10))
    .filter(Boolean);

  if (!items.length) throw new Error('No program rows found in the Excel file.');

  await replaceScheduleItems(items);
  console.log(`Imported ${items.length} Onam schedule items into ${TABLE}.`);
  items.slice(0, 5).forEach((item) => {
    console.log(`- ${item.timeLabel} | ${item.entryId || '-'} | ${item.title}`);
  });
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
