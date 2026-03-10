-- Seed organizations and prepare initial revier assignment
-- Date: 2026-03-10

insert into public.organizations (name, slug, kind, status, notes)
values
  ('Venaris Demo', 'demo', 'demo', 'active', 'Seed demo tenant with 5 seed cameras'),
  ('Venaris Test', 'test', 'test', 'active', 'Internal test tenant for current real/test cameras'),
  ('Revier Heubachwiesen', 'heubachwiesen', 'customer', 'active', 'Future live tenant; cameras will be added later')
on conflict (slug) do update
set
  name = excluded.name,
  kind = excluded.kind,
  status = excluded.status,
  notes = excluded.notes;

insert into public.reviers (name, region, area_ha, country, organization_id, notes)
select
  'Heubachwiesen',
  null,
  null,
  'DE',
  o.id,
  'Prepared on 2026-03-10; no cameras assigned yet'
from public.organizations o
where o.slug = 'heubachwiesen'
  and not exists (
    select 1
    from public.reviers r
    where lower(r.name) = 'heubachwiesen'
  );