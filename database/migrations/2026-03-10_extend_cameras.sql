-- Extend cameras for product-ready setup and mapping
-- Date: 2026-03-10

alter table public.cameras
  add column if not exists brand text,
  add column if not exists model text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists direction_deg integer,
  add column if not exists is_active boolean not null default true,
  add column if not exists installed_at timestamp with time zone,
  add column if not exists notes text;

-- Basic sanity check for camera direction
alter table public.cameras
  drop constraint if exists cameras_direction_deg_check;

alter table public.cameras
  add constraint cameras_direction_deg_check
  check (
    direction_deg is null
    or (direction_deg >= 0 and direction_deg < 360)
  );