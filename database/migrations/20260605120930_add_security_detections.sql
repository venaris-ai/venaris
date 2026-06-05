-- Add optional camera security detections feature.
-- Phase 1 only: schema, no worker/app behavior changes.

alter table public.organizations
  add column if not exists security_detections_enabled boolean not null default false,
  add column if not exists security_detections_accepted_at timestamptz null,
  add column if not exists security_detections_accepted_by uuid null references auth.users(id);

create table if not exists public.security_detections (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null references public.organizations(id),
  revier_id uuid references public.reviers(id),
  camera_id uuid not null references public.cameras(id),
  asset_id uuid not null references public.assets(id),

  detected_class text not null check (detected_class in ('human', 'vehicle')),
  score real null,

  captured_at timestamptz null,
  created_at timestamptz not null default now(),
  delete_after timestamptz not null
);

create index if not exists security_detections_org_captured_idx
  on public.security_detections (organization_id, captured_at desc);

create index if not exists security_detections_camera_captured_idx
  on public.security_detections (camera_id, captured_at desc);

create index if not exists security_detections_delete_after_idx
  on public.security_detections (delete_after);

create unique index if not exists security_detections_asset_class_uidx
  on public.security_detections (asset_id, detected_class);

alter table public.security_detections enable row level security;

drop policy if exists "deny all (anon/auth)" on public.security_detections;

create policy "deny all (anon/auth)"
  on public.security_detections
  for all
  to anon, authenticated
  using (false)
  with check (false);
