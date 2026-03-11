export const SCHEMA_STATEMENTS = [
  `
    create table if not exists campaigns (
      campaign_id text primary key,
      name text not null,
      canon_mode text,
      era text,
      play_mode text,
      player_character_name text,
      campaign_charter text not null default '',
      status text not null default 'active',
      source_campaign_id text,
      created_at timestamptz not null,
      updated_at timestamptz not null
    );
  `,
  `
    create table if not exists scene_packets (
      campaign_id text primary key references campaigns(campaign_id) on delete cascade,
      packet jsonb not null,
      updated_at timestamptz not null
    );
  `,
  `
    create table if not exists checkpoints (
      checkpoint_id text primary key,
      campaign_id text not null references campaigns(campaign_id) on delete cascade,
      ordinal integer not null,
      payload jsonb not null,
      saved_at timestamptz not null
    );
  `,
  `
    create unique index if not exists checkpoints_campaign_id_ordinal_idx
    on checkpoints(campaign_id, ordinal);
  `,
  `
    create table if not exists continuity_state (
      campaign_id text primary key references campaigns(campaign_id) on delete cascade,
      closed_doors jsonb not null default '[]'::jsonb,
      contradiction_notes jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null
    );
  `,
  `
    create table if not exists canon_cache (
      query_key text primary key,
      query text not null,
      query_type text not null,
      result jsonb not null,
      cached_at timestamptz not null
    );
  `,
  `
    create table if not exists campaign_timeline (
      campaign_id text primary key references campaigns(campaign_id) on delete cascade,
      current_day integer not null default 1,
      current_hour integer not null default 0,
      current_location text,
      updated_at timestamptz not null
    );
  `,
  `
    create table if not exists npcs (
      campaign_id text not null references campaigns(campaign_id) on delete cascade,
      npc_id text not null,
      name text not null,
      role text,
      location text,
      state jsonb not null,
      updated_at timestamptz not null,
      primary key (campaign_id, npc_id)
    );
  `,
  `
    create table if not exists npc_relationships (
      campaign_id text not null references campaigns(campaign_id) on delete cascade,
      source_npc_id text not null,
      target_key text not null,
      target_type text not null,
      trust double precision not null default 0,
      fear double precision not null default 0,
      desire double precision not null default 0,
      leverage_over double precision not null default 0,
      leverage_under double precision not null default 0,
      volatility double precision not null default 0,
      debts jsonb not null default '[]'::jsonb,
      promises jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null,
      primary key (campaign_id, source_npc_id, target_key)
    );
  `,
  `
    create table if not exists campaign_events (
      event_id text primary key,
      campaign_id text not null references campaigns(campaign_id) on delete cascade,
      event_type text not null,
      summary text not null,
      location text,
      actors jsonb not null default '[]'::jsonb,
      witnesses jsonb not null default '[]'::jsonb,
      effects jsonb not null default '[]'::jsonb,
      followups jsonb not null default '[]'::jsonb,
      player_visible boolean not null default true,
      created_at timestamptz not null
    );
  `,
];
