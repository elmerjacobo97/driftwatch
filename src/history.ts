import fs from 'fs';
import path from 'path';
import type { DiffResult } from './types.js';

const HISTORY_FILE = path.resolve(process.cwd(), '.driftwatch', 'history.json');

export interface HistoryEntry {
  timestamp: string;
  endpoint: string;
  url: string;
  diff: DiffResult;
}

export function appendHistory(endpoint: string, url: string, diff: DiffResult): void {
  let entries: HistoryEntry[] = [];
  if (fs.existsSync(HISTORY_FILE)) {
    try { entries = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch {}
  }
  entries.push({ timestamp: new Date().toISOString(), endpoint, url, diff });
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  const tmp = `${HISTORY_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, HISTORY_FILE);
}

export function readHistory(): HistoryEntry[] {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { return []; }
}
