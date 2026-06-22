-- database/migrations/20260622_event_materializer_popsim.sql
-- Venaris Event Materializer + event-level PopSim source
-- Live applied on 2026-06-22; committed as reproducible migration baseline.
--
-- Purpose:
-- 1) Introduce event-level materialized events as the fachliche event truth.
-- 2) Keep legacy event IDs usable as route compatibility.
-- 3) Provide normal/review event views:
--    - normal: relevant, species present, species <> other
--    - review: relevant, species = other
-- 4) Move PopSim event source from legacy events/top_species/top_count
--    to materialized event-level species/count.
--
-- Notes:
-- - Service-role/server code may read/write these tables.
-- - Direct anon/authenticated client access is blocked by RLS policies.
-- - PopSim compute functions are patched from their existing definitions so this
--   migration applies cleanly after the previous legacy PopSim migrations.

begin;

create table if not exists public.event_materializer_runs (
  id uuid not null default gen_random_uuid(),
  materializer_version text not null,
  mode text not null default 'shadow'::text,
  status text not null default 'running'::text,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  scanned_assets integer not null default 0,
  materialized_events integer not null default 0,
  error text null,
  created_at timestamptz not null default now(),
  constraint event_materializer_runs_pkey primary key (id),
  constraint event_materializer_runs_mode_check
    check (mode = any (array['dry_run'::text, 'shadow'::text, 'active'::text])),
  constraint event_materializer_runs_status_check
    check (status = any (array['running'::text, 'success'::text, 'failed'::text]))
);

create table if not exists public.materialized_events (
  id uuid not null default gen_random_uuid(),
  camera_id uuid not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  closed_at timestamptz not null,
  window_minutes integer not null default 20,
  asset_count integer not null default 0,

  event_species_auto public.taxonomy_species_v1 null,
  event_species_user public.taxonomy_species_v1 null,
  event_species_effective public.taxonomy_species_v1
    generated always as (coalesce(event_species_user, event_species_auto)) stored,
  event_species_score real not null default 0,
  event_species_margin real null,
  event_species_evidence jsonb not null default '{}'::jsonb,

  event_animal_count_auto integer null,
  event_animal_count_user integer null,
  event_animal_count_effective integer
    generated always as (coalesce(event_animal_count_user, event_animal_count_auto)) stored,
  event_animal_count_confidence real null,
  event_animal_count_evidence jsonb not null default '{}'::jsonb,

  materializer_version text not null,
  mode text not null default 'shadow'::text,
  materialized_at timestamptz not null default now(),
  legacy_event_ids uuid[] not null default '{}'::uuid[],

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  event_relevant_auto boolean not null default true,
  event_relevant_user boolean null,
  event_relevant_effective boolean
    generated always as (coalesce(event_relevant_user, event_relevant_auto)) stored,

  constraint materialized_events_pkey primary key (id),
  constraint materialized_events_camera_id_fkey
    foreign key (camera_id) references public.cameras(id) on delete cascade,
  constraint materialized_events_camera_id_start_at_end_at_materializer__key
    unique (camera_id, start_at, end_at, materializer_version),
  constraint materialized_events_time_check check (end_at >= start_at),
  constraint materialized_events_window_minutes_check check (window_minutes > 0),
  constraint materialized_events_asset_count_check check (asset_count >= 0),
  constraint materialized_events_species_score_check
    check (event_species_score >= 0::double precision and event_species_score <= 1::double precision),
  constraint materialized_events_species_margin_check
    check (
      event_species_margin is null
      or (
        event_species_margin >= 0::double precision
        and event_species_margin <= 1::double precision
      )
    ),
  constraint materialized_events_animal_count_auto_check
    check (event_animal_count_auto is null or event_animal_count_auto >= 0),
  constraint materialized_events_animal_count_user_check
    check (event_animal_count_user is null or event_animal_count_user >= 0),
  constraint materialized_events_animal_count_confidence_check
    check (
      event_animal_count_confidence is null
      or (
        event_animal_count_confidence >= 0::double precision
        and event_animal_count_confidence <= 1::double precision
      )
    ),
  constraint materialized_events_mode_check
    check (mode = any (array['shadow'::text, 'active'::text]))
);

