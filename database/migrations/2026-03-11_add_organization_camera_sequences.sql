-- Per-organization camera sequence state
-- Date: 2026-03-11

create table if not exists public.organization_camera_sequences (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_sequence integer not null default 0,
  updated_at timestamp with time zone not null default now(),
  constraint organization_camera_sequences_last_sequence_check
    check (last_sequence >= 0)
);

create index if not exists idx_organization_camera_sequences_updated_at
  on public.organization_camera_sequences (updated_at);