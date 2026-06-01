import cron from 'node-cron';
import { checkEndpoint } from './checker.js';
import { sendDriftAlert, sendDownAlert, isBotReady } from './telegram.js';
import { writeEndpointStatus } from './status.js';
import type { Config } from './types.js';

export function startScheduler(config: Config): void {
  const tasks: ReturnType<typeof cron.schedule>[] = [];

  const shutdown = () => {
    console.log('\n[driftwatch] Shutting down...');
    tasks.forEach(t => t.stop());
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  for (const endpoint of config.endpoints) {
    if (!cron.validate(endpoint.interval)) {
      console.error(`[driftwatch] Invalid cron expression for "${endpoint.name}": ${endpoint.interval}`);
      continue;
    }

    const task = cron.schedule(endpoint.interval, async () => {
      console.log(`[driftwatch] Checking ${endpoint.name}...`);
      try {
        const result = await checkEndpoint(endpoint);
        if (result.isFirstRun) {
          console.log(`[driftwatch] ${endpoint.name}: first run, snapshot saved.`);
          writeEndpointStatus(endpoint.name, 'first-run');
        } else if (result.isDown) {
          console.log(`[driftwatch] ${endpoint.name}: endpoint down — ${result.downReason}`);
          writeEndpointStatus(endpoint.name, 'down', result.downReason);
          if (isBotReady() && config.telegram?.chat_id) {
            await sendDownAlert(config.telegram.chat_id, endpoint, result.downReason ?? 'Unknown error');
            console.log(`[driftwatch] ${endpoint.name}: Telegram down alert sent.`);
          }
        } else if (result.hasDrift) {
          console.log(`[driftwatch] ${endpoint.name}: drift detected!`);
          writeEndpointStatus(endpoint.name, 'drift');
          if (isBotReady() && config.telegram?.chat_id) {
            await sendDriftAlert(config.telegram.chat_id, result);
            console.log(`[driftwatch] ${endpoint.name}: Telegram alert sent.`);
          }
        } else {
          console.log(`[driftwatch] ${endpoint.name}: no drift.`);
          writeEndpointStatus(endpoint.name, 'ok');
        }
      } catch (err) {
        console.error(`[driftwatch] Error checking "${endpoint.name}":`, (err as Error).message);
      }
    });
    tasks.push(task);

    console.log(`[driftwatch] Scheduled "${endpoint.name}" — ${endpoint.interval}`);
  }
}
