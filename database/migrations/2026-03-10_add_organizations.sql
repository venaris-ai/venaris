-- Add organizations and organization membership
-- Date: 2026-03-10

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  kind text not null default 'customer',
  status text not null default 'active',
  owner_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  notes text null,
  constraint organizations_kind_check
    check (kind in ('demo', 'test', 'customer')),
  constraint organizations_status_check
    check (status in ('active', 'inactive', 'archived'))
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamp with time zone not null default now(),
  primary key (organization_id, user_id),
  constraint organization_members_role_check
    check (role in ('owner', 'admin', 'member', 'viewer'))
);

alter table public.reviers
  add column if not exists organization_id uuid null references public.organizations(id) on delete set null;

create index if not exists idx_reviers_organization_id
  on public.reviers (organization_id);

create index if not exists idx_organization_members_user_id
  on public.organization_members (user_id);

create index if not exists idx_organization_members_organization_id
  on public.organization_members (organization_id);