#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import updateNotifier from 'update-notifier';
import { input, select, confirm, password } from '@inquirer/prompts';
import { loadConfig } from './config.js';
import { initBot } from './telegram.js';
import { startScheduler } from './scheduler.js';
import { startDaemon, stopDaemon, isDaemonRunning } from './daemon.js';
import { readStatusData } from './status.js';
import { notifyDrift, notifyDown, hasAlerts } from './notifier.js';
import { appendHistory } from './history.js';
import { deleteSnapshot } from './snapshot.js';
import { startWebUI } from './webui.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { name: string; version: string };
updateNotifier({ pkg }).notify();
import { checkEndpoint } from './checker.js';

const INTERVAL_CHOICES = [
  { name: 'Every minute',      value: '* * * * *' },
  { name: 'Every 5 minutes',   value: '*/5 * * * *' },
  { name: 'Every 15 minutes',  value: '*/15 * * * *' },
  { name: 'Every hour',        value: '0 * * * *' },
  { name: 'Every day at 9am',  value: '0 9 * * *' },
  { name: 'Custom cron...',    value: 'custom' },
];

const METHOD_CHOICES = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function appendEnvVars(envPath: string, vars: Record<string, string>): void {
  let existing = '';
  if (fs.existsSync(envPath)) {
    existing = fs.readFileSync(envPath, 'utf8');
  }

  const toAdd: string[] = [];
  for (const [key, value] of Object.entries(vars)) {
    if (!existing.includes(`${key}=`)) {
      toAdd.push(`${key}=${value}`);
    }
  }

  if (toAdd.length === 0) return;

  const block = (existing.endsWith('\n') ? '' : '\n') +
    '# driftwatch\n' +
    toAdd.join('\n') + '\n';

  fs.appendFileSync(envPath, block);
}

function writeEnvExample(examplePath: string, vars: Record<string, string>): void {
  let existing = '';
  if (fs.existsSync(examplePath)) {
    existing = fs.readFileSync(examplePath, 'utf8');
  }

  const toAdd: string[] = [];
  for (const [key, placeholder] of Object.entries(vars)) {
    if (!existing.includes(`${key}=`)) {
      toAdd.push(`${key}=${placeholder}`);
    }
  }

  if (toAdd.length === 0) return;

  const block = (existing.endsWith('\n') || existing === '' ? '' : '\n') +
    '# driftwatch\n' +
    toAdd.join('\n') + '\n';

  fs.appendFileSync(examplePath, block);
}

const program = new Command();

program
  .name('driftwatch')
  .description('External API schema drift detector with Telegram alerts')
  .version(pkg.version);

