-- Extend reviers for product-ready configuration
-- Date: 2026-03-10

alter table public.reviers
  add column if not exists country text default 'DE',
  add column if not exists boundary_geojson jsonb,
  add column if not exists notes text;

-- Optional sanity check for area_ha
alter table public.reviers
  drop constraint if exists reviers_area_ha_check;

alter table public.reviers
  add constraint reviers_area_ha_check
  check (
    area_ha is null
    or area_ha >= 0
  );