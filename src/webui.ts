import http from 'http';
import { readStatusData } from './status.js';
import { readHistory } from './history.js';

const PORT = 4573;

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DriftWatch</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', monospace; background: #0d1117; color: #e6edf3; padding: 2rem; }
    h1 { color: #58a6ff; font-size: 1.5rem; margin-bottom: 0.25rem; }
    .subtitle { color: #8b949e; font-size: 0.85rem; margin-bottom: 2rem; }
    h2 { font-size: 1rem; color: #8b949e; text-transform: uppercase; letter-spacing: 0.1em; margin: 2rem 0 1rem; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; color: #8b949e; font-size: 0.8rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid #30363d; }
    td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #161b22; font-size: 0.9rem; }
    tr:hover td { background: #161b22; }
    .ok    { color: #3fb950; }
    .drift { color: #d29922; }
    .down  { color: #f85149; }
    .first-run { color: #58a6ff; }
    .history-card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 1rem; margin-bottom: 0.75rem; }
    .history-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem; }
    .history-name { font-weight: bold; color: #e6edf3; }
    .history-time { color: #8b949e; font-size: 0.8rem; }
    .diff-line { font-size: 0.85rem; padding: 0.15rem 0; }
    .added   { color: #3fb950; }
    .removed { color: #f85149; }
    .changed { color: #d29922; }
    .empty-state { color: #8b949e; font-style: italic; padding: 1rem 0; }
    .refresh { color: #8b949e; font-size: 0.75rem; }
  </style>
</head>
<body>
  <h1>🔍 DriftWatch</h1>
  <div class="subtitle">Refreshes every 30s &nbsp;·&nbsp; <span class="refresh" id="last-refresh">—</span></div>

  <h2>Endpoints</h2>
  <table>
    <thead><tr><th>Name</th><th>Status</th><th>Last Check</th><th>Reason</th></tr></thead>
    <tbody id="endpoints-body"></tbody>
  </table>

  <h2>Drift History</h2>
  <div id="history-list"></div>

  <script>
    const ICONS = { ok: '✅', drift: '⚠️', down: '🔴', 'first-run': '🔵' };

    async function load() {
      const [status, history] = await Promise.all([
        fetch('/api/status').then(r => r.json()),
        fetch('/api/history').then(r => r.json()),
      ]);

      const tbody = document.getElementById('endpoints-body');
      const entries = Object.entries(status.endpoints || {});
      tbody.innerHTML = entries.length === 0
        ? '<tr><td colspan="4" class="empty-state">No checks recorded yet.</td></tr>'
        : entries.map(([name, e]) => \`
            <tr>
              <td>\${name}</td>
              <td class="\${e.status}">\${ICONS[e.status] || '❓'} \${e.status}</td>
              <td>\${new Date(e.lastCheck).toLocaleString()}</td>
              <td>\${e.reason || '—'}</td>
            </tr>\`).join('');

      const historyEl = document.getElementById('history-list');
      if (!history.length) {
        historyEl.innerHTML = '<p class="empty-state">No drift detected yet.</p>';
      } else {
        historyEl.innerHTML = [...history].reverse().map(e => \`
          <div class="history-card">
            <div class="history-header">
              <span class="history-name">\${e.endpoint}</span>
              <span class="history-time">\${new Date(e.timestamp).toLocaleString()}</span>
            </div>
            \${e.diff.added.map(d => \`<div class="diff-line added">+ \${d.path} (\${d.type})</div>\`).join('')}
            \${e.diff.removed.map(d => \`<div class="diff-line removed">- \${d.path} (\${d.type})</div>\`).join('')}
            \${e.diff.changed.map(d => \`<div class="diff-line changed">~ \${d.path}: \${d.from} → \${d.to}</div>\`).join('')}
          </div>\`).join('');
      }

      document.getElementById('last-refresh').textContent = 'Last updated ' + new Date().toLocaleTimeString();
    }

    load();
    setInterval(load, 30000);
  </script>
</body>
</html>`;

export function startWebUI(port = PORT): void {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(readStatusData()));
    } else if (req.url === '/api/history') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(readHistory()));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML);
    }
  });

  server.listen(port, () => {
    console.log(`[driftwatch] Web UI → http://localhost:${port}`);
    console.log('[driftwatch] Ctrl+C to stop.');
  });
}
