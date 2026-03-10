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
    } else {
      if (!packet.time_place.date || !packet.time_place.time || !packet.time_place.location) {
        warnings.push({
          code: "incomplete_time_place",
          message: "Date, time, and location should all be present in the latest scene packet.",
        });
      }
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
}