create table if not exists public.materialized_event_assets (
  materialized_event_id uuid not null,
  asset_id uuid not null,
  asset_captured_at timestamptz not null,
  image_species_used public.taxonomy_species_v1 null,
  image_species_score real null,
  image_animal_count integer null,
  image_pick_reason text null,
  image_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint materialized_event_assets_pkey
    primary key (materialized_event_id, asset_id),
  constraint materialized_event_assets_materialized_event_id_fkey
    foreign key (materialized_event_id) references public.materialized_events(id) on delete cascade,
  constraint materialized_event_assets_asset_id_fkey
    foreign key (asset_id) references public.assets(id) on delete cascade,
  constraint materialized_event_assets_image_species_score_check
    check (
      image_species_score is null
      or (
        image_species_score >= 0::double precision
        and image_species_score <= 1::double precision
      )
    ),
  constraint materialized_event_assets_image_animal_count_check
    check (image_animal_count is null or image_animal_count >= 0)
);

create index if not exists event_materializer_runs_started_idx
  on public.event_materializer_runs using btree (started_at desc);

create index if not exists materialized_events_camera_start_idx
  on public.materialized_events using btree (camera_id, start_at desc);

create index if not exists materialized_events_relevant_effective_idx
  on public.materialized_events using btree (event_relevant_effective);

create index if not exists materialized_events_species_effective_idx
  on public.materialized_events using btree (event_species_effective);

create index if not exists materialized_events_version_idx
  on public.materialized_events using btree (materializer_version, mode);

create index if not exists idx_materialized_events_version_id
  on public.materialized_events using btree (materializer_version, id);

create index if not exists materialized_event_assets_event_idx
  on public.materialized_event_assets using btree (materialized_event_id);

create index if not exists materialized_event_assets_asset_idx
  on public.materialized_event_assets using btree (asset_id);

create index if not exists idx_materialized_event_assets_asset_id
  on public.materialized_event_assets using btree (asset_id);

alter table public.event_materializer_runs enable row level security;
alter table public.materialized_events enable row level security;
alter table public.materialized_event_assets enable row level security;

drop policy if exists event_materializer_runs_no_direct_client_access
  on public.event_materializer_runs;

create policy event_materializer_runs_no_direct_client_access
  on public.event_materializer_runs
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists materialized_events_no_direct_client_access
  on public.materialized_events;

create policy materialized_events_no_direct_client_access
  on public.materialized_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists materialized_event_assets_no_direct_client_access
  on public.materialized_event_assets;

create policy materialized_event_assets_no_direct_client_access
  on public.materialized_event_assets
  for all
  to anon, authenticated
  using (false)
  with check (false);

create or replace view public.materialized_events_normal_v as
select
  me.id,
  o.id as organization_id,
  o.name as organization_name,
  o.slug as organization_slug,
  c.id as camera_id,
  c.name as camera_name,
  c.revier_id,
  me.start_at,
  me.end_at,
  me.closed_at,
  me.window_minutes,
  me.asset_count,
  me.event_species_auto,
  me.event_species_user,
  me.event_species_effective,
  me.event_species_score,
  me.event_species_margin,
  me.event_species_evidence,
  me.event_animal_count_auto,
  me.event_animal_count_user,
  me.event_animal_count_effective,
  me.event_animal_count_confidence,
  me.event_animal_count_evidence,
  me.event_relevant_auto,
  me.event_relevant_user,
  me.event_relevant_effective,
  me.materializer_version,
  me.mode,
  me.materialized_at,
  me.legacy_event_ids,
  me.created_at,
  me.updated_at
from public.materialized_events me
join public.cameras c on c.id = me.camera_id
join public.organizations o on o.id = c.organization_id
where me.event_relevant_effective = true
  and me.event_species_effective is not null
  and me.event_species_effective <> 'other'::public.taxonomy_species_v1;

