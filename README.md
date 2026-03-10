# ASOIAF Actions

Postgres-backed GPT Actions backend for a `human-player` ASOIAF campaign, where the GPT acts as DM, NPCs, and world simulator.

## What V1 Includes

- campaign manager:
  - create
  - list
  - get details
  - archive
  - clone
- scene packet loading
- checkpoint save/load through the latest scene packet
- continuity audit
- local canon lookup with Postgres cache

## Repo Layout

- `tools/gpt-actions-api/` HTTP API and persistence layer
- `content/canon/` local canon corpus used by `lookupCanon`
- `openapi.yaml` GPT Actions schema
- `docs/plans/` implementation notes

## Endpoints

- `GET /health`
- `GET /campaigns`
- `POST /campaigns`
- `GET /campaigns/{campaignId}`
- `POST /campaigns/{campaignId}/archive`
- `POST /campaigns/{campaignId}/clone`
- `GET /campaigns/{campaignId}/scene-packet`
- `POST /campaigns/{campaignId}/checkpoints`
- `GET /campaigns/{campaignId}/continuity-audit`
- `POST /canon/lookup`

## Required Environment Variables

- `DATABASE_URL`
- `HOST=0.0.0.0`
- `CANON_ROOT=content/canon`
- `PORT=8000`

`DATABASE_URL` is required. The service now uses Postgres as the durable source of truth.

## Local Run

```bash
npm install
set DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DBNAME
npm run actions:server
```

Health check:

```bash
curl http://127.0.0.1:3000/health
```

## Koyeb Setup

Recommended Koyeb shape:

1. Create one `PostgreSQL` database service.
2. Create one `Web Service` from this GitHub repo.
3. Set the start command to:

```bash
npm start
```

4. Set environment variables:
   - `DATABASE_URL` from the Koyeb Postgres service
   - `HOST=0.0.0.0`
   - `CANON_ROOT=content/canon`
   - `PORT=8000`
5. Set the health check path to `/health`.
6. After deploy, replace the placeholder server URL in `openapi.yaml` with your Koyeb app URL.

## GPT Actions Setup

1. Open your custom GPT.
2. Go to `Configure` -> `Actions`.
3. Paste in `openapi.yaml`.
4. Replace:

```yaml
servers:
  - url: https://your-koyeb-service.koyeb.app
```

with your real Koyeb URL.

## Tests

```bash
npm test
```
