-- Drop legacy revier boundary column.
-- Current boundary storage is public.revier_boundaries.geometry.

alter table public.reviers
  drop column if exists boundary_geojson;