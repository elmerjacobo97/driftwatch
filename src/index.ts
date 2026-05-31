#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import updateNotifier from 'update-notifier';
import { input, select, confirm, password } from '@inquirer/prompts';
import { loadConfig } from './config.js';
import { initBot, sendDriftAlert, isBotReady } from './telegram.js';
import { startScheduler } from './scheduler.js';

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
        const varName = await input({ message: 'Env var name for token:', default: 'API_TOKEN' });
        const tokenValue = await password({ message: `Value for ${varName} (paste your token):` });
        authVarNames.add(varName);
        authLine = `      Authorization: 'Bearer \${${varName}}'`;
        envVars[varName] = tokenValue;
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

    console.log('\n── Telegram alerts (optional) ──────────────\n');

    const setupTelegram = await confirm({ message: 'Set up Telegram alerts now?', default: false });
    let telegramSection = '';

    if (setupTelegram) {
      const token = await password({ message: 'Bot token:' });
      const chatId = await input({ message: 'Chat ID:', validate: v => v.trim() !== '' || 'Required' });
      telegramSection = `telegram:\n  bot_token: '\${TELEGRAM_TOKEN}'\n  chat_id: '\${CHAT_ID}'\n\n`;
      envVars['TELEGRAM_TOKEN'] = token;
      envVars['CHAT_ID'] = chatId;
    } else {
      telegramSection = `# telegram: (optional — add bot_token and chat_id to enable alerts)\n#   bot_token: '\${TELEGRAM_TOKEN}'\n#   chat_id: '\${CHAT_ID}'\n\n`;
      console.log('  Skipped. Add TELEGRAM_TOKEN and CHAT_ID to .env later to enable alerts.\n');
    }

    const configContent = telegramSection + 'endpoints:\n' + endpoints.join('\n\n') + '\n';
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
  .action((opts) => {
    const config = loadConfig(opts.config);
    if (config.telegram?.bot_token) initBot(config.telegram.bot_token);
    else console.log('[driftwatch] No Telegram configured — console-only mode.');
    console.log(`[driftwatch] Starting with ${config.endpoints.length} endpoint(s)...`);
    startScheduler(config);
  });

program
  .command('check')
  .description('One-shot check all endpoints (no schedule)')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (opts) => {
    const config = loadConfig(opts.config);
    if (config.telegram?.bot_token) initBot(config.telegram.bot_token);
    else console.log('[driftwatch] No Telegram configured — console-only mode.\n');

    console.log(`[driftwatch] Checking ${config.endpoints.length} endpoint(s)...\n`);

    for (const endpoint of config.endpoints) {
      console.log(`Checking: ${endpoint.name}`);
      try {
        const result = await checkEndpoint(endpoint);
        if (result.isFirstRun) {
          console.log('  First run — snapshot saved, no alert.');
        } else if (result.hasDrift) {
          const { diff } = result;
          console.log('  Drift detected!');
          diff.added.forEach(e => console.log(`    + ${e.path} (${e.type})`));
          diff.removed.forEach(e => console.log(`    - ${e.path} (${e.type})`));
          diff.changed.forEach(e => console.log(`    ~ ${e.path}: ${e.from} → ${e.to}`));
          if (isBotReady() && config.telegram?.chat_id) {
            await sendDriftAlert(config.telegram.chat_id, result);
            console.log('  Telegram alert sent.');
          }
        } else {
          console.log('  No drift.');
        }
      } catch (err) {
        console.error(`  Error: ${(err as Error).message}`);
      }
      console.log('');
    }
  });

program.parse();
