-- database/migrations/20260623_materializer_claiming.sql
-- Materializer claim/lease queue for event-materializer-v1.
-- Demo organizations are excluded in the claim RPC and remain a seeded/backfilled special case.

create table if not exists public.materializer_asset_claims (
  asset_id uuid not null references public.assets(id) on delete cascade,
  materializer_version text not null,
  run_id uuid null references public.event_materializer_runs(id) on delete set null,
  claimed_by text not null,
  claimed_at timestamptz not null default now(),
  claim_expires_at timestamptz not null,
  completed_at timestamptz null,
  failed_at timestamptz null,
  last_error text null,
  attempt_count integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (asset_id, materializer_version),
  constraint materializer_asset_claims_attempt_count_check check (attempt_count >= 1),
  constraint materializer_asset_claims_claim_window_check check (claim_expires_at >= claimed_at or completed_at is not null)
);

create index if not exists materializer_asset_claims_version_expires_idx
  on public.materializer_asset_claims (materializer_version, claim_expires_at)
  where completed_at is null;

create index if not exists materializer_asset_claims_run_idx
  on public.materializer_asset_claims (run_id)
  where run_id is not null;

create index if not exists materializer_asset_claims_completed_idx
  on public.materializer_asset_claims (materializer_version, completed_at)
  where completed_at is not null;

alter table public.materializer_asset_claims enable row level security;

drop policy if exists materializer_asset_claims_no_direct_client_access
  on public.materializer_asset_claims;

create policy materializer_asset_claims_no_direct_client_access
  on public.materializer_asset_claims
  for all
  to anon, authenticated
  using (false)
  with check (false);

