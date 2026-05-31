import fs from 'fs';
import path from 'path';
import type { SnapshotFile, SchemaValue } from './types.js';

const SNAPSHOTS_DIR = path.resolve(process.cwd(), '.driftwatch', 'snapshots');

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function ensureDir(): void {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
}

function snapshotPath(endpointName: string): string {
  return path.join(SNAPSHOTS_DIR, `${toSlug(endpointName)}.json`);
}

export function readSnapshot(endpointName: string): SnapshotFile | null {
  const file = snapshotPath(endpointName);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as SnapshotFile;
}

export function writeSnapshot(endpointName: string, url: string, schema: SchemaValue): void {
  ensureDir();
  const snapshot: SnapshotFile = {
    endpoint: endpointName,
    url,
    capturedAt: new Date().toISOString(),
    schema,
  };
  const dest = snapshotPath(endpointName);
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
  fs.renameSync(tmp, dest);
}