program
  .command('init')
  .description('Interactive setup: generates driftwatch.config.yml and updates .env')
  .action(async () => {
    const configDest = path.resolve(process.cwd(), 'driftwatch.config.yml');

    if (fs.existsSync(configDest)) {
      const overwrite = await confirm({ message: 'driftwatch.config.yml already exists. Overwrite?', default: false });
      if (!overwrite) {
        console.log('Aborted.');
        process.exit(0);
      }
    }

    console.log('\n── Endpoint setup ──────────────────────────\n');

    const endpoints: string[] = [];
    const envVars: Record<string, string> = {};
    const authVarNames: Set<string> = new Set();

    let addMore = true;
    while (addMore) {
      const name = await input({ message: 'Endpoint name:', validate: v => v.trim() !== '' || 'Required' });
      const url = await input({ message: 'URL:', validate: v => v.startsWith('http') || 'Must start with http' });
      const method = await select({ message: 'HTTP method:', choices: METHOD_CHOICES.map(m => ({ value: m })) });

      const needsAuth = await confirm({ message: 'Requires auth header (Bearer token)?', default: false });
      let authLine = '';
      if (needsAuth) {
        const tokenValue = await password({ message: 'Bearer token value (will be saved to .env as API_TOKEN):' });
        authVarNames.add('API_TOKEN');
        authLine = `      Authorization: 'Bearer \${API_TOKEN}'`;
        envVars['API_TOKEN'] = tokenValue;
      }

      let intervalValue = await select({ message: 'Check interval:', choices: INTERVAL_CHOICES });
      if (intervalValue === 'custom') {
        intervalValue = await input({ message: 'Cron expression:', validate: v => v.trim() !== '' || 'Required' });
      }

      const lines = [
        `  - name: '${name}'`,
        `    url: '${url}'`,
        `    method: ${method}`,
      ];
      if (needsAuth) {
        lines.push(`    headers:`);
        lines.push(`${authLine}`);
        lines.push(`      Accept: 'application/json'`);
      }
      lines.push(`    interval: '${intervalValue}'`);
      endpoints.push(lines.join('\n'));

      addMore = await confirm({ message: 'Add another endpoint?', default: false });
    }

    console.log('\n── Alert channel (optional) ─────────────────\n');

    const alertChannel = await select({
      message: 'Set up alerts?',
      choices: [
        { name: 'Skip for now',  value: 'none' },
        { name: 'Telegram',      value: 'telegram' },
        { name: 'Slack',         value: 'slack' },
        { name: 'Discord',       value: 'discord' },
      ],
    });

    let alertsSection = '';

    if (alertChannel === 'telegram') {
      const token = await password({ message: 'Bot token:' });
      const chatId = await input({ message: 'Chat ID:', validate: v => v.trim() !== '' || 'Required' });
      alertsSection = `alerts:\n  telegram:\n    bot_token: '\${TELEGRAM_TOKEN}'\n    chat_id: '\${CHAT_ID}'\n\n`;
      envVars['TELEGRAM_TOKEN'] = token;
      envVars['CHAT_ID'] = chatId;
    } else if (alertChannel === 'slack') {
      const webhookUrl = await input({ message: 'Slack webhook URL:', validate: v => v.startsWith('https://') || 'Must start with https://' });
      alertsSection = `alerts:\n  slack:\n    webhook_url: '\${SLACK_WEBHOOK}'\n\n`;
      envVars['SLACK_WEBHOOK'] = webhookUrl;
    } else if (alertChannel === 'discord') {
      const webhookUrl = await input({ message: 'Discord webhook URL:', validate: v => v.startsWith('https://') || 'Must start with https://' });
      alertsSection = `alerts:\n  discord:\n    webhook_url: '\${DISCORD_WEBHOOK}'\n\n`;
      envVars['DISCORD_WEBHOOK'] = webhookUrl;
    } else {
      alertsSection = `# alerts: (optional — add telegram, slack, or discord to enable)\n#   telegram:\n#     bot_token: '\${TELEGRAM_TOKEN}'\n#     chat_id: '\${CHAT_ID}'\n\n`;
      console.log('  Skipped. Add an alerts block to driftwatch.config.yml later.\n');
    }

    const configContent = alertsSection + 'endpoints:\n' + endpoints.join('\n\n') + '\n';
    fs.writeFileSync(configDest, configContent);
    console.log('\n✓ Created driftwatch.config.yml');

    const envPath = path.resolve(process.cwd(), '.env');
    const envExamplePath = path.resolve(process.cwd(), '.env.example');

    if (Object.keys(envVars).length > 0) {
      const actualVars: Record<string, string> = {};
      const exampleVars: Record<string, string> = {};
      for (const [key, val] of Object.entries(envVars)) {
        actualVars[key] = val;
        exampleVars[key] = authVarNames.has(key) ? 'your-api-token-here' : `your-${key.toLowerCase().replace(/_/g, '-')}-here`;
      }
      appendEnvVars(envPath, actualVars);
      writeEnvExample(envExamplePath, exampleVars);
      console.log(`✓ Updated .env`);
      console.log(`✓ Updated .env.example`);
    }

    console.log('\nRun "driftwatch check" to create your first snapshot.\n');
  });

