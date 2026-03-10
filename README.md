# ASOIAF Actions

Minimal deployment repo for the ASOIAF GPT Actions backend.

## What This Repo Contains

- `tools/gpt-actions-api/` for the HTTP API
- `content/canon/` for local canon lookup data
- `openapi.yaml` for ChatGPT Actions configuration
- `render.yaml` for Render deployment

## Endpoints

- `GET /health`
- `POST /campaigns`
- `GET /campaigns/{campaignId}/scene-packet`
- `POST /campaigns/{campaignId}/checkpoints`
- `POST /canon/lookup`

## Environment Variables

- `HOST=0.0.0.0`
- `CANON_ROOT=content/canon`
- `DATA_DIR=/opt/render/project/src/.local/gpt-actions-api-data`

## Local Run

```bash
npm install
npm run actions:server
```

## Render Notes

This backend stores campaign state on disk. For durable saves on Render, use a persistent disk mounted at the same path used by `DATA_DIR`.
