export type SchemaValue = string | SchemaObject;
export type SchemaObject = { [key: string]: SchemaValue };

export interface EndpointConfig {
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  interval: string;
}

export interface TelegramConfig {
  bot_token: string;
  chat_id: string;
}

export interface Config {
  telegram?: TelegramConfig;
  endpoints: EndpointConfig[];
}

export interface SnapshotFile {
  endpoint: string;
  url: string;
  capturedAt: string;
  schema: SchemaValue;
}

export interface DiffEntry {
  path: string;
  type: string;
}

export interface ChangedEntry {
  path: string;
  from: string;
  to: string;
}

export interface DiffResult {
  added: DiffEntry[];
  removed: DiffEntry[];
  changed: ChangedEntry[];
}
