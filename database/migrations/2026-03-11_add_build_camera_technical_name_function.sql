-- Build canonical camera technical name
-- Date: 2026-03-11

create or replace function public.build_camera_technical_name(
  p_organization_slug text,
  p_sequence integer
)
returns text
language sql
immutable
as $$
  select lower(p_organization_slug) || '-cam-' || lpad(p_sequence::text, 4, '0');
$$;