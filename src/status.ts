import fs from 'fs';
import path from 'path';

const STATUS_FILE = path.resolve(process.cwd(), '.driftwatch', 'status.json');

export type EndpointStatus = 'ok' | 'drift' | 'down' | 'first-run';

export interface EndpointStatusEntry {
  lastCheck: string;
  status: EndpointStatus;
  reason?: string;
}

export interface StatusData {
  endpoints: Record<string, EndpointStatusEntry>;
}

function readFile(): StatusData {
  if (!fs.existsSync(STATUS_FILE)) return { endpoints: {} };
  try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch { return { endpoints: {} }; }
}

export function writeEndpointStatus(name: string, status: EndpointStatus, reason?: string): void {
  const data = readFile();
  data.endpoints[name] = { lastCheck: new Date().toISOString(), status, reason };
  fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
  const tmp = `${STATUS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, STATUS_FILE);
}

export function readStatusData(): StatusData {
  return readFile();
}