program
  .command('start')
  .description('Start the scheduler daemon')
  .option('-c, --config <path>', 'Path to config file')
  .option('-d, --daemon', 'Run as background process')
  .action((opts) => {
    if (opts.daemon) {
      startDaemon(opts.config);
      return;
    }
    const config = loadConfig(opts.config);
    if (config.alerts?.telegram?.bot_token) initBot(config.alerts.telegram.bot_token);
    else console.log('[driftwatch] No Telegram configured — console-only mode.');
    console.log(`[driftwatch] Starting with ${config.endpoints.length} endpoint(s)...`);
    startScheduler(config);
  });

program
  .command('stop')
  .description('Stop the background daemon')
  .action(() => {
    stopDaemon();
  });

program
  .command('status')
  .description('Show daemon state and last check per endpoint')
  .action(() => {
    const { running, pid } = isDaemonRunning();
    console.log(`Daemon: ${running ? `running (PID ${pid})` : 'stopped'}`);

    const data = readStatusData();
    const entries = Object.entries(data.endpoints);
    if (entries.length === 0) {
      console.log('No endpoint checks recorded yet.');
      return;
    }

    console.log('');
    for (const [name, entry] of entries) {
      const icon = { ok: '✅', drift: '⚠️', down: '🔴', 'first-run': '🔵' }[entry.status] ?? '❓';
      const when = new Date(entry.lastCheck).toLocaleString();
      const extra = entry.reason ? ` (${entry.reason})` : '';
      console.log(`${icon} ${name} — ${entry.status}${extra} — ${when}`);
    }
  });

program
  .command('check')
  .description('One-shot check all endpoints (no schedule)')
  .option('-c, --config <path>', 'Path to config file')
  .option('-e, --endpoint <name>', 'Check only this endpoint by name')
  .action(async (opts) => {
    const config = loadConfig(opts.config);
    if (config.alerts?.telegram?.bot_token) initBot(config.alerts.telegram.bot_token);
    else if (!hasAlerts(config)) console.log('[driftwatch] No alerts configured — console-only mode.\n');

    const endpoints = opts.endpoint
      ? config.endpoints.filter(e => e.name === opts.endpoint)
      : config.endpoints;

    if (opts.endpoint && endpoints.length === 0) {
      console.error(`Endpoint "${opts.endpoint}" not found in config.`);
      process.exit(1);
    }

    console.log(`[driftwatch] Checking ${endpoints.length} endpoint(s)...\n`);

    for (const endpoint of endpoints) {
      console.log(`Checking: ${endpoint.name}`);
      try {
        const result = await checkEndpoint(endpoint);
        if (result.isFirstRun) {
          console.log('  First run — snapshot saved, no alert.');
        } else if (result.isDown) {
          console.log(`  Endpoint down: ${result.downReason}`);
          await notifyDown(config, endpoint, result.downReason ?? 'Unknown error');
          if (hasAlerts(config)) console.log('  Alert sent.');
        } else if (result.hasDrift) {
          const { diff } = result;
          console.log('  Drift detected!');
          diff.added.forEach(e => console.log(`    + ${e.path} (${e.type})`));
          diff.removed.forEach(e => console.log(`    - ${e.path} (${e.type})`));
          diff.changed.forEach(e => console.log(`    ~ ${e.path}: ${e.from} → ${e.to}`));
          appendHistory(endpoint.name, endpoint.url, diff);
          await notifyDrift(config, result);
          if (hasAlerts(config)) console.log('  Alert sent.');
        } else {
          console.log('  No drift.');
        }
      } catch (err) {
        console.error(`  Error: ${(err as Error).message}`);
      }
      console.log('');
    }
  });

program
  .command('reset <name>')
  .description('Delete snapshot for an endpoint to force re-baseline on next check')
  .action((name: string) => {
    const deleted = deleteSnapshot(name);
    if (deleted) {
      console.log(`✓ Snapshot deleted for "${name}". Next check will create a new baseline.`);
    } else {
      console.log(`No snapshot found for "${name}".`);
    }
  });

program
  .command('ui')
  .description('Start local web dashboard')
  .option('-p, --port <number>', 'Port to listen on', '4573')
  .action((opts) => {
    startWebUI(parseInt(opts.port, 10));
  });

program.parse();
