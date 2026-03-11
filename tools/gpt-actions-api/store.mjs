import { ensureSchema } from "./db.mjs";

function slugify(value) {
  return String(value ?? "campaign")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value == null || value === "") {
    return [];
  }

  return [value];
}

function normalizeNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizePlayerState(playerState = {}) {
  return {
    current_condition: playerState.current_condition ?? null,
    injuries: normalizeArray(playerState.injuries),
    resources: normalizeArray(playerState.resources),
    social_position: playerState.social_position ?? null,
    active_pressures: normalizeArray(playerState.active_pressures),
  };
}

function normalizeCheckpoint(checkpoint = {}) {
  const sceneState = checkpoint.scene_state ?? {
    date: checkpoint.date ?? null,
    time: checkpoint.time ?? null,
    location: checkpoint.location ?? null,
    immediate_situation: checkpoint.immediate_situation ?? null,
    visible_dangers: normalizeArray(checkpoint.visible_dangers),
    present_npcs: normalizeArray(checkpoint.present_npcs),
  };

  const continuityState = checkpoint.continuity_state ?? {};

  return {
    session_summary: checkpoint.session_summary ?? null,
    scene_state: {
      date: sceneState.date ?? null,
      time: sceneState.time ?? null,
      location: sceneState.location ?? null,
      immediate_situation: sceneState.immediate_situation ?? null,
      visible_dangers: normalizeArray(sceneState.visible_dangers),
      present_npcs: normalizeArray(sceneState.present_npcs),
    },
    player_state: normalizePlayerState(checkpoint.player_state),
    npc_updates: normalizeArray(checkpoint.npc_updates),
    open_threads: normalizeArray(checkpoint.open_threads),
    canon_continuity_notes: normalizeArray(checkpoint.canon_continuity_notes),
    continuity_state: {
      closed_doors: normalizeArray(continuityState.closed_doors),
      contradiction_notes: normalizeArray(continuityState.contradiction_notes),
    },
    resume_prompt: checkpoint.resume_prompt ?? null,
  };
}

function buildStarterScenePacket(campaign) {
  return {
    campaign,
    time_place: {
      date: null,
      time: null,
      location: null,
    },
    immediate_situation: {
      summary: "No scene has been established yet.",
      visible_dangers: [],
      present_npcs: [],
    },
    player_state: normalizePlayerState(),
    npcs: [],
    open_threads: [],
    canon_notes: [],
    continuity_warnings: [],
  };
}

function buildScenePacket(campaign, checkpoint) {
  return {
    campaign,
    time_place: {
      date: checkpoint.scene_state.date,
      time: checkpoint.scene_state.time,
      location: checkpoint.scene_state.location,
    },
    immediate_situation: {
      summary: checkpoint.scene_state.immediate_situation,
      visible_dangers: checkpoint.scene_state.visible_dangers,
      present_npcs: checkpoint.scene_state.present_npcs,
    },
    player_state: checkpoint.player_state,
    npcs: checkpoint.npc_updates,
    open_threads: checkpoint.open_threads,
    canon_notes: checkpoint.canon_continuity_notes,
    continuity_warnings: [],
  };
}

