-- Finalize canonical technical camera name
-- Run only after backfill validation
-- Date: 2026-03-11

alter table public.cameras
  alter column technical_name set not null;