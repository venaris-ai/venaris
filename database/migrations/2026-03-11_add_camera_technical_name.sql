-- Venaris architecture milestone:
-- Canonical camera technical_name introduced.
-- camera_ingest_configs becomes provisioning routing truth.
-- cameras.import_method and cameras.ingest_token remain legacy for compatibility.

-- Add canonical technical camera name
-- Date: 2026-03-11

alter table public.cameras
  add column if not exists technical_name text;

-- Backfill from existing active ingest configs
-- Priority:
-- 1) manual_label
-- 2) smtp_alias local-part
-- 3) ftp_username
update public.cameras c
set technical_name = src.technical_name
from (
  select
    cic.camera_id,
    coalesce(
      nullif(cic.manual_label, ''),
      nullif(split_part(cic.smtp_alias, '@', 1), ''),
      nullif(cic.ftp_username, '')
    ) as technical_name
  from public.camera_ingest_configs cic
  where cic.is_active = true
) src
where src.camera_id = c.id
  and src.technical_name is not null
  and c.technical_name is null;

-- Guardrail: only allow normalized technical names
alter table public.cameras
  drop constraint if exists cameras_technical_name_format_check;

alter table public.cameras
  add constraint cameras_technical_name_format_check
  check (
    technical_name is null
    or technical_name ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  );

-- Unique canonical name
create unique index if not exists idx_cameras_technical_name
  on public.cameras (technical_name)
  where technical_name is not null;