create or replace function public.get_materializer_pending_assets_dynamic(
  p_materializer_version text default 'event-materializer-v1',
  p_limit integer default 300,
  p_window_minutes integer default 20,
  p_since timestamptz default null,
  p_excluded_org_slugs text[] default array['demo']::text[]
)
returns table (
  id uuid,
  camera_id uuid,
  captured_at timestamptz,
  created_at timestamptz,
  relevant boolean,
  relevant_user boolean,
  empty boolean,
  status text,
  processed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with candidate_assets as (
    select
      a.id,
      a.camera_id,
      a.captured_at,
      a.created_at,
      a.relevant,
      a.relevant_user,
      a.empty,
      a.status::text as status,
      a.processed_at,
      coalesce(a.captured_at, a.created_at) as anchor_at
    from public.assets a
    join public.cameras c on c.id = a.camera_id
    join public.organizations o on o.id = c.organization_id
    left join public.materializer_asset_claims mac
      on mac.asset_id = a.id
     and mac.materializer_version = p_materializer_version
    where o.slug is not null
      and o.slug <> ''
      and coalesce(o.is_demo, false) = false
      and not (o.slug = any(coalesce(p_excluded_org_slugs, array[]::text[])))
      and a.status = 'processed'
      and coalesce(a.empty, false) = false
      and coalesce(a.relevant_user, a.relevant) = true
      and coalesce(a.captured_at, a.created_at) is not null
      and coalesce(a.captured_at, a.created_at) <= now() - make_interval(mins => greatest(1, p_window_minutes))
      and (p_since is null or coalesce(a.captured_at, a.created_at) >= p_since)
      and exists (
        select 1
        from public.detections d
        where d.asset_id = a.id
          and d.label = 'animal'
      )
      and not exists (
        select 1
        from public.materialized_event_assets mea
        where mea.asset_id = a.id
      )
      and (
        mac.asset_id is null
        or (
          mac.completed_at is null
          and mac.claim_expires_at <= now()
        )
      )
      -- Conservative safety: do not claim anything for a camera while that camera
      -- has a relevant non-empty processed asset inside the materializer window.
      -- This preserves the "20 minutes without a new image" event-close rule.
      and not exists (
        select 1
        from public.assets recent
        where recent.camera_id = a.camera_id
          and recent.status = 'processed'
          and coalesce(recent.empty, false) = false
          and coalesce(recent.relevant_user, recent.relevant) = true
          and coalesce(recent.captured_at, recent.created_at) > now() - make_interval(mins => greatest(1, p_window_minutes))
      )
    order by anchor_at asc, a.id asc
    limit greatest(1, p_limit)
  )
  select
    ca.id,
    ca.camera_id,
    ca.captured_at,
    ca.created_at,
    ca.relevant,
    ca.relevant_user,
    ca.empty,
    ca.status,
    ca.processed_at
  from candidate_assets ca
  order by ca.anchor_at asc, ca.id asc;
$$;

create or replace function public.claim_materializer_pending_assets(
  p_materializer_version text default 'event-materializer-v1',
  p_limit integer default 300,
  p_window_minutes integer default 20,
  p_since timestamptz default null,
  p_excluded_org_slugs text[] default array['demo']::text[],
  p_claimed_by text default 'event-materializer',
  p_run_id uuid default null,
  p_lease_minutes integer default 30
)
returns table (
  id uuid,
  camera_id uuid,
  captured_at timestamptz,
  created_at timestamptz,
  relevant boolean,
  relevant_user boolean,
  empty boolean,
  status text,
  processed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate_assets as (
    select
      a.id,
      a.camera_id,
      a.captured_at,
      a.created_at,
      a.relevant,
      a.relevant_user,
      a.empty,
      a.status::text as status,
      a.processed_at,
      coalesce(a.captured_at, a.created_at) as anchor_at
    from public.assets a
    join public.cameras c on c.id = a.camera_id
    join public.organizations o on o.id = c.organization_id
    left join public.materializer_asset_claims mac
      on mac.asset_id = a.id
     and mac.materializer_version = p_materializer_version
    where o.slug is not null
      and o.slug <> ''
      and coalesce(o.is_demo, false) = false
      and not (o.slug = any(coalesce(p_excluded_org_slugs, array[]::text[])))
      and a.status = 'processed'
      and coalesce(a.empty, false) = false
      and coalesce(a.relevant_user, a.relevant) = true
      and coalesce(a.captured_at, a.created_at) is not null
      and coalesce(a.captured_at, a.created_at) <= now() - make_interval(mins => greatest(1, p_window_minutes))
      and (p_since is null or coalesce(a.captured_at, a.created_at) >= p_since)
      and exists (
        select 1
        from public.detections d
        where d.asset_id = a.id
          and d.label = 'animal'
      )
      and not exists (
        select 1
        from public.materialized_event_assets mea
        where mea.asset_id = a.id
      )
      and (
        mac.asset_id is null
        or (
          mac.completed_at is null
          and mac.claim_expires_at <= now()
        )
      )
      and not exists (
        select 1
        from public.assets recent
        where recent.camera_id = a.camera_id
          and recent.status = 'processed'
          and coalesce(recent.empty, false) = false
          and coalesce(recent.relevant_user, recent.relevant) = true
          and coalesce(recent.captured_at, recent.created_at) > now() - make_interval(mins => greatest(1, p_window_minutes))
      )
    order by anchor_at asc, a.id asc
    limit greatest(1, p_limit)
    for update of a skip locked
  ), claimed as (
    insert into public.materializer_asset_claims (
      asset_id,
      materializer_version,
      run_id,
      claimed_by,
      claimed_at,
      claim_expires_at,
      completed_at,
      failed_at,
      last_error,
      attempt_count,
      updated_at
    )
    select
      ca.id,
      p_materializer_version,
      p_run_id,
      coalesce(nullif(p_claimed_by, ''), 'event-materializer'),
      now(),
      now() + make_interval(mins => greatest(1, p_lease_minutes)),
      null::timestamptz,
      null::timestamptz,
      null::text,
      1,
      now()
    from candidate_assets ca
    on conflict (asset_id, materializer_version)
    do update set
      run_id = excluded.run_id,
      claimed_by = excluded.claimed_by,
      claimed_at = excluded.claimed_at,
      claim_expires_at = excluded.claim_expires_at,
      completed_at = null,
      failed_at = null,
      last_error = null,
      attempt_count = public.materializer_asset_claims.attempt_count + 1,
      updated_at = now()
    where public.materializer_asset_claims.completed_at is null
      and public.materializer_asset_claims.claim_expires_at <= now()
    returning asset_id
  )
  select
    ca.id,
    ca.camera_id,
    ca.captured_at,
    ca.created_at,
    ca.relevant,
    ca.relevant_user,
    ca.empty,
    ca.status,
    ca.processed_at
  from candidate_assets ca
  join claimed cl on cl.asset_id = ca.id
  order by ca.anchor_at asc, ca.id asc;
end;
$$;

create or replace function public.complete_materializer_asset_claims(
  p_materializer_version text,
  p_asset_ids uuid[],
  p_run_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_asset_ids is null or cardinality(p_asset_ids) = 0 then
    return 0;
  end if;

  update public.materializer_asset_claims mac
  set
    completed_at = now(),
    failed_at = null,
    last_error = null,
    claim_expires_at = now(),
    updated_at = now()
  where mac.materializer_version = p_materializer_version
    and mac.asset_id = any(p_asset_ids)
    and (p_run_id is null or mac.run_id = p_run_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.release_materializer_asset_claims(
  p_materializer_version text,
  p_asset_ids uuid[],
  p_run_id uuid default null,
  p_reason text default 'released_without_materialized_event'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_asset_ids is null or cardinality(p_asset_ids) = 0 then
    return 0;
  end if;

  update public.materializer_asset_claims mac
  set
    claim_expires_at = now(),
    last_error = p_reason,
    updated_at = now()
  where mac.materializer_version = p_materializer_version
    and mac.asset_id = any(p_asset_ids)
    and mac.completed_at is null
    and (p_run_id is null or mac.run_id = p_run_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.fail_materializer_asset_claims(
  p_materializer_version text,
  p_asset_ids uuid[],
  p_run_id uuid default null,
  p_error text default null,
  p_retry_after_minutes integer default 10
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_asset_ids is null or cardinality(p_asset_ids) = 0 then
    return 0;
  end if;

  update public.materializer_asset_claims mac
  set
    failed_at = now(),
    last_error = left(coalesce(p_error, 'materializer_failed'), 2000),
    claim_expires_at = now() + make_interval(mins => greatest(1, p_retry_after_minutes)),
    updated_at = now()
  where mac.materializer_version = p_materializer_version
    and mac.asset_id = any(p_asset_ids)
    and mac.completed_at is null
    and (p_run_id is null or mac.run_id = p_run_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
