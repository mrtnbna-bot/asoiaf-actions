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

test("v2 mechanics endpoints expose npc state, relationships, events, time advance, and world tick", async () => {
  const { server, close } = await createTestServer();

  try {
    const createResponse = await fetch(`${server.baseUrl}/campaigns`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Intrigue",
        canon_mode: "canon baseline",
        era: "298 AC",
        play_mode: "human-player",
        player_character_name: "Petyr Baelish",
      }),
    });
    const created = await createResponse.json();

    const npcSaveResponse = await fetch(
      `${server.baseUrl}/campaigns/${created.campaign_id}/npcs/varys`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Varys",
          role: "Master of Whisperers",
          location: "King's Landing",
          agenda_state: {
            current_agenda: "probe Petyr",
            current_step: "offer a soft warning",
            urgency: 2,
            progress: 0.25,
          },
        }),
      },
    );
    const npcSave = await npcSaveResponse.json();

    const npcListResponse = await fetch(`${server.baseUrl}/campaigns/${created.campaign_id}/npcs`);
    const npcList = await npcListResponse.json();

    const eventResponse = await fetch(`${server.baseUrl}/campaigns/${created.campaign_id}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        event_type: "meeting",
        summary: "Varys quietly warns Petyr.",
        location: "King's Landing",
        actors: ["varys", "player:petyr-baelish"],
        effects: [],
        followups: [
          {
            kind: "npc_agenda_advance",
            npc_id: "varys",
            progress_delta: 0.25,
            due_day: 1,
            due_hour: 2,
            next_step: "watch Petyr's answer",
          },
        ],
      }),
    });
    const logged = await eventResponse.json();

    const advanceResponse = await fetch(
      `${server.baseUrl}/campaigns/${created.campaign_id}/advance-time`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          hours: 2,
          reason: "night deepens",
        }),
      },
    );
    const advanced = await advanceResponse.json();

    const tickResponse = await fetch(
      `${server.baseUrl}/campaigns/${created.campaign_id}/world-tick`,
      {
        method: "POST",
      },
    );
    const tick = await tickResponse.json();

    const npcResponse = await fetch(
      `${server.baseUrl}/campaigns/${created.campaign_id}/npcs/varys`,
    );
    const npc = await npcResponse.json();

    const eventsResponse = await fetch(
      `${server.baseUrl}/campaigns/${created.campaign_id}/events?limit=5`,
    );
    const events = await eventsResponse.json();

    assert.equal(npcSaveResponse.status, 200);
    assert.equal(npcListResponse.status, 200);
    assert.equal(eventResponse.status, 200);
    assert.equal(advanceResponse.status, 200);
    assert.equal(tickResponse.status, 200);
    assert.equal(npcResponse.status, 200);
    assert.equal(eventsResponse.status, 200);
    assert.equal(npcSave.name, "Varys");
    assert.equal(npcList.length, 1);
    assert.equal(logged.status, "logged");
    assert.equal(advanced.status, "advanced");
    assert.equal(tick.applied_followups.length, 1);
    assert.equal(npc.agenda_state.current_step, "watch Petyr's answer");
    assert.ok(events.events.length >= 1);
  } finally {
    await close();
  }
});
