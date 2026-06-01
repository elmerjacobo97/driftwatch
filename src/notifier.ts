import axios from 'axios';
import { sendDriftAlert, sendDownAlert, isBotReady } from './telegram.js';
import type { Config, EndpointConfig } from './types.js';
import type { CheckResult } from './checker.js';

function cooldownExpired(lastAlertAt: string | undefined, minutes: number): boolean {
  if (!lastAlertAt) return true;
  return (Date.now() - new Date(lastAlertAt).getTime()) / 60000 >= minutes;
}

async function postWebhook(url: string, payload: unknown): Promise<void> {
  await axios.post(url, payload, { timeout: 10000 });
}

function driftText(result: CheckResult): string {
  const { endpoint, diff } = result;
  const lines = [`⚠️ Schema drift: ${endpoint.name} (${endpoint.method} ${endpoint.url})`];
  diff.added.forEach(e => lines.push(`  + ${e.path} (${e.type})`));
  diff.removed.forEach(e => lines.push(`  - ${e.path} (${e.type})`));
  diff.changed.forEach(e => lines.push(`  ~ ${e.path}: ${e.from} → ${e.to}`));
  return lines.join('\n');
}

function downText(endpoint: EndpointConfig, reason: string): string {
  return `🔴 Endpoint down: ${endpoint.name} (${endpoint.method} ${endpoint.url})\n💥 ${reason}`;
}

async function dispatchDrift(config: Config, result: CheckResult): Promise<void> {
  const alerts = config.alerts;
  if (!alerts) return;
  const text = driftText(result);

  if (alerts.telegram && isBotReady()) {
    await sendDriftAlert(alerts.telegram.chat_id, result);
  }
  if (alerts.slack?.webhook_url) {
    await postWebhook(alerts.slack.webhook_url, { text }).catch(err =>
      console.error('[driftwatch] Slack alert failed:', (err as Error).message)
    );
  }
  if (alerts.discord?.webhook_url) {
    await postWebhook(alerts.discord.webhook_url, { content: text }).catch(err =>
      console.error('[driftwatch] Discord alert failed:', (err as Error).message)
    );
  }
}

async function dispatchDown(config: Config, endpoint: EndpointConfig, reason: string): Promise<void> {
  const alerts = config.alerts;
  if (!alerts) return;
  const text = downText(endpoint, reason);

  if (alerts.telegram && isBotReady()) {
    await sendDownAlert(alerts.telegram.chat_id, endpoint, reason);
  }
  if (alerts.slack?.webhook_url) {
    await postWebhook(alerts.slack.webhook_url, { text }).catch(err =>
      console.error('[driftwatch] Slack alert failed:', (err as Error).message)
    );
  }
  if (alerts.discord?.webhook_url) {
    await postWebhook(alerts.discord.webhook_url, { content: text }).catch(err =>
      console.error('[driftwatch] Discord alert failed:', (err as Error).message)
    );
  }
}

export function hasAlerts(config: Config): boolean {
  return !!(config.alerts?.telegram || config.alerts?.slack || config.alerts?.discord);
}

export async function notifyDrift(config: Config, result: CheckResult, lastAlertAt?: string): Promise<boolean> {
  if (config.alert_cooldown && !cooldownExpired(lastAlertAt, config.alert_cooldown)) return false;
  await dispatchDrift(config, result);
  return true;
}

export async function notifyDown(config: Config, endpoint: EndpointConfig, reason: string, lastAlertAt?: string): Promise<boolean> {
  if (config.alert_cooldown && !cooldownExpired(lastAlertAt, config.alert_cooldown)) return false;
  await dispatchDown(config, endpoint, reason);
  return true;
}
