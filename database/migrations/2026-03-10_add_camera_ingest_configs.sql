-- Add camera_ingest_configs
-- Technical ingest routing config per camera
-- Date: 2026-03-10

create table if not exists public.camera_ingest_configs (
  id uuid primary key default gen_random_uuid(),
  camera_id uuid not null references public.cameras(id) on delete cascade,
  method text not null,
  is_active boolean not null default true,

  -- SMTP-specific
  smtp_alias text null,

  -- FTP-specific
  ftp_username text null,
  ftp_inbox_path text null,

  -- Manual-specific
  manual_label text null,

  -- General
  notes text null,
  created_at timestamp with time zone not null default now(),

  constraint camera_ingest_configs_method_check
    check (method in ('smtp', 'ftp', 'manual')),

  constraint camera_ingest_configs_direction_check
    check (
      (method = 'smtp' and smtp_alias is not null)
      or (method = 'ftp' and ftp_username is not null)
      or (method = 'manual')
    )
);

create index if not exists idx_camera_ingest_configs_camera_id
  on public.camera_ingest_configs (camera_id);

create index if not exists idx_camera_ingest_configs_method
  on public.camera_ingest_configs (method);

create unique index if not exists idx_camera_ingest_configs_one_active_per_camera_method
  on public.camera_ingest_configs (camera_id, method)
  where is_active = true;