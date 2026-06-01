# DriftWatch

External API schema drift detector. Monitors HTTP endpoints and alerts you when the response shape changes — keys added, removed, or type changed. Runs as a standalone daemon or Docker container, no SDK to install in your apps.

[![npm version](https://img.shields.io/npm/v/@codigoconelmer/driftwatch)](https://www.npmjs.com/package/@codigoconelmer/driftwatch)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PayPal](https://img.shields.io/badge/Donate-PayPal-blue)](https://www.paypal.me/elmerjacobo97)

---

## What it does

DriftWatch periodically hits your API endpoints and extracts their response **schema** — keys and types, not values. When the schema changes, it fires an alert via Telegram, Slack, or Discord instantly.

```
⚠️ Schema drift detected!

📌 Cards
🔗 GET https://api.myapp.com/api/cards

➕ Added:   data.[].role (string)
➖ Removed: data.[].position_of (string)
🔄 Changed: data.[].id  number → string
```

---

## Install

```bash
npm install -g @codigoconelmer/driftwatch
# or
pnpm add -g @codigoconelmer/driftwatch
```

---

## Quick start

**1. Interactive setup**

```bash
cd my-project/
driftwatch init
```

**2. Create baseline snapshots** (first run, no alerts sent)

```bash
driftwatch check
```

**3. Start the daemon**

```bash
driftwatch start           # foreground
driftwatch start --daemon  # background
```

---

## Config reference

```yaml
# Alert channels (all optional — pick one or more)
alerts:
  telegram:
    bot_token: '${TELEGRAM_TOKEN}'
    chat_id: '${CHAT_ID}'
  slack:
    webhook_url: '${SLACK_WEBHOOK}'
  discord:
    webhook_url: '${DISCORD_WEBHOOK}'

# Global cooldown: minimum minutes between repeated alerts per endpoint
alert_cooldown: 30

endpoints:
  - name: 'Cards'
    url: 'https://api.myapp.com/api/cards?company_id=123'
    method: GET
    headers:
      Authorization: 'Bearer ${API_TOKEN}'
      Accept: 'application/json'
    interval: '*/5 * * * *'
    retries: 3          # retry on 5xx/timeout before alerting (default: 0)
    retry_delay: 10     # seconds between retries (default: 5)
    ignore_fields:      # field names to exclude from drift detection
      - updated_at
      - expires_at

  - name: 'Create order'
    url: 'https://api.myapp.com/api/orders'
    method: POST
    headers:
      Authorization: 'Bearer ${API_TOKEN}'
      Content-Type: 'application/json'
    body:
      product_id: 1
      quantity: 1
    interval: '0 * * * *'
```

`${VAR}` values are resolved from `.env` or environment variables.

> **Backwards compat:** The old top-level `telegram:` block still works — it's automatically normalized to `alerts.telegram` on load.

### Endpoint fields

| Field | Required | Description |
|---|---|---|
| `name` | yes | Display name used in alerts and snapshot filenames |
| `url` | yes | Full URL including query params |
| `method` | no | HTTP method, defaults to `GET` |
| `headers` | no | Key/value headers sent with every request |
| `body` | no | JSON body for POST/PUT/PATCH requests |
| `interval` | yes | Cron expression (e.g. `*/5 * * * *`) |
| `retries` | no | Retry attempts on 5xx/timeout before alerting (default: 0) |
| `retry_delay` | no | Seconds between retries (default: 5) |
| `ignore_fields` | no | Field names to skip in drift detection |

### Global fields

| Field | Description |
|---|---|
| `alert_cooldown` | Minutes between repeated alerts per endpoint. Accepts `30`, `"30m"`, or `"2h"` |
| `alerts.telegram` | Telegram bot token + chat ID |
| `alerts.slack` | Slack incoming webhook URL |
| `alerts.discord` | Discord webhook URL |

---

## CLI

```bash
driftwatch init                          # interactive setup wizard
driftwatch check                         # one-shot check all endpoints
driftwatch check -e "Cards"              # check a single endpoint by name
driftwatch check -c /path/to/cfg.yml    # use custom config path
driftwatch start                         # start cron daemon (foreground)
driftwatch start --daemon                # start as background process
driftwatch stop                          # stop the background daemon
driftwatch status                        # show daemon state + last check per endpoint
driftwatch reset "Cards"                 # delete snapshot to force re-baseline
driftwatch ui                            # open web dashboard at localhost:4573
driftwatch ui --port 8080               # custom port
```

---

## Alert channels

### Telegram

1. Open Telegram → search `@BotFather` → `/newbot` → copy the token
2. Send any message to your bot
3. Open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in browser
4. Copy the `chat.id` from the JSON response
5. Add to `.env`:

```env
TELEGRAM_TOKEN=your-bot-token
CHAT_ID=your-chat-id
```

### Slack

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create App → Incoming Webhooks → Activate → Add Webhook
2. Copy the webhook URL
3. Add to `.env`: `SLACK_WEBHOOK=https://hooks.slack.com/services/...`

### Discord

1. Server Settings → Integrations → Webhooks → New Webhook → Copy URL
2. Add to `.env`: `DISCORD_WEBHOOK=https://discord.com/api/webhooks/...`

Without any alert channel configured, drift is logged to console only.

---

## Daemon mode

```bash
driftwatch start --daemon   # forks to background, writes PID to .driftwatch/driftwatch.pid
                            # logs go to .driftwatch/driftwatch.log
driftwatch stop             # kills daemon by PID
driftwatch status           # shows running state + last result per endpoint
```

Example `status` output:

```
Daemon: running (PID 12345)

✅ Cards — ok — 6/1/2026, 10:30:00 AM
⚠️ Orders — drift — 6/1/2026, 09:15:00 AM
🔴 Login — down (503 Service Unavailable) — 6/1/2026, 10:29:00 AM
```

---

## Web UI

```bash
driftwatch ui
# → http://localhost:4573
```

Local dashboard showing endpoint status and full drift history. Refreshes automatically every 30 seconds. No external dependencies.

---

## How it works

1. **First run per endpoint** — saves the response schema to `.driftwatch/snapshots/<name>.json`. No alert sent.
2. **Subsequent runs** — compares live schema against the snapshot.
   - No change → no alert.
   - Change detected → alert sent (respecting cooldown), snapshot updated, event appended to `.driftwatch/history.json`.
   - 5xx or timeout → "endpoint down" alert sent after exhausting retries.
3. **Schema** is a recursive key+type map. Values are ignored. Arrays are sampled from the first element.
4. **Auth** — supports Bearer token and any custom headers. Cookie/session auth is not supported — use stateless tokens.

---

## Docker

```bash
cp .env.example .env
# fill in your tokens

docker compose up -d
docker compose logs -f
```

Snapshots persist in a named Docker volume (`driftwatch-snapshots`) and survive container restarts.

---

## Snapshots

Stored in `.driftwatch/snapshots/` as JSON files named after each endpoint (slugified). Gitignored by default — each environment builds its own baseline on first run.

Use `driftwatch reset "Endpoint Name"` to delete a snapshot and force re-baseline on the next check.

---

## Cron expression reference

| Expression | Meaning |
|---|---|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour |
| `0 9 * * *` | Every day at 9am |
| `0 9 * * 1` | Every Monday at 9am |

---

## License

MIT
