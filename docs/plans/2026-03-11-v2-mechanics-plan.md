# GPT Actions V2 Mechanics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first mechanics layer beyond v1 persistence by introducing NPC state, relationship tracking, campaign events, time advancement, and a basic world tick.

**Architecture:** Keep the API as a small Node HTTP service and expand the Postgres schema with structured JSONB-backed tables for NPCs, relationships, events, and timeline state. The GPT continues to narrate scenes, while the backend stores durable mechanics and exposes them through new Actions-friendly endpoints.

**Tech Stack:** Node.js, `pg`, `pg-mem`, native `node:test`, OpenAPI, managed Postgres, Northflank-hosted service/jobs

---

### Task 1: Add failing store tests for v2 mechanics

**Files:**
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\tools\gpt-actions-api\store.test.mjs`

**Step 1: Write the failing test**

Add tests for:
- upserting and loading NPC state
- storing and reading relationship webs
- logging events and reading recent events
- advancing time
- running a world tick that applies due followups

**Step 2: Run test to verify it fails**

Run: `node --test tools/gpt-actions-api/store.test.mjs`
Expected: FAIL because the new store methods and schema do not exist yet.

**Step 3: Write minimal implementation**

Add only enough schema and store behavior to make the tests meaningful.

**Step 4: Run test to verify it fails for the right reason**

Run: `node --test tools/gpt-actions-api/store.test.mjs`
Expected: FAIL in missing mechanics behavior, not in unrelated setup.

### Task 2: Expand the Postgres schema and store

**Files:**
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\tools\gpt-actions-api\schema.mjs`
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\tools\gpt-actions-api\store.mjs`
- Test: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\tools\gpt-actions-api\store.test.mjs`

**Step 1: Write the failing test**

Extend the tests to assert:
- timeline rows are created for new campaigns
- NPC records persist JSON state
- relationship rows can be upserted and read by focus key
- campaign events preserve effects and followups
- world tick marks due followups applied

**Step 2: Run test to verify it fails**

Run: `node --test tools/gpt-actions-api/store.test.mjs`
Expected: FAIL because the schema and logic are still v1-only.

**Step 3: Write minimal implementation**

Implement:
- `campaign_timeline`
- `npcs`
- `npc_relationships`
- `campaign_events`
- store methods for NPCs, relationships, events, time advancement, and world tick

**Step 4: Run test to verify it passes**

Run: `node --test tools/gpt-actions-api/store.test.mjs`
Expected: PASS

### Task 3: Add v2 HTTP routes and endpoint tests

**Files:**
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\tools\gpt-actions-api\server.mjs`
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\tools\gpt-actions-api\server.test.mjs`

**Step 1: Write the failing test**

Add endpoint tests for:
- `GET /campaigns/{campaignId}/npcs`
- `GET /campaigns/{campaignId}/npcs/{npcId}`
- `PUT /campaigns/{campaignId}/npcs/{npcId}`
- `GET /campaigns/{campaignId}/relationships`
- `POST /campaigns/{campaignId}/events`
- `GET /campaigns/{campaignId}/events`
- `POST /campaigns/{campaignId}/advance-time`
- `POST /campaigns/{campaignId}/world-tick`

**Step 2: Run test to verify it fails**

Run: `node --test tools/gpt-actions-api/server.test.mjs`
Expected: FAIL because the routes are missing.

**Step 3: Write minimal implementation**

Add the routes with compact GPT-friendly response shapes.

**Step 4: Run test to verify it passes**

Run: `node --test tools/gpt-actions-api/server.test.mjs`
Expected: PASS

### Task 4: Update OpenAPI schema and Northflank docs

**Files:**
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\openapi.yaml`
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\README.md`
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\northflank.env.example`

**Step 1: Write the failing test**

No code test here; use schema review plus existing API tests as regression cover.

**Step 2: Write minimal implementation**

Document:
- new NPC, event, time, and world-tick actions
- Northflank job guidance for future scheduled ticks

**Step 3: Run verification**

Run:
- `node --test tools/gpt-actions-api/store.test.mjs`
- `node --test tools/gpt-actions-api/server.test.mjs`

Expected: PASS

### Task 5: Full verification and release

**Files:**
- Modify: `C:\Users\Martin\Desktop\asoiaf-actions-runtime\package-lock.json`

**Step 1: Run the full verification suite**

Run:
- `npm test`
- start a local smoke test and fetch `/health`

Expected:
- all tests pass
- server starts cleanly
- `/health` returns `{"status":"ok"}`

**Step 2: Commit**

```bash
git add .
git commit -m "feat: add v2 mechanics actions"
```
