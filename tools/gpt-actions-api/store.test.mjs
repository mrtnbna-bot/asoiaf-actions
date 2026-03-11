import test from "node:test";
import assert from "node:assert/strict";

import { newDb } from "pg-mem";

import { PostgresCampaignStore } from "./store.mjs";

async function createStore() {
  const db = newDb();
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool();
  const store = new PostgresCampaignStore({ pool });
  await store.init();
  return { db, pool, store };
}

test("createCampaign and listCampaigns return active campaigns", async () => {
  const { pool, store } = await createStore();

  const created = await store.createCampaign({
    name: "Test Campaign",
    canon_mode: "canon baseline",
    era: "298 AC",
    play_mode: "human-player",
    player_character_name: "Eddard Stark",
  });

  const campaigns = await store.listCampaigns();

  assert.equal(created.status, "created");
  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0].campaign_id, created.campaign_id);
  assert.equal(campaigns[0].status, "active");

  await pool.end();
});

test("archiveCampaign hides archived campaigns from the default list and cloneCampaign carries forward the latest checkpoint", async () => {
  const { pool, store } = await createStore();

  const created = await store.createCampaign({
    name: "Petyr",
    canon_mode: "canon baseline",
    era: "298 AC",
    play_mode: "human-player",
    player_character_name: "Petyr Baelish",
  });

  await store.saveCheckpoint(created.campaign_id, {
    session_summary: "Petyr meets Varys in the Red Keep.",
    date: "298 AC",
    time: "evening",
    location: "King's Landing",
    immediate_situation: "A quiet meeting with dangerous implications.",
    visible_dangers: ["Varys knows too much"],
    present_npcs: ["Varys"],
    player_state: {
      current_condition: "steady",
      injuries: [],
      resources: ["coin"],
      social_position: "Master of Coin",
      active_pressures: ["court suspicion"],
    },
    npc_updates: [{ name: "Varys", immediate_aim: "sound Petyr out" }],
    open_threads: ["Varys is probing for weaknesses."],
    canon_continuity_notes: ["Canon baseline intact."],
    resume_prompt: "Petyr weighs how much truth to offer Varys.",
  });

  const archived = await store.archiveCampaign(created.campaign_id);
  const activeCampaigns = await store.listCampaigns();
  const allCampaigns = await store.listCampaigns({ includeArchived: true });
  const cloned = await store.cloneCampaign(created.campaign_id, { name: "Petyr Branch" });
  const clonePacket = await store.getScenePacket(cloned.campaign_id);

  assert.equal(archived.status, "archived");
  assert.equal(activeCampaigns.length, 0);
  assert.equal(allCampaigns.length, 1);
  assert.equal(allCampaigns[0].status, "archived");
  assert.equal(clonePacket.time_place.location, "King's Landing");
  assert.equal(clonePacket.immediate_situation.summary, "A quiet meeting with dangerous implications.");

  await pool.end();
});

test("getScenePacket and getContinuityAudit reflect the latest checkpoint", async () => {
  const { pool, store } = await createStore();

  const created = await store.createCampaign({
    name: "Ned",
    canon_mode: "canon baseline",
    era: "298 AC",
    play_mode: "human-player",
    player_character_name: "Eddard Stark",
  });

  const initialAudit = await store.getContinuityAudit(created.campaign_id);
  assert.ok(initialAudit.warnings.some((warning) => warning.code === "missing_scene_state"));

  await store.saveCheckpoint(created.campaign_id, {
    session_summary: "Robert arrives at Winterfell.",
    scene_state: {
      date: "298 AC",
      time: "evening",
      location: "Winterfell",
      immediate_situation: "Robert Baratheon has arrived.",
      visible_dangers: [],
      present_npcs: ["Robert Baratheon", "Catelyn Stark"],
    },
    player_state: {
      current_condition: "steady",
      injuries: ["old leg ache"],
      resources: ["household authority"],
      social_position: "Lord of Winterfell",
      active_pressures: ["The king's request"],
    },
    npc_updates: [{ name: "Robert Baratheon", immediate_aim: "recruit Ned south" }],
    open_threads: ["Robert wants Ned to become Hand."],
    canon_continuity_notes: ["Canon baseline intact."],
    continuity_state: {
      closed_doors: ["Declining the king lightly"],
      contradiction_notes: [],
    },
    resume_prompt: "The king's request hangs in the hall.",
  });

  const scenePacket = await store.getScenePacket(created.campaign_id);
  const audit = await store.getContinuityAudit(created.campaign_id);

  assert.equal(scenePacket.time_place.location, "Winterfell");
  assert.equal(scenePacket.player_state.social_position, "Lord of Winterfell");
  assert.equal(audit.status, "ok");
  assert.equal(audit.closed_doors.length, 1);
  assert.equal(audit.warnings.length, 0);

  await pool.end();
});

