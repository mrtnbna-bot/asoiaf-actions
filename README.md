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

`DATABASE_URL` is required. The service uses Postgres as the durable source of truth.

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

## Northflank Setup

Recommended Northflank shape:

1. Create one `Combined Project`.
2. Add one `PostgreSQL` add-on.
3. Add one `Service` from this GitHub repo.
4. Use:
   - build command: `npm install`
   - start command: `npm start`
   - port: `8000`
5. Add environment variables:
   - `HOST=0.0.0.0`
   - `CANON_ROOT=content/canon`
   - `PORT=8000`
6. Link the Postgres add-on to the service through a secret group or injected variables.
7. Expose the database connection string to the app as `DATABASE_URL`.
8. Configure an HTTP health check on `/health`.

## Northflank Best Practices

- Prefer a linked database secret group over manually copying credentials into the service.
- Expose the workload database URI as `DATABASE_URL` so the app can start without code changes.
- Use the public service URL for GPT Actions.
- Do not point GPT Actions at private internal service addresses.
- Avoid using the database administration connection string for the runtime workload when Northflank offers a workload-safe connection string through the add-on.

## GPT Actions Setup

1. Open your custom GPT.
2. Go to `Configure` -> `Actions`.
3. Paste in `openapi.yaml`.
4. Replace:

```yaml
servers:
  - url: https://your-public-service-url.example.com
```

with your real public Northflank service URL.

## Tests

```bash
npm test
```
