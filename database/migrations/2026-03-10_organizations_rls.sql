-- Enable RLS for organizations and organization_members
-- Date: 2026-03-10

alter table public.organizations
enable row level security;

alter table public.organization_members
enable row level security;

-- Organizations are visible to authenticated users
-- only if they are members of that organization.
create policy "read organizations for members"
on public.organizations
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = organizations.id
      and om.user_id = auth.uid()
  )
);

-- Users can read only their own membership rows.
create policy "read own organization memberships"
on public.organization_members
for select
to authenticated
using (
  user_id = auth.uid()
);