create or replace view public.materialized_events_review_v as
select
  me.id,
  o.id as organization_id,
  o.name as organization_name,
  o.slug as organization_slug,
  c.id as camera_id,
  c.name as camera_name,
  c.revier_id,
  me.start_at,
  me.end_at,
  me.closed_at,
  me.window_minutes,
  me.asset_count,
  me.event_species_auto,
  me.event_species_user,
  me.event_species_effective,
  me.event_species_score,
  me.event_species_margin,
  me.event_species_evidence,
  me.event_animal_count_auto,
  me.event_animal_count_user,
  me.event_animal_count_effective,
  me.event_animal_count_confidence,
  me.event_animal_count_evidence,
  me.event_relevant_auto,
  me.event_relevant_user,
  me.event_relevant_effective,
  me.materializer_version,
  me.mode,
  me.materialized_at,
  me.legacy_event_ids,
  me.created_at,
  me.updated_at
from public.materialized_events me
join public.cameras c on c.id = me.camera_id
join public.organizations o on o.id = c.organization_id
where me.event_relevant_effective = true
  and me.event_species_effective = 'other'::public.taxonomy_species_v1;

create or replace view public.population_event_source_v as
select
  me.id,
  me.camera_id,
  me.start_at,
  me.end_at,
  me.event_species_effective as species,
  coalesce(me.event_animal_count_effective, 1)::integer as animal_count,
  me.event_species_score as score,
  me.materializer_version,
  me.materialized_at
from public.materialized_events_normal_v me;

comment on view public.population_event_source_v is
  'PopSim event source backed by materialized event-level species/count. Excludes other and non-relevant events via materialized_events_normal_v.';

create or replace function public.get_materializer_pending_assets(
  p_org_slugs text[],
  p_materializer_version text,
  p_limit integer default 300,
  p_window_minutes integer default 20,
  p_since timestamptz default null::timestamptz
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
  processed_at timestamptz,
  anchor_at timestamptz
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    a.id,
    a.camera_id,
    a.captured_at,
    a.created_at,
    a.relevant,
    a.relevant_user,
    a.empty,
    a.status,
    a.processed_at,
    coalesce(a.captured_at, a.created_at) as anchor_at
  from public.assets a
  join public.cameras c on c.id = a.camera_id
  join public.organizations o on o.id = c.organization_id
  where o.slug = any(p_org_slugs)
    and a.status = 'processed'
    and a.empty = false
    and coalesce(a.relevant_user, a.relevant) = true
    and coalesce(a.captured_at, a.created_at) is not null
    and coalesce(a.captured_at, a.created_at)
      <= now() - make_interval(mins => p_window_minutes)
    and (p_since is null or coalesce(a.captured_at, a.created_at) >= p_since)
    and exists (
      select 1
      from public.detections d
      where d.asset_id = a.id
        and d.label = 'animal'
        and (
          d.species is not null
          or d.species_user is not null
          or d.meta ? 'species'
        )
    )
    and not exists (
      select 1
      from public.materialized_event_assets mea
      join public.materialized_events me
        on me.id = mea.materialized_event_id
      where mea.asset_id = a.id
        and me.materializer_version = p_materializer_version
    )
  order by coalesce(a.captured_at, a.created_at) asc, a.id asc
  limit greatest(1, p_limit);
$function$;

create or replace function public.compute_population_for_revier(p_revier_id uuid)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_species public.taxonomy_species_v1;
  v_model_family text;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  v_window_start := current_date - interval '12 months';
  v_window_end := current_date + interval '1 day';

  for v_species, v_model_family in
    select
      m.species,
      m.model_family
    from public.species_population_model_mapping m
    where exists (
      select 1
      from public.population_event_source_v e
      join public.cameras c
        on c.id = e.camera_id
      where c.revier_id = p_revier_id
        and e.species = m.species
        and e.start_at >= v_window_start
        and e.start_at < v_window_end
    )
    order by m.species
  loop
    if v_species = 'wolf'::public.taxonomy_species_v1 then
      perform public.compute_population_wolf(p_revier_id, v_species);

    elsif v_model_family = 'territorial_density' then
      perform public.compute_population_territorial_density(p_revier_id, v_species);

    elsif v_model_family = 'group_density' then
      perform public.compute_population_group_density(p_revier_id, v_species);

    elsif v_model_family = 'seasonal_migration_presence' then
      perform public.compute_population_seasonal_migration_presence(p_revier_id, v_species);

    elsif v_model_family = 'occupancy_presence' then
      perform public.compute_population_occupancy_presence(p_revier_id, v_species);

    elsif v_model_family = 'diurnal_surface_activity' then
      perform public.compute_population_diurnal_surface_activity(p_revier_id, v_species);

    elsif v_model_family = 'sparse_large_presence' then
      perform public.compute_population_sparse_large_presence(p_revier_id, v_species);

    else
      raise notice 'No compute model for species %', v_species;
    end if;
  end loop;
end;
$function$;

do $migration$
declare
  r record;
  v_sql text;
begin
  for r in
    select
      p.proname,
      pg_get_functiondef(p.oid) as function_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'compute_population_diurnal_surface_activity',
        'compute_population_group_density',
        'compute_population_occupancy_presence',
        'compute_population_seasonal_migration_presence',
        'compute_population_sparse_large_presence',
        'compute_population_territorial_density',
        'compute_population_wolf'
      )
    order by p.proname
  loop
    v_sql := r.function_definition;

    v_sql := replace(
      v_sql,
      'from public.events e',
      'from public.population_event_source_v e'
    );

    v_sql := replace(
      v_sql,
      'FROM public.events e',
      'FROM public.population_event_source_v e'
    );

    v_sql := replace(v_sql, 'e.top_species', 'e.species');
    v_sql := replace(v_sql, 'e.top_count', 'e.animal_count');

    execute v_sql;

    raise notice 'Recreated % using population_event_source_v', r.proname;
  end loop;
