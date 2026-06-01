import cron from 'node-cron';
import { checkEndpoint } from './checker.js';
import { notifyDrift, notifyDown } from './notifier.js';
import { writeEndpointStatus, setLastAlertAt, getLastAlertAt } from './status.js';
import { appendHistory } from './history.js';
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
          const sent = await notifyDown(config, endpoint, result.downReason ?? 'Unknown error', getLastAlertAt(endpoint.name));
          if (sent) {
            setLastAlertAt(endpoint.name);
            console.log(`[driftwatch] ${endpoint.name}: alert sent.`);
          }
        } else if (result.hasDrift) {
          console.log(`[driftwatch] ${endpoint.name}: drift detected!`);
          writeEndpointStatus(endpoint.name, 'drift');
          appendHistory(endpoint.name, endpoint.url, result.diff);
          const sent = await notifyDrift(config, result, getLastAlertAt(endpoint.name));
          if (sent) {
            setLastAlertAt(endpoint.name);
            console.log(`[driftwatch] ${endpoint.name}: alert sent.`);
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
