-- Enable RLS for camera_ingest_configs
-- Date: 2026-03-10

alter table public.camera_ingest_configs
enable row level security;

-- Users can read ingest configs only for cameras in reviers
-- that belong to organizations where they are members.
create policy "read camera ingest configs for organization members"
on public.camera_ingest_configs
for select
to authenticated
using (
  exists (
    select 1
    from public.cameras c
    join public.reviers r
      on r.id = c.revier_id
    join public.organization_members om
      on om.organization_id = r.organization_id
    where c.id = camera_ingest_configs.camera_id
      and om.user_id = auth.uid()
  )
);