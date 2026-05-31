#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { loadConfig } from './config.js';
import { initBot, sendDriftAlert } from './telegram.js';
import { startScheduler } from './scheduler.js';
import { checkEndpoint } from './checker.js';

const EXAMPLE_CONFIG = `telegram:
  bot_token: '\${TELEGRAM_TOKEN}'
  chat_id: '\${CHAT_ID}'

endpoints:
  - name: 'Users list'
    url: 'https://your-app.com/api/users'
    method: GET
    headers:
      Authorization: 'Bearer \${API_TOKEN}'
    interval: '*/5 * * * *'

  - name: 'Create order'
    url: 'https://your-app.com/api/orders'
    method: POST
    headers:
      Authorization: 'Bearer \${API_TOKEN}'
      Content-Type: 'application/json'
    body:
      product_id: 1
      quantity: 1
    interval: '0 * * * *'
`;

const program = new Command();

program
  .name('driftwatch')
  .description('External API schema drift detector with Telegram alerts')
  .version('1.0.0');

program
  .command('init')
  .description('Generate driftwatch.config.yml in the current directory')
  .action(() => {
    const dest = path.resolve(process.cwd(), 'driftwatch.config.yml');
    if (fs.existsSync(dest)) {
      console.log('driftwatch.config.yml already exists.');
      process.exit(1);
    }
    fs.writeFileSync(dest, EXAMPLE_CONFIG);
    console.log('Created driftwatch.config.yml — edit it and set your env vars in .env');
  });

program
  .command('start')
  .description('Start the scheduler daemon')
  .option('-c, --config <path>', 'Path to config file')
  .action((opts) => {
    const config = loadConfig(opts.config);
    initBot(config.telegram.bot_token);
    console.log(`[driftwatch] Starting with ${config.endpoints.length} endpoint(s)...`);
    startScheduler(config);
  });

program
  .command('check')
  .description('One-shot check all endpoints (no schedule)')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (opts) => {
    const config = loadConfig(opts.config);
    initBot(config.telegram.bot_token);
    console.log(`[driftwatch] Checking ${config.endpoints.length} endpoint(s)...`);

    for (const endpoint of config.endpoints) {
      console.log(`\nChecking: ${endpoint.name}`);
      try {
        const result = await checkEndpoint(endpoint);
        if (result.isFirstRun) {
          console.log('  First run — snapshot saved, no alert.');
        } else if (result.hasDrift) {
          const { diff } = result;
          console.log(`  Drift detected!`);
          diff.added.forEach(e => console.log(`    + ${e.path} (${e.type})`));
          diff.removed.forEach(e => console.log(`    - ${e.path} (${e.type})`));
          diff.changed.forEach(e => console.log(`    ~ ${e.path}: ${e.from} → ${e.to}`));
          await sendDriftAlert(config.telegram.chat_id, result);
          console.log('  Alert sent.');
        } else {
          console.log('  No drift.');
        }
      } catch (err) {
        console.error(`  Error: ${(err as Error).message}`);
      }
    }
  });

program.parse();
