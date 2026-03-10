import test from "node:test";
import assert from "node:assert/strict";

import { newDb } from "pg-mem";

import { startGptActionsServer } from "./server.mjs";
import { PostgresCampaignStore } from "./store.mjs";

async function createTestServer() {
  const db = newDb();
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool();
  const store = new PostgresCampaignStore({ pool });
  const server = await startGptActionsServer({
    port: 0,
    host: "127.0.0.1",
    store,
  });

  return {
    pool,
    server,
    close: async () => {
      await server.close();
      await pool.end();
    },
  };
}

test("campaign endpoints support create, list, load, archive, clone, and continuity audit", async () => {
  const { server, close } = await createTestServer();

  try {
    const createResponse = await fetch(`${server.baseUrl}/campaigns`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Test Campaign",
        canon_mode: "canon baseline",
        era: "298 AC",
        play_mode: "human-player",
        player_character_name: "Eddard Stark",
      }),
    });
    const created = await createResponse.json();

    const listResponse = await fetch(`${server.baseUrl}/campaigns`);
    const campaigns = await listResponse.json();

    const detailsResponse = await fetch(`${server.baseUrl}/campaigns/${created.campaign_id}`);
    const details = await detailsResponse.json();

    const auditResponse = await fetch(
      `${server.baseUrl}/campaigns/${created.campaign_id}/continuity-audit`,
    );
    const audit = await auditResponse.json();

    const cloneResponse = await fetch(`${server.baseUrl}/campaigns/${created.campaign_id}/clone`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Test Campaign Clone",
      }),
    });
    const clone = await cloneResponse.json();

    const archiveResponse = await fetch(
      `${server.baseUrl}/campaigns/${created.campaign_id}/archive`,
      {
        method: "POST",
      },
    );
    const archived = await archiveResponse.json();

    const listAllResponse = await fetch(`${server.baseUrl}/campaigns?include_archived=true`);
    const allCampaigns = await listAllResponse.json();

    assert.equal(createResponse.status, 200);
    assert.equal(listResponse.status, 200);
    assert.equal(detailsResponse.status, 200);
    assert.equal(auditResponse.status, 200);
    assert.equal(cloneResponse.status, 200);
    assert.equal(archiveResponse.status, 200);
    assert.equal(listAllResponse.status, 200);
    assert.equal(campaigns.length, 1);
    assert.equal(details.name, "Test Campaign");
    assert.equal(audit.status, "warning");
    assert.equal(clone.status, "cloned");
    assert.equal(archived.status, "archived");
    assert.equal(allCampaigns.length, 2);
  } finally {
    await close();
  }
});

test("scene packet and checkpoint routes round-trip the current scene state", async () => {
  const { server, close } = await createTestServer();

  try {
    const createResponse = await fetch(`${server.baseUrl}/campaigns`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Ned",
        canon_mode: "canon baseline",
        era: "298 AC",
        play_mode: "human-player",
        player_character_name: "Eddard Stark",
      }),
    });
    const created = await createResponse.json();

    const saveResponse = await fetch(
      `${server.baseUrl}/campaigns/${created.campaign_id}/checkpoints`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          session_summary: "Robert arrives at Winterfell.",
          date: "298 AC",
          time: "evening",
          location: "Winterfell",
          immediate_situation: "The king has arrived.",
          present_npcs: ["Robert Baratheon"],
          player_state: {
            current_condition: "steady",
            injuries: [],
            resources: ["household authority"],
            social_position: "Lord of Winterfell",
            active_pressures: ["The king's request"],
          },
          open_threads: ["Robert wants Ned south."],
          canon_continuity_notes: ["Canon baseline intact."],
        }),
      },
    );
    const saved = await saveResponse.json();

    const packetResponse = await fetch(
      `${server.baseUrl}/campaigns/${created.campaign_id}/scene-packet`,
    );
    const packet = await packetResponse.json();

    assert.equal(saveResponse.status, 200);
    assert.equal(packetResponse.status, 200);
    assert.equal(saved.status, "saved");
    assert.equal(packet.time_place.location, "Winterfell");
    assert.equal(packet.open_threads[0], "Robert wants Ned south.");
  } finally {
    await close();
  }
});

test("canon lookup caches results after the first request", async () => {
  const { server, close } = await createTestServer();

  try {
    const firstResponse = await fetch(`${server.baseUrl}/canon/lookup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: "Eddard Stark",
        query_type: "character",
      }),
    });
    const first = await firstResponse.json();

    const secondResponse = await fetch(`${server.baseUrl}/canon/lookup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: "Eddard Stark",
        query_type: "character",
      }),
    });
    const second = await secondResponse.json();

    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    assert.equal(first.cache.hit, false);
    assert.equal(second.cache.hit, true);
    assert.ok(second.cache.cached_at);
  } finally {
    await close();
  }
});
