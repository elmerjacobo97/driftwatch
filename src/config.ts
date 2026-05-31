import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import dotenv from 'dotenv';
import type { Config } from './types.js';

dotenv.config();

function resolveEnvVars(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{([^}]+)\}/g, (_, name: string) => process.env[name] ?? '');
  }
  if (Array.isArray(value)) return value.map(resolveEnvVars);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, resolveEnvVars(v)])
    );
  }
  return value;
}

export function loadConfig(configPath?: string): Config {
  const filePath = configPath ?? path.resolve(process.cwd(), 'driftwatch.config.yml');

  if (!fs.existsSync(filePath)) {
    throw new Error(`Config not found: ${filePath}\nRun "driftwatch init" to create one.`);
  }

  const raw = yaml.load(fs.readFileSync(filePath, 'utf8'));
  const resolved = resolveEnvVars(raw) as Config;

  if (!Array.isArray(resolved.endpoints) || resolved.endpoints.length === 0) {
    throw new Error('Config must have at least one endpoint');
  }

  for (const ep of resolved.endpoints) {
    if (!ep.name) throw new Error('Endpoint missing "name"');
    if (!ep.url) throw new Error(`Endpoint "${ep.name}" missing "url"`);
    if (!ep.interval) throw new Error(`Endpoint "${ep.name}" missing "interval"`);
    if (!ep.method) ep.method = 'GET';
  }

  return resolved;
}
