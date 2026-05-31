# DriftWatch

External API schema drift detector with Telegram alerts. No SDK to install in your apps — runs as a standalone daemon or Docker container, pointing at any HTTP endpoint you want to monitor.

[![npm version](https://img.shields.io/npm/v/@codigoconelmer/driftwatch)](https://www.npmjs.com/package/@codigoconelmer/driftwatch)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PayPal](https://img.shields.io/badge/Donate-PayPal-blue)](https://www.paypal.me/elmerjacobo97)

---

## What it does

DriftWatch periodically hits your API endpoints and extracts their response **schema** — keys and types, not values. When the schema changes (keys added, removed, or type changed), it fires a Telegram alert instantly.

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
npm install -g driftwatch
# or
pnpm add -g driftwatch
```

---

## Quick start

**1. Initialize config in your project**

```bash
cd my-project/
driftwatch init
```

**2. Set up Telegram** (one-time, ~5 min)

- Open Telegram → search `@BotFather` → send `/newbot` → copy the token
- Send any message to your new bot
- Open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser
- Copy the `chat.id` value from the JSON response

**3. Configure environment**

```bash
cp .env.example .env
```

```env
TELEGRAM_TOKEN=your-bot-token-here
CHAT_ID=your-chat-id-here
API_TOKEN=your-api-token-here   # optional, only if your API requires auth
```

**4. Edit `driftwatch.config.yml`** with your endpoints

**5. First run** — creates snapshots, no alerts sent

```bash
driftwatch check
```

**6. Start the daemon**

```bash
driftwatch start
```

---

## Config reference

```yaml
telegram:
  bot_token: '${TELEGRAM_TOKEN}'
  chat_id: '${CHAT_ID}'

endpoints:
  - name: 'Cards'
    url: 'https://api.myapp.com/api/cards?company_id=123'
    method: GET
    headers:
      Authorization: 'Bearer ${API_TOKEN}'
      Accept: 'application/json'
    interval: '*/5 * * * *'

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

| Field | Required | Description |
|---|---|---|
| `name` | yes | Display name used in alerts and snapshot filenames |
| `url` | yes | Full URL including query params |
| `method` | no | HTTP method, defaults to `GET` |
| `headers` | no | Key/value headers sent with every request |
| `body` | no | JSON body for POST/PUT/PATCH requests |
| `interval` | yes | Cron expression (e.g. `*/5 * * * *` = every 5 min) |

`${VAR}` values are resolved from `.env` or environment variables.

---

## CLI

```bash
driftwatch init                        # generate driftwatch.config.yml
driftwatch start                       # start the daemon (cron-based)
driftwatch start -c /path/to/cfg.yml   # custom config path
driftwatch check                       # one-shot check all endpoints now
driftwatch check -c /path/to/cfg.yml   # custom config path
```

---

## How it works

1. **First run per endpoint** — saves the response schema to `.driftwatch/snapshots/<name>.json`. No alert sent.
2. **Subsequent runs** — compares live schema against the snapshot.
   - No change → logs "no drift", no alert.
   - Change detected → sends Telegram alert, updates snapshot as new baseline.
3. **Schema** is a recursive key+type map. Values are ignored. Arrays are sampled from the first element — nested object structure is preserved.

---

## Docker (self-host on VPS)

```bash
cp .env.example .env
# fill in your tokens

docker compose up -d
```

Snapshots persist in a named Docker volume (`driftwatch-snapshots`) so they survive container restarts.

To view logs:
```bash
docker compose logs -f
```

---

## Snapshots

Snapshots are stored in `.driftwatch/snapshots/` as JSON files named after each endpoint. They are **gitignored by default** — each environment (local, staging, prod) should build its own baseline on first run.

Example snapshot:
```json
{
  "endpoint": "Cards",
  "url": "https://api.myapp.com/api/cards",
  "capturedAt": "2026-01-15T10:30:00.000Z",
  "schema": {
    "status": "boolean",
    "data": {
      "[]": {
        "id": "string",
        "name": "string",
        "email": "string"
      }
    }
  }
}
```

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
