-- Extend camera_ingest_configs for camera-specific routing
-- Date: 2026-03-10

alter table public.camera_ingest_configs
  add column if not exists ingest_token text,
  add column if not exists vendor text,
  add column if not exists external_key text;

-- Helpful uniqueness constraints for active configs
create unique index if not exists idx_camera_ingest_configs_active_smtp_alias
  on public.camera_ingest_configs (smtp_alias)
  where is_active = true and smtp_alias is not null;

create unique index if not exists idx_camera_ingest_configs_active_ftp_username
  on public.camera_ingest_configs (ftp_username)
  where is_active = true and ftp_username is not null;

create unique index if not exists idx_camera_ingest_configs_active_ingest_token
  on public.camera_ingest_configs (ingest_token)
  where is_active = true and ingest_token is not null;

create unique index if not exists idx_camera_ingest_configs_active_manual_label
  on public.camera_ingest_configs (manual_label)
  where is_active = true and manual_label is not null;

create index if not exists idx_camera_ingest_configs_vendor
  on public.camera_ingest_configs (vendor);