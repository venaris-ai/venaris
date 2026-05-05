create table if not exists public.revier_boundaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  revier_id uuid not null references public.reviers(id) on delete cascade,
  name text not null default 'Revierkontur',
  geometry jsonb not null,
  source text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint revier_boundaries_geometry_is_feature_or_collection
    check (
      geometry ? 'type'
      and geometry->>'type' in ('Feature', 'FeatureCollection')
    ),

  constraint revier_boundaries_one_per_revier
    unique (revier_id)
);

alter table public.revier_boundaries enable row level security;

create or replace function public.set_revier_boundaries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists revier_boundaries_set_updated_at
on public.revier_boundaries;

create trigger revier_boundaries_set_updated_at
before update on public.revier_boundaries
for each row
execute function public.set_revier_boundaries_updated_at();

create or replace function public.set_revier_boundary_organization_id()
returns trigger
language plpgsql
as $$
declare
  v_organization_id uuid;
begin
  select r.organization_id
  into v_organization_id
  from public.reviers r
  where r.id = new.revier_id;

  if v_organization_id is null then
    raise exception 'Revier % does not exist', new.revier_id;
  end if;

  if new.organization_id is distinct from v_organization_id then
    raise exception 'organization_id % does not match revier % organization_id %',
      new.organization_id,
      new.revier_id,
      v_organization_id;
  end if;

  return new;
end;
$$;

drop trigger if exists revier_boundaries_validate_organization_id
on public.revier_boundaries;

create trigger revier_boundaries_validate_organization_id
before insert or update of organization_id, revier_id
on public.revier_boundaries
for each row
execute function public.set_revier_boundary_organization_id();

drop policy if exists "revier_boundaries_org_members_select"
on public.revier_boundaries;

create policy "revier_boundaries_org_members_select"
on public.revier_boundaries
for select
to authenticated
using (
  private.is_org_member(organization_id)
);

drop policy if exists "revier_boundaries_org_admins_insert"
on public.revier_boundaries;

create policy "revier_boundaries_org_admins_insert"
on public.revier_boundaries
for insert
to authenticated
with check (
  private.is_org_admin(organization_id)
);

drop policy if exists "revier_boundaries_org_admins_update"
on public.revier_boundaries;

create policy "revier_boundaries_org_admins_update"
on public.revier_boundaries
for update
to authenticated
using (
  private.is_org_admin(organization_id)
)
with check (
  private.is_org_admin(organization_id)
);

drop policy if exists "revier_boundaries_org_admins_delete"
on public.revier_boundaries;

create policy "revier_boundaries_org_admins_delete"
on public.revier_boundaries
for delete
to authenticated
using (
  private.is_org_admin(organization_id)
);