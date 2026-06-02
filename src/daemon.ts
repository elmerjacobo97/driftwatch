import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const DRIFTWATCH_DIR = path.resolve(process.cwd(), '.driftwatch');
const PID_FILE = path.join(DRIFTWATCH_DIR, 'driftwatch.pid');
const LOG_FILE = path.join(DRIFTWATCH_DIR, 'driftwatch.log');

export function startDaemon(configPath?: string): void {
  const args = ['start'];
  if (configPath) args.push('-c', configPath);

  // Kill existing daemon before spawning to prevent accumulation
  if (fs.existsSync(PID_FILE)) {
    const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    try {
      process.kill(oldPid, 'SIGTERM');
      console.log(`[driftwatch] Stopped existing daemon (PID ${oldPid}).`);
    } catch {
      // Process already gone
    }
    fs.unlinkSync(PID_FILE);
  }

  fs.mkdirSync(DRIFTWATCH_DIR, { recursive: true });
  const out = fs.openSync(LOG_FILE, 'a');

  const child = spawn(process.execPath, [process.argv[1], ...args], {
    detached: true,
    stdio: ['ignore', out, out],
  });

  fs.writeFileSync(PID_FILE, String(child.pid));
  child.unref();

  console.log(`[driftwatch] Daemon started (PID ${child.pid})`);
  console.log(`[driftwatch] Logs: ${LOG_FILE}`);
}

export function stopDaemon(): void {
  if (!fs.existsSync(PID_FILE)) {
    console.log('[driftwatch] No daemon running (no PID file found).');
    return;
  }
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
  try {
    process.kill(pid, 'SIGTERM');
    fs.unlinkSync(PID_FILE);
    console.log(`[driftwatch] Daemon stopped (PID ${pid}).`);
  } catch {
    console.log(`[driftwatch] Process ${pid} not found — cleaning up PID file.`);
    fs.unlinkSync(PID_FILE);
  }
}

export function isDaemonRunning(): { running: boolean; pid?: number } {
  if (!fs.existsSync(PID_FILE)) return { running: false };
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
  try {
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    return { running: false, pid };
  }
}
