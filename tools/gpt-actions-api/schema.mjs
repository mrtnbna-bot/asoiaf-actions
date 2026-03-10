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
];
