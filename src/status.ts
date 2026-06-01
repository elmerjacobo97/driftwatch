import fs from 'fs';
import path from 'path';

const STATUS_FILE = path.resolve(process.cwd(), '.driftwatch', 'status.json');

export type EndpointStatus = 'ok' | 'drift' | 'down' | 'first-run';

export interface EndpointStatusEntry {
  lastCheck: string;
  status: EndpointStatus;
  reason?: string;
  lastAlertAt?: string;
}

export interface StatusData {
  endpoints: Record<string, EndpointStatusEntry>;
}

function readFile(): StatusData {
  if (!fs.existsSync(STATUS_FILE)) return { endpoints: {} };
  try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch { return { endpoints: {} }; }
}

function writeFile(data: StatusData): void {
  fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
  const tmp = `${STATUS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, STATUS_FILE);
}

export function writeEndpointStatus(name: string, status: EndpointStatus, reason?: string): void {
  const data = readFile();
  const existing = data.endpoints[name];
  data.endpoints[name] = {
    lastCheck: new Date().toISOString(),
    status,
    reason,
    lastAlertAt: existing?.lastAlertAt,
  };
  writeFile(data);
}

export function setLastAlertAt(name: string): void {
  const data = readFile();
  data.endpoints[name] ??= { lastCheck: new Date().toISOString(), status: 'ok' };
  data.endpoints[name].lastAlertAt = new Date().toISOString();
  writeFile(data);
}

export function getLastAlertAt(name: string): string | undefined {
  return readFile().endpoints[name]?.lastAlertAt;
}

export function readStatusData(): StatusData {
  return readFile();
}