test("lookupCanonCache stores and returns cached canon results", async () => {
  const { pool, store } = await createStore();

  assert.equal(await store.getCanonCache({ query: "Eddard Stark", queryType: "character" }), null);

  await store.saveCanonCache({
    query: "Eddard Stark",
    queryType: "character",
    result: {
      query: "Eddard Stark",
      result_type: "character",
      summary: "Lord of Winterfell.",
      facts: ["House Stark"],
      uncertainties: [],
      sources: ["major-characters.md"],
    },
  });

  const cached = await store.getCanonCache({ query: "Eddard Stark", queryType: "character" });

  assert.equal(cached.result.summary, "Lord of Winterfell.");
  assert.ok(cached.cached_at);

  await pool.end();
});

test("NPC state, relationships, events, time advancement, and world tick persist as campaign mechanics", async () => {
  const { pool, store } = await createStore();

  const created = await store.createCampaign({
    name: "Intrigue",
    canon_mode: "canon baseline",
    era: "298 AC",
    play_mode: "human-player",
    player_character_name: "Petyr Baelish",
  });

  await store.upsertNpcState(created.campaign_id, "varys", {
    name: "Varys",
    role: "Master of Whisperers",
    location: "King's Landing",
    core_nature: {
      archetype: "spymaster",
      drives: ["stability", "information"],
    },
    motive_stack: ["protect the realm", "test Petyr"],
    emotional_state: {
      baseline: "controlled",
      current: "curious",
    },
    agenda_state: {
      current_agenda: "probe Petyr",
      current_step: "offer a soft warning",
      urgency: 2,
      progress: 0.25,
      last_advanced_tick: null,
    },
    knowledge_state: {
      known_facts: ["Petyr is ambitious"],
      suspected_facts: ["Petyr is hiding a lever"],
    },
    commitments: {
      promises_made: [],
      threats_made: [],
    },
  });

  await store.upsertRelationship(created.campaign_id, {
    source_npc_id: "varys",
    target_key: "player:petyr-baelish",
    target_type: "player",
    trust: -1,
    fear: 0,
    desire: 0,
    leverage_over: 2,
    leverage_under: 0,
    volatility: 1,
    debts: ["owes Petyr no favor"],
    promises: [],
  });

  await store.logEvent(created.campaign_id, {
    event_type: "meeting",
    summary: "Varys quietly warns Petyr about dangerous court currents.",
    location: "King's Landing",
    actors: ["varys", "player:petyr-baelish"],
    witnesses: [],
    effects: ["rel_shift:varys->player:petyr-baelish:trust+1"],
    followups: [
      {
        kind: "relationship_shift",
        source_npc_id: "varys",
        target_key: "player:petyr-baelish",
        metric: "trust",
        delta: 1,
        due_day: 1,
        due_hour: 2,
      },
      {
        kind: "npc_agenda_advance",
        npc_id: "varys",
        progress_delta: 0.25,
        due_day: 1,
        due_hour: 2,
        next_step: "watch Petyr's answer",
      },
    ],
    player_visible: true,
  });

  const npcs = await store.listNpcs(created.campaign_id);
  const varys = await store.getNpcState(created.campaign_id, "varys");
  const relationshipsBefore = await store.getRelationshipWeb(created.campaign_id, "varys");
  const timelineBefore = await store.getTimeline(created.campaign_id);
  const advanced = await store.advanceTime(created.campaign_id, { hours: 2, reason: "court night deepens" });
  const tick = await store.runWorldTick(created.campaign_id);
  const relationshipsAfter = await store.getRelationshipWeb(created.campaign_id, "varys");
  const recentEvents = await store.getRecentEvents(created.campaign_id, { limit: 5 });
  const varysAfter = await store.getNpcState(created.campaign_id, "varys");

  assert.equal(npcs.length, 1);
  assert.equal(varys.name, "Varys");
  assert.equal(relationshipsBefore.length, 1);
  assert.equal(timelineBefore.current_day, 1);
  assert.equal(timelineBefore.current_hour, 0);
  assert.equal(advanced.timeline.current_hour, 2);
  assert.equal(tick.applied_followups.length, 2);
  assert.equal(relationshipsAfter[0].trust, 0);
  assert.equal(varysAfter.agenda_state.progress, 0.5);
  assert.equal(varysAfter.agenda_state.current_step, "watch Petyr's answer");
  assert.ok(
    recentEvents.some(
      (event) => event.summary === "Varys quietly warns Petyr about dangerous court currents.",
    ),
  );

  await pool.end();
});
