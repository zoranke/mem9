# Dashboard API

Lightweight Express API for the NAS dashboard.

## What it does

- Proxies dashboard requests to `mnemo-server`
- Adds audit logging in local SQLite
- Exposes memory stats for the dashboard
- Exposes audit export in CSV / JSON
- Applies request rate limiting: `100 requests / minute`

## Endpoints

- `GET /api/healthz`
- `GET /api/memories`
- `GET /api/memories/:id`
- `POST /api/memories`
- `PUT /api/memories/:id`
- `DELETE /api/memories/:id`
- `GET /api/memories/stats`
- `GET /api/session-messages`
- `GET /api/audit`
- `GET /api/audit/export?format=csv|json`

The same routes are also mounted under `/your-memory/api/...` so the existing Vite dashboard can keep using its current base path.

## Environment

Copy [.env.example](/Users/jacky/Documents/New%20project/mem9/dashboard/api/.env.example) and adjust:

- `PORT`: dashboard API port, default `3101`
- `MNEMO_BASE_URL`: internal URL for `mnemo-server`
- `MEM9_API_KEY`: single-tenant fallback API key
- `AUDIT_DB_PATH`: SQLite file path
- `BASIC_AUTH_USER` / `BASIC_AUTH_PASS`: optional Basic Auth

## Audit Schema

SQLite table:

- `audit_logs`

Indexes:

- `idx_audit_ts`
- `idx_audit_actor`
- `idx_audit_action`

## Run

```bash
npm install
cp .env.example .env
npm start
```

Requires Node.js 22+.
