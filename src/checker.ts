import axios from 'axios';
import { readSnapshot, writeSnapshot } from './snapshot.js';
import type { EndpointConfig, SchemaValue, SchemaObject, DiffResult, DiffEntry, ChangedEntry } from './types.js';

const MAX_DEPTH = 20;

export function extractSchema(value: unknown, depth = 0): SchemaValue {
  if (depth >= MAX_DEPTH) return 'object';
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length > 0 && value[0] !== null && typeof value[0] === 'object' && !Array.isArray(value[0])) {
      return { '[]': extractSchema(value[0], depth + 1) };
    }
    return 'array';
  }
  if (typeof value === 'object') {
    const obj: SchemaObject = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      obj[key] = extractSchema(val, depth + 1);
    }
    return obj;
  }
  return typeof value;
}

function flattenSchema(schema: SchemaValue, prefix = ''): Record<string, string> {
  if (typeof schema === 'string') {
    return prefix ? { [prefix]: schema } : {};
  }
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(schema as SchemaObject)) {
    const p = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'string') {
      result[p] = val;
    } else {
      Object.assign(result, flattenSchema(val, p));
    }
  }
  return result;
}

export function diffSchemas(prev: SchemaValue, curr: SchemaValue): DiffResult {
  const prevFlat = flattenSchema(prev);
  const currFlat = flattenSchema(curr);

  const added: DiffEntry[] = [];
  const removed: DiffEntry[] = [];
  const changed: ChangedEntry[] = [];

  for (const [path, type] of Object.entries(currFlat)) {
    if (!(path in prevFlat)) {
      added.push({ path, type });
    } else if (prevFlat[path] !== type) {
      changed.push({ path, from: prevFlat[path], to: type });
    }
  }

  for (const [path, type] of Object.entries(prevFlat)) {
    if (!(path in currFlat)) {
      removed.push({ path, type });
    }
  }

  return { added, removed, changed };
}

export interface CheckResult {
  endpoint: EndpointConfig;
  isFirstRun: boolean;
  hasDrift: boolean;
  diff: DiffResult;
}

export async function checkEndpoint(endpoint: EndpointConfig): Promise<CheckResult> {
  const response = await axios({
    method: endpoint.method,
    url: endpoint.url,
    headers: endpoint.headers ?? {},
    data: endpoint.body,
    timeout: 15000,
    maxContentLength: 5 * 1024 * 1024, // 5MB
    maxBodyLength: 1 * 1024 * 1024,     // 1MB request body
  });

  const schema = extractSchema(response.data);
  const snapshot = readSnapshot(endpoint.name);

  if (!snapshot) {
    writeSnapshot(endpoint.name, endpoint.url, schema);
    return {
      endpoint,
      isFirstRun: true,
      hasDrift: false,
      diff: { added: [], removed: [], changed: [] },
    };
  }

  const diff = diffSchemas(snapshot.schema, schema);
  const hasDrift = diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;

  if (hasDrift) {
    writeSnapshot(endpoint.name, endpoint.url, schema);
  }

  return { endpoint, isFirstRun: false, hasDrift, diff };
}