end
$migration$;

create or replace function public.refresh_population_estimate_roe_deer(
  p_revier_id uuid
)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.compute_population_territorial_density(
    p_revier_id,
    'roe_deer'::public.taxonomy_species_v1
  );
end;
$function$;

create or replace function public.refresh_population_estimates_for_revier(
  p_revier_id uuid
)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_species public.taxonomy_species_v1;
  v_model_family text;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  v_window_start := current_date - interval '12 months';
  v_window_end := current_date + interval '1 day';

  -- Clear the current modeled revier snapshot first. Otherwise stale rows from
  -- older legacy-event based runs can remain when no new materialized source
  -- events exist for a species/revier.
  delete from public.population_estimates
  where revier_id = p_revier_id
    and estimate_date = current_date;

  for v_species, v_model_family in
    select
      m.species,
      m.model_family
    from public.species_population_model_mapping m
    where exists (
      select 1
      from public.population_event_source_v e
      join public.cameras c
        on c.id = e.camera_id
      where c.revier_id = p_revier_id
        and e.species = m.species
        and e.start_at >= v_window_start
        and e.start_at < v_window_end
    )
    order by m.species
  loop
    if v_species = 'wolf'::public.taxonomy_species_v1 then
      perform public.compute_population_wolf(p_revier_id, v_species);

    elsif v_model_family = 'territorial_density' then
      perform public.compute_population_territorial_density(p_revier_id, v_species);

    elsif v_model_family = 'group_density' then
      perform public.compute_population_group_density(p_revier_id, v_species);

    elsif v_model_family = 'seasonal_migration_presence' then
      perform public.compute_population_seasonal_migration_presence(p_revier_id, v_species);

    elsif v_model_family = 'occupancy_presence' then
      perform public.compute_population_occupancy_presence(p_revier_id, v_species);

    elsif v_model_family = 'diurnal_surface_activity' then
      perform public.compute_population_diurnal_surface_activity(p_revier_id, v_species);

    elsif v_model_family = 'sparse_large_presence' then
      perform public.compute_population_sparse_large_presence(p_revier_id, v_species);

    else
      raise notice 'No compute model configured for species %', v_species;
    end if;
  end loop;
end;
$function$;

create or replace function public.refresh_population_estimates_for_all_active_reviers()
returns table (
  processed_count integer,
  success_count integer,
  error_count integer
)
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_revier_id uuid;
  v_processed integer := 0;
  v_success integer := 0;
  v_error integer := 0;
begin
  for v_revier_id in
    select r.id
    from public.reviers r
    where r.status = 'active'
    order by r.created_at, r.id
  loop
    v_processed := v_processed + 1;

    begin
      perform public.refresh_population_estimates_for_revier(v_revier_id);
      v_success := v_success + 1;
    exception
      when others then
        v_error := v_error + 1;
        raise notice 'Population refresh failed for revier %', v_revier_id;
    end;
  end loop;

  return query
  select v_processed, v_success, v_error;
end;
$function$;

commit;