function campaignRowToDto(row) {
  return {
    campaign_id: row.campaign_id,
    name: row.name,
    canon_mode: row.canon_mode,
    era: row.era,
    play_mode: row.play_mode,
    player_character_name: row.player_character_name,
    campaign_charter: row.campaign_charter,
    status: row.status,
    source_campaign_id: row.source_campaign_id,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function canonCacheKey({ query, queryType }) {
  return `${String(queryType ?? "unknown").trim().toLowerCase()}::${String(query ?? "")
    .trim()
    .toLowerCase()}`;
}

function normalizeTimelineRow(row) {
  return {
    campaign_id: row.campaign_id,
    current_day: Number(row.current_day ?? 1),
    current_hour: Number(row.current_hour ?? 0),
    current_location: row.current_location ?? null,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function normalizeNpcState(npcId, npc = {}) {
  const agenda = npc.agenda_state ?? {};
  return {
    npc_id: npcId,
    name: npc.name ?? npcId,
    role: npc.role ?? null,
    location: npc.location ?? null,
    core_nature: npc.core_nature ?? {},
    motive_stack: normalizeArray(npc.motive_stack),
    emotional_state: npc.emotional_state ?? {},
    agenda_state: {
      current_agenda: agenda.current_agenda ?? null,
      current_step: agenda.current_step ?? null,
      urgency: normalizeNumber(agenda.urgency, 0),
      progress: normalizeNumber(agenda.progress, 0),
      last_advanced_tick: agenda.last_advanced_tick ?? null,
    },
    knowledge_state: npc.knowledge_state ?? {},
    commitments: npc.commitments ?? {},
  };
}

function npcRowToDto(row) {
  return {
    ...row.state,
    npc_id: row.npc_id,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function normalizeRelationship(input = {}) {
  return {
    source_npc_id: input.source_npc_id,
    target_key: input.target_key,
    target_type: input.target_type ?? "npc",
    trust: normalizeNumber(input.trust, 0),
    fear: normalizeNumber(input.fear, 0),
    desire: normalizeNumber(input.desire, 0),
    leverage_over: normalizeNumber(input.leverage_over, 0),
    leverage_under: normalizeNumber(input.leverage_under, 0),
    volatility: normalizeNumber(input.volatility, 0),
    debts: normalizeArray(input.debts),
    promises: normalizeArray(input.promises),
  };
}

function relationshipRowToDto(row) {
  return {
    source_npc_id: row.source_npc_id,
    target_key: row.target_key,
    target_type: row.target_type,
    trust: Number(row.trust),
    fear: Number(row.fear),
    desire: Number(row.desire),
    leverage_over: Number(row.leverage_over),
    leverage_under: Number(row.leverage_under),
    volatility: Number(row.volatility),
    debts: row.debts ?? [],
    promises: row.promises ?? [],
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function normalizeFollowup(followup = {}) {
  return {
    kind: followup.kind ?? null,
    source_npc_id: followup.source_npc_id ?? null,
    npc_id: followup.npc_id ?? null,
    target_key: followup.target_key ?? null,
    metric: followup.metric ?? null,
    delta: normalizeNumber(followup.delta, 0),
    progress_delta: normalizeNumber(followup.progress_delta, 0),
    due_day: Number.isFinite(Number(followup.due_day)) ? Number(followup.due_day) : null,
    due_hour: Number.isFinite(Number(followup.due_hour)) ? Number(followup.due_hour) : null,
    next_step: followup.next_step ?? null,
    applied_at: followup.applied_at ?? null,
  };
}

function normalizeEvent(event = {}) {
  return {
    event_type: event.event_type ?? "event",
    summary: event.summary ?? "",
    location: event.location ?? null,
    actors: normalizeArray(event.actors),
    witnesses: normalizeArray(event.witnesses),
    effects: normalizeArray(event.effects),
    followups: normalizeArray(event.followups).map(normalizeFollowup),
    player_visible: event.player_visible !== false,
  };
}

function eventRowToDto(row) {
  return {
    event_id: row.event_id,
    campaign_id: row.campaign_id,
    event_type: row.event_type,
    summary: row.summary,
    location: row.location,
    actors: row.actors ?? [],
    witnesses: row.witnesses ?? [],
    effects: row.effects ?? [],
    followups: row.followups ?? [],
    player_visible: row.player_visible,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function isFollowupDue(followup, timeline) {
  if (followup.applied_at) {
    return false;
  }

  const dueDay = Number.isFinite(followup.due_day) ? followup.due_day : null;
  const dueHour = Number.isFinite(followup.due_hour) ? followup.due_hour : 0;
  if (dueDay == null) {
    return false;
  }
  if (timeline.current_day > dueDay) {
    return true;
  }
  return timeline.current_day === dueDay && timeline.current_hour >= dueHour;
}

function advanceTimeline(timeline, hours = 0) {
  const total = (timeline.current_day - 1) * 24 + timeline.current_hour + Number(hours);
  return {
    current_day: Math.floor(total / 24) + 1,
    current_hour: ((total % 24) + 24) % 24,
  };
}

function parseRelationshipEffect(effect) {
  const match = /^rel_shift:(.+?)->(.+?):([a-z_]+)([+-]\d+(?:\.\d+)?)$/i.exec(
    `${effect ?? ""}`.trim(),
  );
  if (!match) {
    return null;
  }

  return {
    source_npc_id: match[1],
    target_key: match[2],
    metric: match[3],
    delta: Number(match[4]),
  };
}

export class PostgresCampaignStore {
  constructor({ pool }) {
    this.pool = pool;
  }

  async init() {
    await ensureSchema(this.pool);
  }

  async createCampaign(payload) {
    const createdAt = nowIso();
    const campaignId = `campaign-${slugify(payload.name)}-${Date.now()}`;
    const campaign = {
      campaign_id: campaignId,
      name: payload.name,
      canon_mode: payload.canon_mode ?? null,
      era: payload.era ?? null,
      play_mode: payload.play_mode ?? null,
      player_character_name: payload.player_character_name ?? null,
      campaign_charter: payload.campaign_charter ?? "",
      status: "active",
      source_campaign_id: null,
      created_at: createdAt,
      updated_at: createdAt,
    };
    const scenePacket = buildStarterScenePacket(campaign);

    await this.pool.query("begin");
    try {
      await this.pool.query(
        `
          insert into campaigns (
            campaign_id, name, canon_mode, era, play_mode, player_character_name,
            campaign_charter, status, source_campaign_id, created_at, updated_at
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `,
        [
          campaign.campaign_id,
          campaign.name,
          campaign.canon_mode,
          campaign.era,
          campaign.play_mode,
          campaign.player_character_name,
          campaign.campaign_charter,
          campaign.status,
          campaign.source_campaign_id,
          campaign.created_at,
          campaign.updated_at,
        ],
      );
      await this.pool.query(
        `insert into scene_packets (campaign_id, packet, updated_at) values ($1, $2::jsonb, $3)`,
        [campaign.campaign_id, JSON.stringify(scenePacket), createdAt],
      );
      await this.pool.query(
        `
          insert into continuity_state (campaign_id, closed_doors, contradiction_notes, updated_at)
          values ($1, '[]'::jsonb, '[]'::jsonb, $2)
        `,
        [campaign.campaign_id, createdAt],
      );
      await this.pool.query(
        `
          insert into campaign_timeline (campaign_id, current_day, current_hour, current_location, updated_at)
          values ($1, 1, 0, null, $2)
        `,
        [campaign.campaign_id, createdAt],
      );
      await this.pool.query("commit");
    } catch (error) {
      await this.pool.query("rollback");
      throw error;
    }

    return {
      campaign_id: campaign.campaign_id,
      status: "created",
    };
  }

  async getCampaign(campaignId) {
    const result = await this.pool.query(`select * from campaigns where campaign_id = $1`, [
      campaignId,
    ]);
    return result.rows[0] ? campaignRowToDto(result.rows[0]) : null;
  }

  async listCampaigns({ includeArchived = false } = {}) {
    const result = await this.pool.query(
      `
        select * from campaigns
        where ($1::boolean = true or status = 'active')
        order by created_at desc
      `,
      [includeArchived],
    );
    return result.rows.map(campaignRowToDto);
  }

  async archiveCampaign(campaignId) {
    const updatedAt = nowIso();
    const result = await this.pool.query(
      `
        update campaigns
        set status = 'archived', updated_at = $2
        where campaign_id = $1
        returning *
      `,
      [campaignId, updatedAt],
    );

    if (!result.rows[0]) {
      return null;
    }

    return {
      campaign_id: campaignId,
      status: "archived",
      archived_at: updatedAt,
    };
  }

  async cloneCampaign(campaignId, { name } = {}) {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      return null;
    }

    const packet = await this.getScenePacket(campaignId);
    const continuity = await this.#getContinuityState(campaignId);
    const latestCheckpoint = await this.#getLatestCheckpoint(campaignId);
    const timeline = await this.getTimeline(campaignId);
    const created = await this.createCampaign({
      name: name ?? `${campaign.name} Copy`,
      canon_mode: campaign.canon_mode,
      era: campaign.era,
      play_mode: campaign.play_mode,
      player_character_name: campaign.player_character_name,
      campaign_charter: campaign.campaign_charter,
    });
    const clonedCampaignId = created.campaign_id;

    await this.pool.query(
      `update campaigns set source_campaign_id = $2 where campaign_id = $1`,
      [clonedCampaignId, campaignId],
    );

    if (latestCheckpoint) {
      await this.saveCheckpoint(clonedCampaignId, latestCheckpoint.payload);
      await this.pool.query(
        `
          update continuity_state
          set closed_doors = $2::jsonb, contradiction_notes = $3::jsonb, updated_at = $4
          where campaign_id = $1
        `,
        [
          clonedCampaignId,
          JSON.stringify(continuity.closed_doors),
          JSON.stringify(continuity.contradiction_notes),
          nowIso(),
        ],
      );
    } else if (packet) {
      await this.pool.query(
        `update scene_packets set packet = $2::jsonb, updated_at = $3 where campaign_id = $1`,
        [clonedCampaignId, JSON.stringify(packet), nowIso()],
      );
    }

    if (timeline) {
      await this.pool.query(
        `
          update campaign_timeline
          set current_day = $2, current_hour = $3, current_location = $4, updated_at = $5
          where campaign_id = $1
        `,
        [
          clonedCampaignId,
          timeline.current_day,
          timeline.current_hour,
          timeline.current_location,
          nowIso(),
        ],
      );
    }

    return {
      campaign_id: clonedCampaignId,
      status: "cloned",
      source_campaign_id: campaignId,
    };
  }

  async getScenePacket(campaignId) {
    const result = await this.pool.query(
      `select packet from scene_packets where campaign_id = $1`,
      [campaignId],
    );
    return result.rows[0]?.packet ?? null;
  }

  async saveCheckpoint(campaignId, checkpoint) {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      return null;
    }

    const normalizedCheckpoint = normalizeCheckpoint(checkpoint);
    const savedAt = nowIso();
    const ordinalResult = await this.pool.query(
      `select coalesce(max(ordinal), 0) + 1 as next_ordinal from checkpoints where campaign_id = $1`,
      [campaignId],
    );
    const ordinal = Number(ordinalResult.rows[0].next_ordinal);
    const checkpointId = `checkpoint-${campaignId}-${ordinal}`;
    const scenePacket = buildScenePacket(campaign, normalizedCheckpoint);

    await this.pool.query("begin");
    try {
      await this.pool.query(
        `
          insert into checkpoints (checkpoint_id, campaign_id, ordinal, payload, saved_at)
          values ($1, $2, $3, $4::jsonb, $5)
        `,
        [
          checkpointId,
          campaignId,
          ordinal,
          JSON.stringify(normalizedCheckpoint),
          savedAt,
        ],
      );
      await this.pool.query(
        `update scene_packets set packet = $2::jsonb, updated_at = $3 where campaign_id = $1`,
        [campaignId, JSON.stringify(scenePacket), savedAt],
      );
      await this.pool.query(
        `
          update continuity_state
          set closed_doors = $2::jsonb, contradiction_notes = $3::jsonb, updated_at = $4
          where campaign_id = $1
        `,
        [
          campaignId,
          JSON.stringify(normalizedCheckpoint.continuity_state.closed_doors),
          JSON.stringify(normalizedCheckpoint.continuity_state.contradiction_notes),
          savedAt,
        ],
      );
      await this.pool.query(
        `
          update campaign_timeline
          set current_location = coalesce($2, current_location), updated_at = $3
          where campaign_id = $1
        `,
        [campaignId, normalizedCheckpoint.scene_state.location, savedAt],
      );
      await this.pool.query(
        `update campaigns set updated_at = $2 where campaign_id = $1`,
        [campaignId, savedAt],
      );
      await this.pool.query("commit");
    } catch (error) {
      await this.pool.query("rollback");
      throw error;
    }

    return {
      checkpoint_id: checkpointId,
      status: "saved",
      saved_at: savedAt,
    };
  }

  async getContinuityAudit(campaignId) {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      return null;
    }

    const packet = await this.getScenePacket(campaignId);
    const continuity = await this.#getContinuityState(campaignId);
    const warnings = [];

    const hasNoRecordedScene =
      !packet ||
      !packet.time_place ||
      (!packet.time_place.date &&
        !packet.time_place.time &&
        !packet.time_place.location &&
        packet.immediate_situation?.summary === "No scene has been established yet.");

    if (hasNoRecordedScene) {
      warnings.push({
        code: "missing_scene_state",
        message: "No scene state has been recorded yet.",
      });
    } else if (!packet.time_place.date || !packet.time_place.time || !packet.time_place.location) {
      warnings.push({
        code: "incomplete_time_place",
        message: "Date, time, and location should all be present in the latest scene packet.",
      });
    }

    for (const note of continuity.contradiction_notes) {
      warnings.push({
        code: "contradiction_note",
        message: String(note),
      });
    }

    return {
      campaign_id: campaignId,
      status: warnings.length === 0 ? "ok" : "warning",
      closed_doors: continuity.closed_doors,
      contradiction_notes: continuity.contradiction_notes,
      warnings,
    };
  }

  async getCanonCache({ query, queryType = "unknown" }) {
    const result = await this.pool.query(
      `select result, cached_at from canon_cache where query_key = $1`,
      [canonCacheKey({ query, queryType })],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      result: row.result,
      cached_at: row.cached_at instanceof Date ? row.cached_at.toISOString() : row.cached_at,
    };
  }

  async saveCanonCache({ query, queryType = "unknown", result }) {
    const cachedAt = nowIso();
    await this.pool.query(
      `
        insert into canon_cache (query_key, query, query_type, result, cached_at)
        values ($1, $2, $3, $4::jsonb, $5)
        on conflict (query_key) do update
        set result = excluded.result, cached_at = excluded.cached_at
      `,
      [
        canonCacheKey({ query, queryType }),
        query,
        queryType,
        JSON.stringify(result),
        cachedAt,
      ],
    );

    return {
      status: "cached",
      cached_at: cachedAt,
    };
  }

  async getTimeline(campaignId) {
    const result = await this.pool.query(
      `select * from campaign_timeline where campaign_id = $1`,
      [campaignId],
    );
    return result.rows[0] ? normalizeTimelineRow(result.rows[0]) : null;
  }

  async advanceTime(campaignId, { hours = 0, reason = null } = {}) {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      return null;
    }

    const timeline = await this.getTimeline(campaignId);
    const nextTimeline = advanceTimeline(timeline, hours);
    const updatedAt = nowIso();

    await this.pool.query(
      `
        update campaign_timeline
        set current_day = $2, current_hour = $3, updated_at = $4
        where campaign_id = $1
      `,
      [campaignId, nextTimeline.current_day, nextTimeline.current_hour, updatedAt],
    );

    if (reason) {
      await this.logEvent(campaignId, {
        event_type: "time_advance",
        summary: reason,
        location: timeline.current_location,
        actors: [],
        witnesses: [],
        effects: [],
        followups: [],
        player_visible: false,
      });
    }

    return {
      status: "advanced",
      timeline: {
        campaign_id: campaignId,
        current_day: nextTimeline.current_day,
        current_hour: nextTimeline.current_hour,
        current_location: timeline.current_location,
        updated_at: updatedAt,
      },
    };
  }

  async upsertNpcState(campaignId, npcId, npc) {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      return null;
    }

    const normalized = normalizeNpcState(npcId, npc);
    const updatedAt = nowIso();
    await this.pool.query(
      `
        insert into npcs (campaign_id, npc_id, name, role, location, state, updated_at)
        values ($1, $2, $3, $4, $5, $6::jsonb, $7)
        on conflict (campaign_id, npc_id) do update
        set name = excluded.name,
            role = excluded.role,
            location = excluded.location,
            state = excluded.state,
            updated_at = excluded.updated_at
      `,
      [
        campaignId,
        npcId,
        normalized.name,
        normalized.role,
        normalized.location,
        JSON.stringify(normalized),
        updatedAt,
      ],
    );

    return this.getNpcState(campaignId, npcId);
  }

  async getNpcState(campaignId, npcId) {
    const result = await this.pool.query(
      `select * from npcs where campaign_id = $1 and npc_id = $2`,
      [campaignId, npcId],
    );
    return result.rows[0] ? npcRowToDto(result.rows[0]) : null;
  }

  async listNpcs(campaignId) {
    const result = await this.pool.query(
      `select * from npcs where campaign_id = $1 order by updated_at desc, npc_id asc`,
      [campaignId],
    );
    return result.rows.map(npcRowToDto);
  }

  async upsertRelationship(campaignId, relationship) {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      return null;
    }

    const normalized = normalizeRelationship(relationship);
    const updatedAt = nowIso();
    await this.pool.query(
      `
        insert into npc_relationships (
          campaign_id, source_npc_id, target_key, target_type, trust, fear, desire,
          leverage_over, leverage_under, volatility, debts, promises, updated_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13)
        on conflict (campaign_id, source_npc_id, target_key) do update
        set target_type = excluded.target_type,
            trust = excluded.trust,
            fear = excluded.fear,
            desire = excluded.desire,
            leverage_over = excluded.leverage_over,
            leverage_under = excluded.leverage_under,
            volatility = excluded.volatility,
            debts = excluded.debts,
            promises = excluded.promises,
            updated_at = excluded.updated_at
      `,
      [
        campaignId,
        normalized.source_npc_id,
        normalized.target_key,
        normalized.target_type,
        normalized.trust,
        normalized.fear,
        normalized.desire,
        normalized.leverage_over,
        normalized.leverage_under,
        normalized.volatility,
        JSON.stringify(normalized.debts),
        JSON.stringify(normalized.promises),
        updatedAt,
      ],
    );

    const relationships = await this.getRelationshipWeb(campaignId, normalized.source_npc_id);
    return relationships.find((item) => item.target_key === normalized.target_key) ?? null;
  }

  async getRelationshipWeb(campaignId, focusKey) {
    const result = await this.pool.query(
      `
        select *
        from npc_relationships
        where campaign_id = $1 and source_npc_id = $2
        order by updated_at desc, target_key asc
      `,
      [campaignId, focusKey],
    );
    return result.rows.map(relationshipRowToDto);
  }

  async logEvent(campaignId, event) {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      return null;
    }

    const normalized = normalizeEvent(event);
    const eventId = `event-${campaignId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = nowIso();

    await this.pool.query(
      `
        insert into campaign_events (
          event_id, campaign_id, event_type, summary, location, actors, witnesses,
          effects, followups, player_visible, created_at
        ) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11)
      `,
      [
        eventId,
        campaignId,
        normalized.event_type,
        normalized.summary,
        normalized.location,
        JSON.stringify(normalized.actors),
        JSON.stringify(normalized.witnesses),
        JSON.stringify(normalized.effects),
        JSON.stringify(normalized.followups),
        normalized.player_visible,
        createdAt,
      ],
    );

    return {
      event_id: eventId,
      status: "logged",
      created_at: createdAt,
    };
  }

  async getRecentEvents(campaignId, { limit = 5 } = {}) {
    const result = await this.pool.query(
      `
        select *
        from campaign_events
        where campaign_id = $1
        order by created_at desc
        limit $2
      `,
      [campaignId, limit],
    );
    return result.rows.map(eventRowToDto);
  }

  async runWorldTick(campaignId) {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      return null;
    }

    const timeline = await this.getTimeline(campaignId);
    const events = await this.#getEvents(campaignId);
    const appliedFollowups = [];

    for (const event of events) {
      const nextFollowups = [];

      for (const followup of event.followups ?? []) {
        if (!isFollowupDue(followup, timeline)) {
          nextFollowups.push(followup);
          continue;
        }

        let applied = false;

        if (followup.kind === "relationship_shift") {
          const current = await this.#getRelationship(
            campaignId,
            followup.source_npc_id,
            followup.target_key,
          );
          const metricKey = followup.metric ?? "trust";
          await this.upsertRelationship(campaignId, {
            source_npc_id: followup.source_npc_id,
            target_key: followup.target_key,
            target_type: current?.target_type ?? (followup.target_key?.startsWith("player:") ? "player" : "npc"),
            trust:
              metricKey === "trust"
                ? normalizeNumber(current?.trust, 0) + normalizeNumber(followup.delta, 0)
                : normalizeNumber(current?.trust, 0),
            fear:
              metricKey === "fear"
                ? normalizeNumber(current?.fear, 0) + normalizeNumber(followup.delta, 0)
                : normalizeNumber(current?.fear, 0),
            desire:
              metricKey === "desire"
                ? normalizeNumber(current?.desire, 0) + normalizeNumber(followup.delta, 0)
                : normalizeNumber(current?.desire, 0),
            leverage_over:
              metricKey === "leverage_over"
                ? normalizeNumber(current?.leverage_over, 0) + normalizeNumber(followup.delta, 0)
                : normalizeNumber(current?.leverage_over, 0),
            leverage_under:
              metricKey === "leverage_under"
                ? normalizeNumber(current?.leverage_under, 0) + normalizeNumber(followup.delta, 0)
                : normalizeNumber(current?.leverage_under, 0),
            volatility:
              metricKey === "volatility"
                ? normalizeNumber(current?.volatility, 0) + normalizeNumber(followup.delta, 0)
                : normalizeNumber(current?.volatility, 0),
            debts: current?.debts ?? [],
            promises: current?.promises ?? [],
          });
          applied = true;
        } else if (followup.kind === "npc_agenda_advance") {
          const npc = await this.getNpcState(campaignId, followup.npc_id);
          if (npc) {
            await this.upsertNpcState(campaignId, followup.npc_id, {
              ...npc,
              agenda_state: {
                ...npc.agenda_state,
                progress:
                  normalizeNumber(npc.agenda_state?.progress, 0) +
                  normalizeNumber(followup.progress_delta, 0),
                current_step: followup.next_step ?? npc.agenda_state?.current_step ?? null,
                last_advanced_tick: `${timeline.current_day}:${timeline.current_hour}`,
              },
            });
          }
          applied = true;
        }

        if (applied) {
          nextFollowups.push({
            ...followup,
            applied_at: nowIso(),
          });
          appliedFollowups.push({
            event_id: event.event_id,
            kind: followup.kind,
            npc_id: followup.npc_id ?? followup.source_npc_id ?? null,
            target_key: followup.target_key ?? null,
          });
        } else {
          nextFollowups.push(followup);
        }
      }

      await this.pool.query(
        `update campaign_events set followups = $2::jsonb where event_id = $1`,
        [event.event_id, JSON.stringify(nextFollowups)],
      );
    }

    return {
      status: "ok",
      timeline,
      applied_followups: appliedFollowups,
    };
  }

  async #getContinuityState(campaignId) {
    const result = await this.pool.query(
      `select closed_doors, contradiction_notes from continuity_state where campaign_id = $1`,
      [campaignId],
    );
    return (
      result.rows[0] ?? {
        closed_doors: [],
        contradiction_notes: [],
      }
    );
  }

  async #getLatestCheckpoint(campaignId) {
    const result = await this.pool.query(
      `
        select checkpoint_id, payload, saved_at
        from checkpoints
        where campaign_id = $1
        order by ordinal desc
        limit 1
      `,
      [campaignId],
    );
    return result.rows[0] ?? null;
  }

  async #getRelationship(campaignId, sourceNpcId, targetKey) {
    const result = await this.pool.query(
      `
        select *
        from npc_relationships
        where campaign_id = $1 and source_npc_id = $2 and target_key = $3
      `,
      [campaignId, sourceNpcId, targetKey],
    );
    return result.rows[0] ? relationshipRowToDto(result.rows[0]) : null;
  }

  async #getEvents(campaignId) {
    const result = await this.pool.query(
      `select * from campaign_events where campaign_id = $1 order by created_at asc`,
      [campaignId],
    );
    return result.rows.map(eventRowToDto);
  }
}
