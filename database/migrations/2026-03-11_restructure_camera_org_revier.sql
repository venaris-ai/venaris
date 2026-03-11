-- Restructure camera ownership:
-- cameras belong administratively to organizations
-- and may be assigned operationally to a revier
-- Date: 2026-03-11
--
-- Important:
-- This migration is written to be repo-sync friendly after parts of the change
-- may already have been applied manually in Supabase.

-- 1) Add direct administrative organization link to cameras
alter table public.cameras
  add column if not exists organization_id uuid;

-- 2) Backfill organization_id from existing revier -> organization relation
update public.cameras c
set organization_id = r.organization_id
from public.reviers r
where r.id = c.revier_id
  and c.organization_id is null;

-- 3) Add index for queries / future RLS
create index if not exists idx_cameras_organization_id
  on public.cameras (organization_id);

-- 4) Ensure NOT NULL once backfill is complete
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cameras'
      and column_name = 'organization_id'
      and is_nullable = 'YES'
  ) then
    alter table public.cameras
      alter column organization_id set not null;
  end if;
end
$$;

-- 5) Ensure FK to organizations exists with desired delete behavior
alter table public.cameras
  drop constraint if exists cameras_organization_fk;

alter table public.cameras
  add constraint cameras_organization_fk
  foreign key (organization_id)
  references public.organizations(id)
  on delete cascade;

-- 6) Revier remains the optional operational assignment
--    Replace strict revier FK with nullable/optional semantics
alter table public.cameras
  drop constraint if exists cameras_revier_id_fkey;

alter table public.cameras
  add constraint cameras_revier_id_fkey
  foreign key (revier_id)
  references public.reviers(id)
  on delete set null;