import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

async function readJson(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
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

function normalizeCheckpoint(checkpoint) {
  const sceneState = checkpoint.scene_state ?? {
    date: checkpoint.date ?? null,
    time: checkpoint.time ?? null,
    location: checkpoint.location ?? null,
    immediate_situation: checkpoint.immediate_situation ?? null,
    visible_dangers: normalizeArray(checkpoint.visible_dangers),
    present_npcs: normalizeArray(checkpoint.present_npcs),
  };

  return {
    ...checkpoint,
    scene_state: {
      date: sceneState.date ?? null,
      time: sceneState.time ?? null,
      location: sceneState.location ?? null,
      immediate_situation: sceneState.immediate_situation ?? null,
      visible_dangers: normalizeArray(sceneState.visible_dangers),
      present_npcs: normalizeArray(sceneState.present_npcs),
    },
    player_state: checkpoint.player_state ?? {
      current_condition: null,
      injuries: [],
      resources: [],
      social_position: null,
      active_pressures: [],
    },
    npc_updates: normalizeArray(checkpoint.npc_updates),
    open_threads: normalizeArray(checkpoint.open_threads),
    canon_continuity_notes: normalizeArray(checkpoint.canon_continuity_notes),
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
    player_state: {
      current_condition: null,
      injuries: [],
      resources: [],
      social_position: null,
      active_pressures: [],
    },
    npcs: [],
    open_threads: [],
    canon_notes: [],
    continuity_warnings: [],
  };
}

export class FileCampaignStore {
  constructor({ dataDir }) {
    this.dataDir = dataDir;
    this.campaignsDir = path.join(dataDir, "campaigns");
  }

  async init() {
    await mkdir(this.campaignsDir, { recursive: true });
  }

  campaignFile(campaignId) {
    return path.join(this.campaignsDir, `${campaignId}.json`);
  }

  async createCampaign(payload) {
    await this.init();

    const campaign = {
      campaign_id: `campaign-${slugify(payload.name)}-${Date.now()}`,
      name: payload.name,
      canon_mode: payload.canon_mode,
      era: payload.era,
      play_mode: payload.play_mode,
      player_character_name: payload.player_character_name,
      campaign_charter: payload.campaign_charter ?? "",
      created_at: nowIso(),
    };

    const record = {
      campaign,
      latest_scene_packet: buildStarterScenePacket(campaign),
      checkpoints: [],
    };

    await writeJson(this.campaignFile(campaign.campaign_id), record);

    return {
      campaign_id: campaign.campaign_id,
      status: "created",
    };
  }

  async loadCampaign(campaignId) {
    try {
      return await readJson(this.campaignFile(campaignId));
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async getScenePacket(campaignId) {
    const record = await this.loadCampaign(campaignId);
    if (!record) {
      return null;
    }

    return record.latest_scene_packet;
  }

  async saveCheckpoint(campaignId, checkpoint) {
    const record = await this.loadCampaign(campaignId);
    if (!record) {
      return null;
    }

    const normalizedCheckpoint = normalizeCheckpoint(checkpoint);

    const savedAt = nowIso();
    const checkpointId = `checkpoint-${record.checkpoints.length + 1}`;

    record.checkpoints.push({
      checkpoint_id: checkpointId,
      saved_at: savedAt,
      ...normalizedCheckpoint,
    });

    record.latest_scene_packet = {
      campaign: record.campaign,
      time_place: {
        date: normalizedCheckpoint.scene_state.date,
        time: normalizedCheckpoint.scene_state.time,
        location: normalizedCheckpoint.scene_state.location,
      },
      immediate_situation: {
        summary: normalizedCheckpoint.scene_state.immediate_situation,
        visible_dangers: normalizedCheckpoint.scene_state.visible_dangers,
        present_npcs: normalizedCheckpoint.scene_state.present_npcs,
      },
      player_state: normalizedCheckpoint.player_state,
      npcs: normalizedCheckpoint.npc_updates,
      open_threads: normalizedCheckpoint.open_threads,
      canon_notes: normalizedCheckpoint.canon_continuity_notes,
      continuity_warnings: [],
    };

    await writeJson(this.campaignFile(campaignId), record);

    return {
      checkpoint_id: checkpointId,
      status: "saved",
      saved_at: savedAt,
    };
  }
}
