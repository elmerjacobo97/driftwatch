export type SchemaValue = string | SchemaObject;
export type SchemaObject = { [key: string]: SchemaValue };

export interface EndpointConfig {
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  interval: string;
  retries?: number;       // attempts after first failure, default 0
  retry_delay?: number;   // seconds between retries, default 5
  ignore_fields?: string[]; // field names to exclude from drift detection
}

export interface TelegramConfig {
  bot_token: string;
  chat_id: string;
}

export interface SlackConfig {
  webhook_url: string;
}

export interface DiscordConfig {
  webhook_url: string;
}

export interface AlertsConfig {
  telegram?: TelegramConfig;
  slack?: SlackConfig;
  discord?: DiscordConfig;
}

export interface Config {
  telegram?: TelegramConfig; // backwards compat — normalized to alerts.telegram on load
  alerts?: AlertsConfig;
  alert_cooldown?: number;   // minutes between repeated alerts for the same endpoint
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
