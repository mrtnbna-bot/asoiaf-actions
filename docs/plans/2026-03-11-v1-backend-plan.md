# GPT Actions V1 Backend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the file-backed GPT Actions backend with a Postgres-backed v1 service that supports campaign management, scene packets, checkpoint persistence, canon caching, and continuity audits.

**Architecture:** The API stays as a small Node HTTP service, but persistence moves into Postgres through a dedicated store layer. Campaign metadata, checkpoints, scene state, canon cache, and audit data are stored in relational tables so a managed host can run the service durably and future scheduled jobs can operate on the same source of truth.

**Tech Stack:** Node.js, `pg`, `pg-mem`, native `node:test`, OpenAPI, managed Postgres

---

### Task 1: Add dependency and test scaffolding

**Files:**
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\package.json`
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\package-lock.json`
- Create: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\tools\gpt-actions-api\store.test.mjs`

**Step 1: Write the failing test**

Add tests that describe the v1 store behavior:
- create and list campaigns
- archive and clone a campaign
- save a checkpoint and return the latest scene packet
- produce a continuity audit
- cache canon lookups

**Step 2: Run test to verify it fails**

Run: `node --test tools/gpt-actions-api/store.test.mjs`
Expected: FAIL because the Postgres store and schema do not exist yet.

**Step 3: Write minimal implementation**

Add the database dependencies and enough scaffolding files for the new store layer to compile.

**Step 4: Run test to verify it still fails for the right reason**

Run: `node --test tools/gpt-actions-api/store.test.mjs`
Expected: FAIL in the missing store behavior, not a package resolution error.

### Task 2: Build the Postgres store and schema

**Files:**
- Create: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\tools\gpt-actions-api\db.mjs`
- Create: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\tools\gpt-actions-api\schema.mjs`
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\tools\gpt-actions-api\store.mjs`
- Test: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\tools\gpt-actions-api\store.test.mjs`

**Step 1: Write the failing test**

Extend tests to assert:
- `createCampaign` writes a campaign row
- `listCampaigns` returns active campaigns
- `archiveCampaign` marks status as archived
- `cloneCampaign` copies campaign metadata and latest checkpoint
- `saveCheckpoint` updates the latest scene packet
- `getContinuityAudit` flags missing time/place or contradictions

**Step 2: Run test to verify it fails**

Run: `node --test tools/gpt-actions-api/store.test.mjs`
Expected: FAIL because the store methods do not exist or return the wrong shape.

**Step 3: Write minimal implementation**

Implement:
- schema bootstrap on startup
- a `PostgresCampaignStore`
- JSONB-backed scene/player/NPC/open-thread payloads
- canon cache storage
- continuity audit logic

**Step 4: Run test to verify it passes**

Run: `node --test tools/gpt-actions-api/store.test.mjs`
Expected: PASS

### Task 3: Expand the HTTP API to expose v1 endpoints

**Files:**
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\tools\gpt-actions-api\server.mjs`
- Create: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\tools\gpt-actions-api\server.test.mjs`
- Test: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\tools\gpt-actions-api\store.test.mjs`

**Step 1: Write the failing test**

Add endpoint tests for:
- `GET /campaigns`
- `GET /campaigns/:id`
- `POST /campaigns/:id/archive`
- `POST /campaigns/:id/clone`
- `GET /campaigns/:id/continuity-audit`
- existing scene packet and checkpoint routes

**Step 2: Run test to verify it fails**

Run: `node --test tools/gpt-actions-api/server.test.mjs`
Expected: FAIL because the routes are missing.

**Step 3: Write minimal implementation**

Add the routes and keep response shapes compact for GPT Actions.

**Step 4: Run test to verify it passes**

Run: `node --test tools/gpt-actions-api/server.test.mjs`
Expected: PASS

### Task 4: Add canon cache behavior and deployment docs

**Files:**
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\tools\gpt-actions-api\canon.mjs`
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\openapi.yaml`
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\README.md`
- Create: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\northflank.env.example`

**Step 1: Write the failing test**

Add tests that verify repeat canon lookups can be served from cache metadata.

**Step 2: Run test to verify it fails**

Run: `node --test tools/gpt-actions-api/store.test.mjs`
Expected: FAIL because cache rows are not written or surfaced.

**Step 3: Write minimal implementation**

Store canon lookup results in Postgres, expose cache metadata, and document host env vars and deployment steps.

**Step 4: Run test to verify it passes**

Run:
- `node --test tools/gpt-actions-api/store.test.mjs`
- `node --test tools/gpt-actions-api/server.test.mjs`
Expected: PASS

### Task 5: Full verification and release

**Files:**
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\README.md`
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\package-lock.json`

**Step 1: Run the full verification suite**

Run:
- `npm install`
- `node --test tools/gpt-actions-api/store.test.mjs`
- `node --test tools/gpt-actions-api/server.test.mjs`
- `npm start` and check `/health`

Expected:
- tests pass
- server starts cleanly
- `/health` returns `{"status":"ok"}`

**Step 2: Commit**

```bash
git add .
git commit -m "feat: add postgres-backed v1 actions backend"
```
