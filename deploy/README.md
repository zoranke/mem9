# NAS Deployment

This folder contains a lightweight NAS-oriented deployment template for:

- `mnemo-server` on port `8888`
- internal `dashboard-api` on port `3101`
- `dashboard-web` on port `3100` via Nginx static hosting

## Layout

```text
deploy/
  docker-compose.nas.yml
  env/
    mnemo-server.env
    dashboard-api.env
  data/
    uploads/
    audit/
```

## Setup

1. Copy the env templates:

```bash
cp deploy/env/mnemo-server.env.example deploy/env/mnemo-server.env
cp deploy/env/dashboard-api.env.example deploy/env/dashboard-api.env
```

2. Edit:

- `deploy/env/mnemo-server.env`
- `deploy/env/dashboard-api.env`

3. Create local data directories if they do not exist:

```bash
mkdir -p deploy/data/uploads deploy/data/audit
```

4. Start:

```bash
docker compose -f deploy/docker-compose.nas.yml up -d
```

## Access

- `mnemo-server`: `http://NAS_IP:8888`
- `dashboard-web`: `http://NAS_IP:3100/your-memory/`
- `dashboard-api`: internal only inside Docker network

## Recommended Verification Order

1. Open `http://NAS_IP:8888/healthz`
2. Open `http://NAS_IP:3100/`
3. Confirm it redirects to `/your-memory/`
4. Log into the dashboard and verify:
   - memory list
   - search
   - stats cards
   - audit export

## Notes

- This template intentionally does not use custom domain or `80/443`.
- `dashboard-web` is built once and served by Nginx on port `3100`.
- Nginx proxies `/your-memory/api/*` to `dashboard-api`, so the browser only needs the `3100` entrypoint.
- `dashboard-api` stores audit logs in local SQLite under `deploy/data/audit/`.
