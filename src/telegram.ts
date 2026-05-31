import TelegramBot from 'node-telegram-bot-api';
import type { CheckResult } from './checker.js';

let bot: TelegramBot | null = null;

export function initBot(token: string): void {
  bot = new TelegramBot(token);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDiff(result: CheckResult): string {
  const { endpoint, diff } = result;
  const lines: string[] = [
    '⚠️ <b>Schema drift detected!</b>',
    '',
    `📌 ${escapeHtml(endpoint.name)}`,
    `🔗 ${escapeHtml(endpoint.method)} ${escapeHtml(endpoint.url)}`,
    '',
  ];

  for (const entry of diff.added) {
    lines.push(`➕ Added:   ${escapeHtml(entry.path)} (${escapeHtml(entry.type)})`);
  }
  for (const entry of diff.removed) {
    lines.push(`➖ Removed: ${escapeHtml(entry.path)} (${escapeHtml(entry.type)})`);
  }
  for (const entry of diff.changed) {
    lines.push(`🔄 Changed: ${escapeHtml(entry.path)}  ${escapeHtml(entry.from)} → ${escapeHtml(entry.to)}`);
  }

  return lines.join('\n');
}

export async function sendDriftAlert(chatId: string, result: CheckResult): Promise<void> {
  if (!bot) throw new Error('Telegram bot not initialized');
  const message = formatDiff(result);
  await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
}
