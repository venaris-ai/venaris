--
-- PostgreSQL database dump
--

\restrict MojV4ABWKHMA4QoFCuUop7p66MF0HlKFNY7Brh2moqde3J9IlniqeXjibGBtKuW

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA private;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: taxonomy_species_v1; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.taxonomy_species_v1 AS ENUM (
    'roe_deer',
    'wild_boar',
    'red_deer',
    'fallow_deer',
    'mouflon',
    'fox',
    'wolf',
    'badger',
    'raccoon',
    'raccoon_dog',
    'hare',
    'rabbit',
    'pheasant',
    'crow',
    'other',
    'bear',
    'pine_marten',
    'moose',
    'magpie',
    'chamois',
    'golden_jackal',
    'greylag_goose',
    'stoat',
    'canada_goose',
    'mink',
    'egyptian_goose',
    'nutria',
    'bobcat',
    'stone_marten',
    'mallard',
    'woodcock'
);


--
-- Name: is_org_admin(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_org_admin(target_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_organization_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
  );
$$;


--
-- Name: is_org_member(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_org_member(target_organization_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_organization_id
      and om.user_id = auth.uid()
  );
$$;


--
-- Name: build_camera_technical_name(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.build_camera_technical_name(p_camera_code text, p_sequence integer) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select lower(p_camera_code) || lpad(p_sequence::text, 3, '0');
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    camera_id uuid NOT NULL,
    captured_at timestamp with time zone,
    storage_path text NOT NULL,
    file_hash text,
    status text DEFAULT 'queued'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    relevant boolean DEFAULT true NOT NULL,
    ingest_batch_id uuid,
    attempts integer DEFAULT 0 NOT NULL,
    processing_started_at timestamp with time zone,
    processed_at timestamp with time zone,
    last_error text,
    worker_id text,
    empty boolean,
    empty_confidence real,
    relevant_user boolean,
    storage_delete_after timestamp with time zone,
    storage_delete_reason text,
    storage_deleted_at timestamp with time zone,
    storage_delete_error text,
    captured_at_source text,
    captured_at_timezone text,
    captured_at_confidence text,
    captured_at_warning text,
    CONSTRAINT assets_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'processed'::text, 'failed'::text])))
);


--
-- Name: claim_queued_assets(integer, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_queued_assets(p_batch_size integer, p_worker_id text, p_stuck_minutes integer DEFAULT 30) RETURNS SETOF public.assets
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
with candidates as (
  select id
  from public.assets
  where
    (
      status = 'queued'
      or (
        status = 'processing'
        and processing_started_at is not null
        and processing_started_at < now() - (p_stuck_minutes || ' minutes')::interval
      )
    )
  order by created_at asc
  limit p_batch_size
  for update skip locked
)
update public.assets a
set
  status = 'processing',
  worker_id = p_worker_id,
  processing_started_at = now(),
  attempts = a.attempts + 1,
  last_error = null
from candidates c
where a.id = c.id
returning a.*;
$$;


--
-- Name: compute_population_diurnal_surface_activity(uuid, public.taxonomy_species_v1); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_population_diurnal_surface_activity(p_revier_id uuid, p_species public.taxonomy_species_v1) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_org_id uuid;
begin
  if p_species not in (
    'pheasant'::public.taxonomy_species_v1,
    'crow'::public.taxonomy_species_v1,
    'magpie'::public.taxonomy_species_v1,
    'greylag_goose'::public.taxonomy_species_v1,
    'canada_goose'::public.taxonomy_species_v1,
    'egyptian_goose'::public.taxonomy_species_v1,
    'mallard'::public.taxonomy_species_v1,
    'woodcock'::public.taxonomy_species_v1
  ) then
    raise exception 'diurnal_surface_activity unsupported species %', p_species;
  end if;

  select organization_id
  into v_org_id
  from public.reviers
  where id = p_revier_id;

  if v_org_id is null then
    raise exception 'Revier % not found', p_revier_id;
  end if;

  delete from public.population_estimates
  where revier_id = p_revier_id
    and species = p_species
    and estimate_date = current_date;

  insert into public.population_estimates (
    organization_id,
    revier_id,
    species,
    estimate_date,
    total_presence_days,
    active_cameras,
    local_camera_sum,
    overlap_factor,
    coverage_rate,
    overlap_corrected,
    estimated_population_total,
    estimated_population_per_100ha,
    target_per_100ha,
    target_total,
    harvest_surplus_v0
  )
  with params as (
    select
      max(case when parameter_key = 'overlap_factor' then parameter_value end) as overlap_factor,
      max(case when parameter_key = 'coverage_rate_default' then parameter_value end) as coverage_rate_default,
      public.resolve_population_target_per_100ha(p_revier_id, p_species) as target_per_100ha,
      max(case when parameter_key = 'activity_dawn' then parameter_value end) as activity_dawn,
      max(case when parameter_key = 'activity_day' then parameter_value end) as activity_day,
      max(case when parameter_key = 'activity_dusk' then parameter_value end) as activity_dusk,
      max(case when parameter_key = 'activity_night' then parameter_value end) as activity_night
    from public.species_population_parameters
    where species = p_species
      and valid_to is null
  ),
  base as (
    select
      r.organization_id,
      r.id as revier_id,
      r.area_ha,
      e.camera_id,
      date(e.start_at) as observation_day,
      case
        when extract(hour from e.start_at) between 5 and 7 then 'dawn'
        when extract(hour from e.start_at) between 8 and 17 then 'day'
        when extract(hour from e.start_at) between 18 and 20 then 'dusk'
        else 'night'
      end as period
    from public.events e
    join public.cameras c on c.id = e.camera_id
    join public.reviers r on r.id = c.revier_id
    where e.top_species = p_species
      and r.id = p_revier_id
    group by
      r.organization_id, r.id, r.area_ha, e.camera_id, date(e.start_at),
      case
        when extract(hour from e.start_at) between 5 and 7 then 'dawn'
        when extract(hour from e.start_at) between 8 and 17 then 'day'
        when extract(hour from e.start_at) between 18 and 20 then 'dusk'
        else 'night'
      end
  ),
  period_weighted as (
    select
      b.organization_id,
      b.revier_id,
      b.area_ha,
      b.camera_id,
      b.observation_day,
      case
        when b.period = 'dawn' then p.activity_dawn
        when b.period = 'day' then p.activity_day
        when b.period = 'dusk' then p.activity_dusk
        when b.period = 'night' then p.activity_night
        else 0
      end as weight
    from base b
    cross join params p
  ),
  camera_daily as (
    select
      organization_id,
      revier_id,
      area_ha,
      camera_id,
      observation_day,
      max(weight) as day_weight
    from period_weighted
    group by organization_id, revier_id, area_ha, camera_id, observation_day
  ),
  camera_index as (
    select
      organization_id,
      revier_id,
      max(area_ha) as area_ha,
      camera_id,
      count(distinct observation_day)::numeric as presence_days,
      ln(1 + sum(day_weight)) as camera_signal
    from camera_daily
    group by organization_id, revier_id, camera_id
  ),
  revier_sum as (
    select
      organization_id,
      revier_id,
      max(area_ha) as area_ha,
      sum(presence_days) as total_presence_days,
      count(*)::int as active_cameras,
      sum(camera_signal) as local_camera_sum
    from camera_index
    group by organization_id, revier_id
  )
  select
    rs.organization_id,
    rs.revier_id,
    p_species,
    current_date,
    rs.total_presence_days,
    rs.active_cameras,
    rs.local_camera_sum,
    p.overlap_factor,
    p.coverage_rate_default,
    rs.local_camera_sum * p.overlap_factor,
    (rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0),
    ((rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0)) / rs.area_ha * 100,
    p.target_per_100ha,
    floor(rs.area_ha * p.target_per_100ha / 100.0),
    greatest(
      0,
      ((rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0))
      - floor(rs.area_ha * p.target_per_100ha / 100.0)
    )
  from revier_sum rs
  cross join params p;
end;
$$;


--
-- Name: compute_population_for_revier(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_population_for_revier(p_revier_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
    v_species public.taxonomy_species_v1;
    v_model_family text;
begin
    for v_species, v_model_family in
        select
            m.species,
            m.model_family
        from public.species_population_model_mapping m
        where exists (
            select 1
            from public.events e
            join public.cameras c
              on c.id = e.camera_id
            where c.revier_id = p_revier_id
              and e.top_species = m.species
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
$$;


--
-- Name: compute_population_group_density(uuid, public.taxonomy_species_v1); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_population_group_density(p_revier_id uuid, p_species public.taxonomy_species_v1) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_org_id uuid;
  v_percentile numeric;
  v_presence_window_days int;
  v_min_events int;
begin
  if p_species not in (
    'wild_boar'::public.taxonomy_species_v1,
    'mouflon'::public.taxonomy_species_v1,
    'chamois'::public.taxonomy_species_v1
  ) then
    raise exception 'group_density supports wild_boar/mouflon/chamois, got %', p_species;
  end if;

  select organization_id
  into v_org_id
  from public.reviers
  where id = p_revier_id;

  if v_org_id is null then
    raise exception 'Revier % not found', p_revier_id;
  end if;

  v_percentile := case
    when p_species = 'wild_boar'::public.taxonomy_species_v1 then 0.75
    when p_species = 'mouflon'::public.taxonomy_species_v1 then 0.90
    when p_species = 'chamois'::public.taxonomy_species_v1 then 0.90
    else 0.90
  end;

  v_presence_window_days := 14;
  v_min_events := 3;

  delete from public.population_estimates
  where revier_id = p_revier_id
    and species = p_species
    and estimate_date = current_date;

  insert into public.population_estimates (
    organization_id,
    revier_id,
    species,
    estimate_date,
    total_presence_days,
    active_cameras,
    local_camera_sum,
    overlap_factor,
    coverage_rate,
    overlap_corrected,
    estimated_population_total,
    estimated_population_per_100ha,
    target_per_100ha,
    target_total,
    harvest_surplus_v0
  )
  with params as (
    select
      max(case when parameter_key = 'overlap_factor' then parameter_value end) as overlap_factor,
      max(case when parameter_key = 'coverage_rate_default' then parameter_value end) as coverage_rate_default,
      public.resolve_population_target_per_100ha(p_revier_id, p_species) as target_per_100ha
    from public.species_population_parameters
    where species = p_species
      and valid_to is null
  ),
  base as (
    select
      r.organization_id,
      r.id as revier_id,
      r.area_ha,
      e.camera_id,
      date(e.start_at) as observation_day,
      max(coalesce(e.top_count, 1)) as daily_max_count
    from public.events e
    join public.cameras c
      on c.id = e.camera_id
    join public.reviers r
      on r.id = c.revier_id
    where r.id = p_revier_id
      and e.top_species = p_species
      and e.start_at >= date '2025-04-01'
      and e.start_at <  date '2026-04-01'
    group by
      r.organization_id,
      r.id,
      r.area_ha,
      e.camera_id,
      date(e.start_at)
  ),
  presence_scored as (
    select
      b.*,
      (
        select count(*)
        from base b2
        where b2.camera_id = b.camera_id
          and b2.observation_day between b.observation_day - (v_presence_window_days - 1) and b.observation_day
      ) as rolling_signal_days
    from base b
  ),
  presence_only as (
    select *
    from presence_scored
    where rolling_signal_days >= v_min_events
  ),
  camera_index as (
    select
      organization_id,
      revier_id,
      max(area_ha) as area_ha,
      camera_id,
      case
        when v_percentile = 0.75 then percentile_cont(0.75) within group (order by daily_max_count)
        else percentile_cont(0.90) within group (order by daily_max_count)
      end as camera_signal
    from presence_only
    group by organization_id, revier_id, camera_id
  ),
  revier_presence as (
    select
      organization_id,
      revier_id,
      max(area_ha) as area_ha,
      case
        when p_species = 'wild_boar'::public.taxonomy_species_v1 then null::numeric
        else count(distinct observation_day)::numeric
      end as total_presence_days
    from presence_only
    group by organization_id, revier_id
  ),
  revier_sum as (
    select
      ci.organization_id,
      ci.revier_id,
      max(ci.area_ha) as area_ha,
      rp.total_presence_days,
      count(*)::int as active_cameras,
      sum(ci.camera_signal) as local_camera_sum
    from camera_index ci
    join revier_presence rp
      on rp.organization_id = ci.organization_id
     and rp.revier_id = ci.revier_id
    group by ci.organization_id, ci.revier_id, rp.total_presence_days
  )
  select
    rs.organization_id,
    rs.revier_id,
    p_species,
    current_date,
    rs.total_presence_days,
    rs.active_cameras,
    rs.local_camera_sum,
    p.overlap_factor,
    p.coverage_rate_default,
    rs.local_camera_sum * p.overlap_factor,
    (rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0),
    ((rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0)) / rs.area_ha * 100,
    p.target_per_100ha,
    rs.area_ha * p.target_per_100ha / 100,
    greatest(
      0,
      ((rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0))
      - (rs.area_ha * p.target_per_100ha / 100)
    )
  from revier_sum rs
  cross join params p;
end;
$$;


--
-- Name: compute_population_occupancy_presence(uuid, public.taxonomy_species_v1); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_population_occupancy_presence(p_revier_id uuid, p_species public.taxonomy_species_v1) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_org_id uuid;
begin
  if p_species not in (
    'fox'::public.taxonomy_species_v1,
    'badger'::public.taxonomy_species_v1,
    'raccoon'::public.taxonomy_species_v1,
    'raccoon_dog'::public.taxonomy_species_v1,
    'hare'::public.taxonomy_species_v1,
    'rabbit'::public.taxonomy_species_v1,
    'pine_marten'::public.taxonomy_species_v1,
    'stone_marten'::public.taxonomy_species_v1,
    'stoat'::public.taxonomy_species_v1,
    'mink'::public.taxonomy_species_v1,
    'golden_jackal'::public.taxonomy_species_v1,
    'bobcat'::public.taxonomy_species_v1,
    'nutria'::public.taxonomy_species_v1
  ) then
    raise exception 'occupancy_presence unsupported species %', p_species;
  end if;

  select organization_id
  into v_org_id
  from public.reviers
  where id = p_revier_id;

  if v_org_id is null then
    raise exception 'Revier % not found', p_revier_id;
  end if;

  delete from public.population_estimates
  where revier_id = p_revier_id
    and species = p_species
    and estimate_date = current_date;

  if p_species = 'badger'::public.taxonomy_species_v1 then
    insert into public.population_estimates (
      organization_id,
      revier_id,
      species,
      estimate_date,
      total_presence_days,
      active_cameras,
      local_camera_sum,
      overlap_factor,
      coverage_rate,
      overlap_corrected,
      estimated_population_total,
      estimated_population_per_100ha,
      target_per_100ha,
      target_total,
      harvest_surplus_v0
    )
    with params as (
      select
        max(case when parameter_key = 'overlap_factor' then parameter_value end) as overlap_factor,
        max(case when parameter_key = 'coverage_rate_default' then parameter_value end) as coverage_rate_default,
        public.resolve_population_target_per_100ha(p_revier_id, p_species) as target_per_100ha
      from public.species_population_parameters
      where species = p_species
        and valid_to is null
    ),
    badger_events as (
      select
        r.organization_id,
        r.id as revier_id,
        r.area_ha,
        count(distinct date(e.start_at))::numeric as total_presence_days,
        count(distinct e.camera_id)::int as active_cameras
      from public.events e
      join public.cameras c on c.id = e.camera_id
      join public.reviers r on r.id = c.revier_id
      where e.top_species = p_species
        and r.id = p_revier_id
      group by r.organization_id, r.id, r.area_ha
    ),
    camera_strength as (
      select
        r.organization_id,
        r.id as revier_id,
        sum(log(1 + ec.event_count)) as local_camera_sum
      from (
        select
          e.camera_id,
          count(*) as event_count
        from public.events e
        join public.cameras c on c.id = e.camera_id
        join public.reviers r on r.id = c.revier_id
        where e.top_species = p_species
          and r.id = p_revier_id
        group by e.camera_id
      ) ec
      join public.cameras c on c.id = ec.camera_id
      join public.reviers r on r.id = c.revier_id
      where r.id = p_revier_id
      group by r.organization_id, r.id
    )
    select
      be.organization_id,
      be.revier_id,
      p_species,
      current_date,
      be.total_presence_days,
      be.active_cameras,
      cs.local_camera_sum,
      p.overlap_factor,
      p.coverage_rate_default,
      cs.local_camera_sum * p.overlap_factor,
      (cs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0),
      ((cs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0)) / be.area_ha * 100,
      p.target_per_100ha,
      floor(be.area_ha * p.target_per_100ha / 100.0),
      greatest(
        0,
        ((cs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0))
        - floor(be.area_ha * p.target_per_100ha / 100.0)
      )
    from badger_events be
    join camera_strength cs
      on cs.organization_id = be.organization_id
     and cs.revier_id = be.revier_id
    cross join params p;

  elsif p_species = 'rabbit'::public.taxonomy_species_v1 then
    insert into public.population_estimates (
      organization_id,
      revier_id,
      species,
      estimate_date,
      total_presence_days,
      active_cameras,
      local_camera_sum,
      overlap_factor,
      coverage_rate,
      overlap_corrected,
      estimated_population_total,
      estimated_population_per_100ha,
      target_per_100ha,
      target_total,
      harvest_surplus_v0
    )
    with params as (
      select
        max(case when parameter_key = 'overlap_factor' then parameter_value end) as overlap_factor,
        max(case when parameter_key = 'coverage_rate_default' then parameter_value end) as coverage_rate_default,
        public.resolve_population_target_per_100ha(p_revier_id, p_species) as target_per_100ha
      from public.species_population_parameters
      where species = p_species
        and valid_to is null
    ),
    base as (
      select
        r.organization_id,
        r.id as revier_id,
        r.area_ha,
        e.camera_id,
        date(e.start_at) as observation_day,
        case
          when extract(hour from e.start_at) between 4 and 7 then 'dawn'
          when extract(hour from e.start_at) between 18 and 21 then 'dusk'
          when extract(hour from e.start_at) between 8 and 17 then 'day'
          else 'night'
        end as period
      from public.events e
      join public.cameras c on c.id = e.camera_id
      join public.reviers r on r.id = c.revier_id
      where e.top_species = p_species
        and r.id = p_revier_id
    ),
    presence as (
      select
        organization_id,
        revier_id,
        area_ha,
        camera_id,
        observation_day,
        period
      from base
      group by organization_id, revier_id, area_ha, camera_id, observation_day, period
    ),
    camera_daily as (
      select
        organization_id,
        revier_id,
        area_ha,
        camera_id,
        observation_day,
        count(*) as periods_seen
      from presence
      group by organization_id, revier_id, area_ha, camera_id, observation_day
    ),
    camera_index as (
      select
        organization_id,
        revier_id,
        max(area_ha) as area_ha,
        camera_id,
        count(distinct observation_day)::numeric as presence_days,
        ln(1 + sum(periods_seen * 0.8)) as camera_signal
      from camera_daily
      group by organization_id, revier_id, camera_id
    ),
    revier_sum as (
      select
        organization_id,
        revier_id,
        max(area_ha) as area_ha,
        sum(presence_days) as total_presence_days,
        count(*)::int as active_cameras,
        sum(camera_signal) as local_camera_sum
      from camera_index
      group by organization_id, revier_id
    )
    select
      rs.organization_id,
      rs.revier_id,
      p_species,
      current_date,
      rs.total_presence_days,
      rs.active_cameras,
      rs.local_camera_sum,
      p.overlap_factor,
      p.coverage_rate_default,
      rs.local_camera_sum * p.overlap_factor,
      (rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0),
      ((rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0)) / rs.area_ha * 100,
      p.target_per_100ha,
      floor(rs.area_ha * p.target_per_100ha / 100.0),
      greatest(
        0,
        ((rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0))
        - floor(rs.area_ha * p.target_per_100ha / 100.0)
      )
    from revier_sum rs
    cross join params p;

  else
    insert into public.population_estimates (
      organization_id,
      revier_id,
      species,
      estimate_date,
      total_presence_days,
      active_cameras,
      local_camera_sum,
      overlap_factor,
      coverage_rate,
      overlap_corrected,
      estimated_population_total,
      estimated_population_per_100ha,
      target_per_100ha,
      target_total,
      harvest_surplus_v0
    )
    with params as (
      select
        max(case when parameter_key = 'overlap_factor' then parameter_value end) as overlap_factor,
        max(case when parameter_key = 'coverage_rate_default' then parameter_value end) as coverage_rate_default,
        public.resolve_population_target_per_100ha(p_revier_id, p_species) as target_per_100ha,
        max(case when parameter_key = 'activity_dawn' then parameter_value end) as activity_dawn,
        max(case when parameter_key = 'activity_day' then parameter_value end) as activity_day,
        max(case when parameter_key = 'activity_dusk' then parameter_value end) as activity_dusk,
        max(case when parameter_key = 'activity_night' then parameter_value end) as activity_night
      from public.species_population_parameters
      where species = p_species
        and valid_to is null
    ),
    base as (
      select
        r.organization_id,
        r.id as revier_id,
        r.area_ha,
        e.camera_id,
        date(e.start_at) as observation_day,
        case
          when extract(hour from e.start_at) between 20 and 23 then 'night'
          when extract(hour from e.start_at) between 0 and 4 then 'night'
          when extract(hour from e.start_at) between 5 and 7 then 'dawn'
          when extract(hour from e.start_at) between 8 and 17 then 'day'
          else 'dusk'
        end as period
      from public.events e
      join public.cameras c on c.id = e.camera_id
      join public.reviers r on r.id = c.revier_id
      where e.top_species = p_species
        and r.id = p_revier_id
    ),
    presence as (
      select
        organization_id,
        revier_id,
        area_ha,
        camera_id,
        observation_day,
        period
      from base
      group by organization_id, revier_id, area_ha, camera_id, observation_day, period
    ),
    period_weighted as (
      select
        p.organization_id,
        p.revier_id,
        p.area_ha,
        p.camera_id,
        p.observation_day,
        case
          when p.period = 'dawn' then prm.activity_dawn
          when p.period = 'day' then prm.activity_day
          when p.period = 'dusk' then prm.activity_dusk
          when p.period = 'night' then prm.activity_night
          else 0
        end as weight
      from presence p
      cross join params prm
    ),
    camera_daily as (
      select
        organization_id,
        revier_id,
        area_ha,
        camera_id,
        observation_day,
        max(weight) as day_weight
      from period_weighted
      group by organization_id, revier_id, area_ha, camera_id, observation_day
    ),
    camera_index as (
      select
        organization_id,
        revier_id,
        max(area_ha) as area_ha,
        camera_id,
        count(distinct observation_day)::numeric as presence_days,
        case
          when p_species = 'fox'::public.taxonomy_species_v1
            then sum(day_weight) / nullif(count(distinct observation_day), 0)
          else ln(1 + sum(day_weight))
        end as camera_signal
      from camera_daily
      group by organization_id, revier_id, camera_id
    ),
    revier_sum as (
      select
        organization_id,
        revier_id,
        max(area_ha) as area_ha,
        sum(presence_days) as total_presence_days,
        count(*)::int as active_cameras,
        sum(camera_signal) as local_camera_sum
      from camera_index
      group by organization_id, revier_id
    )
    select
      rs.organization_id,
      rs.revier_id,
      p_species,
      current_date,
      rs.total_presence_days,
      rs.active_cameras,
      rs.local_camera_sum,
      p.overlap_factor,
      p.coverage_rate_default,
      rs.local_camera_sum * p.overlap_factor,
      (rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0),
      ((rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0)) / rs.area_ha * 100,
      p.target_per_100ha,
      floor(rs.area_ha * p.target_per_100ha / 100.0),
      greatest(
        0,
        ((rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0))
        - floor(rs.area_ha * p.target_per_100ha / 100.0)
      )
    from revier_sum rs
    cross join params p;
  end if;
end;
$$;


--
-- Name: compute_population_seasonal_migration_presence(uuid, public.taxonomy_species_v1); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_population_seasonal_migration_presence(p_revier_id uuid, p_species public.taxonomy_species_v1) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_org_id uuid;
begin
  if p_species not in (
    'red_deer'::public.taxonomy_species_v1,
    'fallow_deer'::public.taxonomy_species_v1,
    'moose'::public.taxonomy_species_v1
  ) then
    raise exception 'seasonal_migration_presence supports red_deer/fallow_deer/moose, got %', p_species;
  end if;

  select organization_id
  into v_org_id
  from public.reviers
  where id = p_revier_id;

  if v_org_id is null then
    raise exception 'Revier % not found', p_revier_id;
  end if;

  delete from public.population_estimates
  where revier_id = p_revier_id
    and species = p_species
    and estimate_date = current_date;

  insert into public.population_estimates (
    organization_id,
    revier_id,
    species,
    estimate_date,
    total_presence_days,
    active_cameras,
    local_camera_sum,
    overlap_factor,
    coverage_rate,
    overlap_corrected,
    estimated_population_total,
    estimated_population_per_100ha,
    target_per_100ha,
    target_total,
    harvest_surplus_v0
  )
  with params as (
    select
      max(case when parameter_key = 'overlap_factor' then parameter_value end) as overlap_factor,
      max(case when parameter_key = 'coverage_rate_default' then parameter_value end) as coverage_rate_default,
      public.resolve_population_target_per_100ha(p_revier_id, p_species) as target_per_100ha,
      coalesce(max(case when parameter_key = 'presence_window_min_events' then parameter_value end), 3) as presence_window_min_events
    from public.species_population_parameters
    where species = p_species
      and valid_to is null
  ),
  base as (
    select
      r.organization_id,
      r.id as revier_id,
      r.area_ha,
      e.camera_id,
      date(e.start_at) as observation_day,
      max(coalesce(e.top_count, 1)) as daily_max_count
    from public.events e
    join public.cameras c
      on c.id = e.camera_id
    join public.reviers r
      on r.id = c.revier_id
    where r.id = p_revier_id
      and e.top_species = p_species
      and e.start_at >= date '2025-04-01'
      and e.start_at <  date '2026-04-01'
    group by
      r.organization_id,
      r.id,
      r.area_ha,
      e.camera_id,
      date(e.start_at)
  ),
  presence_scored as (
    select
      b.*,
      (
        select count(*)
        from base b2
        where b2.camera_id = b.camera_id
          and b2.observation_day between b.observation_day - 20 and b.observation_day
      ) as rolling_signal_days
    from base b
  ),
  presence_only as (
    select ps.*
    from presence_scored ps
    cross join params p
    where ps.rolling_signal_days >= p.presence_window_min_events
  ),
  camera_index as (
    select
      organization_id,
      revier_id,
      max(area_ha) as area_ha,
      camera_id,
      percentile_cont(0.75) within group (order by daily_max_count) as camera_signal
    from presence_only
    group by organization_id, revier_id, camera_id
  ),
  revier_presence as (
    select
      organization_id,
      revier_id,
      max(area_ha) as area_ha,
      count(distinct observation_day)::int as total_presence_days
    from presence_only
    group by organization_id, revier_id
  ),
  revier_sum as (
    select
      ci.organization_id,
      ci.revier_id,
      max(ci.area_ha) as area_ha,
      rp.total_presence_days,
      count(*)::int as active_cameras,
      sum(ci.camera_signal) as local_camera_sum
    from camera_index ci
    join revier_presence rp
      on rp.organization_id = ci.organization_id
     and rp.revier_id = ci.revier_id
    group by ci.organization_id, ci.revier_id, rp.total_presence_days
  )
  select
    rs.organization_id,
    rs.revier_id,
    p_species,
    current_date,
    rs.total_presence_days,
    rs.active_cameras,
    rs.local_camera_sum,
    p.overlap_factor,
    p.coverage_rate_default,
    rs.local_camera_sum * p.overlap_factor,
    (rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0),
    ((rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0)) / rs.area_ha * 100,
    p.target_per_100ha,
    rs.area_ha * p.target_per_100ha / 100,
    greatest(
      0,
      ((rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default, 0))
      - (rs.area_ha * p.target_per_100ha / 100)
    )
  from revier_sum rs
  cross join params p;
end;
$$;


--
-- Name: compute_population_sparse_large_presence(uuid, public.taxonomy_species_v1); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_population_sparse_large_presence(p_revier_id uuid, p_species public.taxonomy_species_v1) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_org_id uuid;
begin
  if p_species <> 'bear'::public.taxonomy_species_v1 then
    raise exception 'sparse_large_presence currently supports only bear, got %', p_species;
  end if;

  select organization_id
  into v_org_id
  from public.reviers
  where id = p_revier_id;

  if v_org_id is null then
    raise exception 'Revier % not found', p_revier_id;
  end if;

  delete from public.population_estimates
  where revier_id = p_revier_id
    and species = p_species
    and estimate_date = current_date;

  insert into public.population_estimates (
    organization_id,
    revier_id,
    species,
    estimate_date,
    total_presence_days,
    active_cameras,
    local_camera_sum,
    overlap_factor,
    coverage_rate,
    overlap_corrected,
    estimated_population_total,
    estimated_population_per_100ha,
    target_per_100ha,
    target_total,
    harvest_surplus_v0
  )
  with params as (
    select
      max(case when parameter_key = 'overlap_factor' then parameter_value end) as overlap_factor,
      max(case when parameter_key = 'coverage_rate_default' then parameter_value end) as coverage_rate_default,
      coalesce(max(case when parameter_key = 'sparse_scaling_factor' then parameter_value end), 1.0) as sparse_scaling_factor,
      public.resolve_population_target_per_100ha(p_revier_id, p_species) as target_per_100ha,
      max(case when parameter_key = 'activity_dawn' then parameter_value end) as activity_dawn,
      max(case when parameter_key = 'activity_day' then parameter_value end) as activity_day,
      max(case when parameter_key = 'activity_dusk' then parameter_value end) as activity_dusk,
      max(case when parameter_key = 'activity_night' then parameter_value end) as activity_night
    from public.species_population_parameters
    where species = p_species
      and valid_to is null
  ),
  base as (
    select
      r.organization_id,
      r.id as revier_id,
      r.area_ha,
      e.camera_id,
      date(e.start_at) as observation_day,
      case
        when extract(hour from e.start_at) between 5 and 7 then 'dawn'
        when extract(hour from e.start_at) between 8 and 17 then 'day'
        when extract(hour from e.start_at) between 18 and 20 then 'dusk'
        else 'night'
      end as period
    from public.events e
    join public.cameras c
      on c.id = e.camera_id
    join public.reviers r
      on r.id = c.revier_id
    where e.top_species = p_species
      and r.id = p_revier_id
  ),
  period_weighted as (
    select
      b.organization_id,
      b.revier_id,
      b.area_ha,
      b.camera_id,
      b.observation_day,
      case
        when b.period = 'dawn' then p.activity_dawn
        when b.period = 'day' then p.activity_day
        when b.period = 'dusk' then p.activity_dusk
        when b.period = 'night' then p.activity_night
        else 0
      end as weight
    from base b
    cross join params p
  ),
  camera_daily as (
    select
      organization_id,
      revier_id,
      area_ha,
      camera_id,
      observation_day,
      max(weight) as day_weight
    from period_weighted
    group by organization_id, revier_id, area_ha, camera_id, observation_day
  ),
  camera_index as (
    select
      organization_id,
      revier_id,
      max(area_ha) as area_ha,
      camera_id,
      count(distinct observation_day)::numeric as presence_days,
      ln(1 + sum(day_weight)) as camera_signal
    from camera_daily
    group by organization_id, revier_id, camera_id
  ),
  revier_sum as (
    select
      organization_id,
      revier_id,
      max(area_ha) as area_ha,
      sum(presence_days) as total_presence_days,
      count(*)::int as active_cameras,
      sum(camera_signal) as local_camera_sum
    from camera_index
    group by organization_id, revier_id
  )
  select
    rs.organization_id,
    rs.revier_id,
    p_species,
    current_date,
    rs.total_presence_days,
    rs.active_cameras,
    rs.local_camera_sum,
    p.overlap_factor,
    p.coverage_rate_default,
    rs.local_camera_sum * p.overlap_factor,
    greatest(
      1,
      (rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default * p.sparse_scaling_factor, 0)
    ),
    greatest(
      1,
      (rs.local_camera_sum * p.overlap_factor) / nullif(p.coverage_rate_default * p.sparse_scaling_factor, 0)
    ) / rs.area_ha * 100,
    p.target_per_100ha,
    floor(rs.area_ha * p.target_per_100ha / 100.0),
    0
  from revier_sum rs
  cross join params p;
end;
$$;


--
-- Name: compute_population_territorial_density(uuid, public.taxonomy_species_v1); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_population_territorial_density(p_revier_id uuid, p_species public.taxonomy_species_v1) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_org_id uuid;
begin
  if p_species <> 'roe_deer'::public.taxonomy_species_v1 then
    raise exception 'territorial_density currently supports only roe_deer, got %', p_species;
  end if;

  select organization_id
  into v_org_id
  from public.reviers
  where id = p_revier_id;

  if v_org_id is null then
    raise exception 'Revier % not found', p_revier_id;
  end if;

  delete from public.population_estimates
  where revier_id = p_revier_id
    and species = p_species
    and estimate_date = current_date;

  insert into public.population_estimates (
    organization_id,
    revier_id,
    species,
    estimate_date,
    total_presence_days,
    active_cameras,
    local_camera_sum,
    overlap_factor,
    coverage_rate,
    overlap_corrected,
    estimated_population_total,
    estimated_population_per_100ha,
    target_per_100ha,
    target_total,
    harvest_surplus_v0
  )
  with params as (
    select
      max(case when parameter_key = 'overlap_factor' then parameter_value end) as overlap_factor,
      max(case when parameter_key = 'coverage_rate_default' then parameter_value end) as coverage_rate_default,
      public.resolve_population_target_per_100ha(p_revier_id, p_species) as target_per_100ha
    from public.species_population_parameters
    where species = p_species
  ),
  base as (
    select
      r.organization_id,
      r.id as revier_id,
      r.area_ha,
      e.camera_id,
      date(e.start_at) as observation_day,
      max(coalesce(e.top_count, 1)) as daily_max_count
    from public.events e
    join public.cameras c
      on c.id = e.camera_id
    join public.reviers r
      on r.id = c.revier_id
    where r.id = p_revier_id
      and e.top_species = p_species
      and e.start_at >= date '2025-04-01'
      and e.start_at <  date '2026-04-01'
    group by
      r.organization_id,
      r.id,
      r.area_ha,
      e.camera_id,
      date(e.start_at)
  ),
  presence_scored as (
    select
      b.*,
      (
        select count(*)
        from base b2
        where b2.camera_id = b.camera_id
          and b2.observation_day between b.observation_day - 20 and b.observation_day
      ) as rolling_signal_days
    from base b
  ),
  presence_only as (
    select *
    from presence_scored
    where rolling_signal_days >= 3
  ),
  camera_index as (
    select
      organization_id,
      revier_id,
      max(area_ha) as area_ha,
      camera_id,
      percentile_cont(0.9) within group (order by daily_max_count) as camera_signal
    from presence_only
    group by organization_id, revier_id, camera_id
  ),
  revier_presence as (
    select
      organization_id,
      revier_id,
      max(area_ha) as area_ha,
      count(distinct observation_day)::int as total_presence_days
    from presence_only
    group by organization_id, revier_id
  ),
  revier_sum as (
    select
      ci.organization_id,
      ci.revier_id,
      max(ci.area_ha) as area_ha,
      rp.total_presence_days,
      count(*)::int as active_cameras,
      sum(ci.camera_signal) as local_camera_sum
    from camera_index ci
    join revier_presence rp
      on rp.organization_id = ci.organization_id
     and rp.revier_id = ci.revier_id
    group by ci.organization_id, ci.revier_id, rp.total_presence_days
  )
  select
    rs.organization_id,
    rs.revier_id,
    p_species,
    current_date,
    rs.total_presence_days,
    rs.active_cameras,
    rs.local_camera_sum,
    p.overlap_factor,
    p.coverage_rate_default,
    rs.local_camera_sum * p.overlap_factor,
    (rs.local_camera_sum * p.overlap_factor) / p.coverage_rate_default,
    ((rs.local_camera_sum * p.overlap_factor) / p.coverage_rate_default) / rs.area_ha * 100,
    p.target_per_100ha,
    rs.area_ha * p.target_per_100ha / 100,
    greatest(
      0,
      ((rs.local_camera_sum * p.overlap_factor) / p.coverage_rate_default)
      - (rs.area_ha * p.target_per_100ha / 100)
    )
  from revier_sum rs
  cross join params p;
end;
$$;


--
-- Name: compute_population_wolf(uuid, public.taxonomy_species_v1); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_population_wolf(p_revier_id uuid, p_species public.taxonomy_species_v1) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_org_id uuid;
begin
  if p_species <> 'wolf'::public.taxonomy_species_v1 then
    raise exception 'compute_population_wolf supports only wolf, got %', p_species;
  end if;

  select organization_id
  into v_org_id
  from public.reviers
  where id = p_revier_id;

  if v_org_id is null then
    raise exception 'Revier % not found', p_revier_id;
  end if;

  delete from public.population_estimates
  where revier_id = p_revier_id
    and species = p_species
    and estimate_date = current_date;

  insert into public.population_estimates (
    organization_id,
    revier_id,
    species,
    estimate_date,
    total_presence_days,
    active_cameras,
    local_camera_sum,
    overlap_factor,
    coverage_rate,
    overlap_corrected,
    estimated_population_total,
    estimated_population_per_100ha,
    target_per_100ha,
    target_total,
    harvest_surplus_v0
  )
  with params as (
    select
      max(case when parameter_key = 'overlap_factor' then parameter_value end) as overlap_factor,
      max(case when parameter_key = 'territorial_scaling_factor' then parameter_value end) as territorial_scaling_factor,
      public.resolve_population_target_per_100ha(p_revier_id, p_species) as target_per_100ha
    from public.species_population_parameters
    where species = p_species
  ),
  wolf_events as (
    select
      r.organization_id,
      r.id as revier_id,
      r.area_ha,
      count(distinct date(e.start_at))::numeric as total_presence_days,
      count(distinct e.camera_id)::int as active_cameras
    from public.events e
    join public.cameras c on c.id = e.camera_id
    join public.reviers r on r.id = c.revier_id
    where e.top_species = p_species
      and r.id = p_revier_id
    group by r.organization_id, r.id, r.area_ha
  ),
  camera_strength as (
    select
      r.organization_id,
      r.id as revier_id,
      sum(ln(1 + ec.event_count)) as local_camera_sum
    from (
      select
        e.camera_id,
        count(*) as event_count
      from public.events e
      join public.cameras c on c.id = e.camera_id
      join public.reviers r on r.id = c.revier_id
      where e.top_species = p_species
        and r.id = p_revier_id
      group by e.camera_id
    ) ec
    join public.cameras c on c.id = ec.camera_id
    join public.reviers r on r.id = c.revier_id
    where r.id = p_revier_id
    group by r.organization_id, r.id
  )
  select
    we.organization_id,
    we.revier_id,
    p_species,
    current_date,
    we.total_presence_days,
    we.active_cameras,
    cs.local_camera_sum,
    p.overlap_factor,
    p.territorial_scaling_factor,
    cs.local_camera_sum * p.overlap_factor,
    (cs.local_camera_sum * p.overlap_factor) / p.territorial_scaling_factor,
    ((cs.local_camera_sum * p.overlap_factor) / p.territorial_scaling_factor) / we.area_ha * 100,
    p.target_per_100ha,
    floor(we.area_ha * p.target_per_100ha / 100.0),
    greatest(
      0,
      ((cs.local_camera_sum * p.overlap_factor) / p.territorial_scaling_factor)
      - floor(we.area_ha * p.target_per_100ha / 100.0)
    )
  from wolf_events we
  join camera_strength cs
    on cs.organization_id = we.organization_id
   and cs.revier_id = we.revier_id
  cross join params p;
end;
$$;


--
-- Name: create_camera_with_provisioning(uuid, text, text, uuid, text, text, text, text, double precision, double precision, integer, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_camera_with_provisioning(p_organization_id uuid, p_camera_name text, p_method text, p_revier_id uuid DEFAULT NULL::uuid, p_vendor text DEFAULT NULL::text, p_location_name text DEFAULT NULL::text, p_brand text DEFAULT NULL::text, p_model text DEFAULT NULL::text, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_direction_deg integer DEFAULT NULL::integer, p_installed_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_notes text DEFAULT NULL::text) RETURNS TABLE(camera_id uuid, technical_name text, ingest_token text, smtp_alias text, ftp_username text, ftp_inbox_path text, manual_label text)
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_camera_code text;
  v_seq integer;
  v_technical_name text;
  v_camera_id uuid;
  v_ingest_token text;
  v_smtp_alias text;
  v_ftp_username text;
  v_ftp_inbox_path text;
  v_manual_label text;
  v_status text;
  v_revier_org_id uuid;
begin
  v_camera_code := (
    select o.camera_code
    from public.organizations as o
    where o.id = p_organization_id
  );

  if v_camera_code is null then
    raise exception 'organization camera_code not found';
  end if;

  if p_revier_id is not null then
    v_revier_org_id := (
      select r.organization_id
      from public.reviers as r
      where r.id = p_revier_id
    );

    if v_revier_org_id is null then
      raise exception 'revier not found';
    end if;

    if v_revier_org_id <> p_organization_id then
      raise exception 'revier does not belong to organization';
    end if;
  end if;

  v_seq := public.next_camera_sequence(p_organization_id);
  v_technical_name := public.build_camera_technical_name(v_camera_code, v_seq);
  v_ingest_token := encode(extensions.gen_random_bytes(24), 'hex');

  v_smtp_alias := null;
  v_ftp_username := null;
  v_ftp_inbox_path := null;
  v_manual_label := null;

  if p_method = 'smtp' then
    v_smtp_alias := v_technical_name || '@cams.venaris.io';
    v_status := 'pending';
  elsif p_method = 'ftp' then
    v_ftp_username := v_technical_name;
    v_ftp_inbox_path := '/data/ftp-ingest/' || v_technical_name || '/inbox';
    v_status := 'pending';
  elsif p_method = 'manual' then
    v_manual_label := v_technical_name;
    v_status := 'ready';
  else
    raise exception 'invalid method';
  end if;

  insert into public.cameras (
    organization_id,
    revier_id,
    name,
    technical_name,
    import_method,
    ingest_token,
    location_name,
    brand,
    model,
    latitude,
    longitude,
    direction_deg,
    is_active,
    installed_at,
    notes
  )
  values (
    p_organization_id,
    p_revier_id,
    p_camera_name,
    v_technical_name,
    p_method,
    v_ingest_token,
    p_location_name,
    p_brand,
    p_model,
    p_latitude,
    p_longitude,
    p_direction_deg,
    true,
    p_installed_at,
    p_notes
  )
  returning id into v_camera_id;

  insert into public.camera_ingest_configs (
    camera_id,
    method,
    is_active,
    provisioning_status,
    smtp_alias,
    ftp_username,
    ftp_inbox_path,
    manual_label,
    ingest_token,
    vendor
  )
  values (
    v_camera_id,
    p_method,
    true,
    v_status,
    v_smtp_alias,
    v_ftp_username,
    v_ftp_inbox_path,
    v_manual_label,
    v_ingest_token,
    p_vendor
  );

  camera_id := v_camera_id;
  technical_name := v_technical_name;
  ingest_token := v_ingest_token;
  smtp_alias := v_smtp_alias;
  ftp_username := v_ftp_username;
  ftp_inbox_path := v_ftp_inbox_path;
  manual_label := v_manual_label;

  return next;
end;
$$;


--
-- Name: create_default_revier_for_organization(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_default_revier_for_organization() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.reviers (
    organization_id,
    name,
    area_ha,
    country,
    status,
    notes,
    is_default,
    timezone
  )
  values (
    new.id,
    'Mein Revier',
    450,
    'DE',
    'active',
    'Auto-created default revier',
    true,
    'Europe/Berlin'
  )
  on conflict do nothing;

  return new;
end;
$$;


--
-- Name: create_default_subscription_for_organization(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_default_subscription_for_organization() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.organization_subscriptions (
    organization_id,
    plan_key,
    status,
    billing_cycle,
    started_at,
    current_period_start,
    current_period_end,
    trial_ends_at,
    cancel_at_period_end,
    canceled_at,
    price_amount_cents,
    price_currency,
    max_cameras,
    max_members,
    billing_provider,
    provider_customer_id,
    provider_subscription_id,
    notes,
    created_at,
    updated_at
  )
  values (
    new.id,
    'starter',
    'trialing',
    'monthly',
    now(),
    now(),
    null,
    now() + interval '30 days',
    false,
    null,
    995,
    'EUR',
    5,
    5,
    'none',
    null,
    null,
    'Auto-created default starter trial subscription',
    now(),
    now()
  )
  on conflict (organization_id) do nothing;

  return new;
end;
$$;


--
-- Name: generate_unique_camera_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_unique_camera_code() RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_alphabet constant text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  v_code text;
  i integer;
begin
  loop
    v_code := '';

    for i in 1..5 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 36)::int, 1);
    end loop;

    perform 1
    from public.organizations
    where camera_code = v_code;

    if not found then
      return v_code;
    end if;
  end loop;
end;
$$;


--
-- Name: get_activity_by_hour(timestamp with time zone, timestamp with time zone, uuid, boolean, public.taxonomy_species_v1); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_activity_by_hour(p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_camera_id uuid DEFAULT NULL::uuid, p_relevant_only boolean DEFAULT false, p_species public.taxonomy_species_v1 DEFAULT NULL::public.taxonomy_species_v1) RETURNS TABLE(hour_of_day integer, asset_count integer)
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with hours as (
    select generate_series(0, 23) as hour_of_day
  ),
  filtered_assets as (
    select distinct
      a.id,
      extract(hour from (a.captured_at at time zone 'Europe/Berlin'))::integer as hour_of_day
    from public.assets a
    join public.detections d on d.asset_id = a.id
    where
      a.captured_at is not null
      and a.captured_at >= p_start_at
      and a.captured_at < p_end_at
      and (p_camera_id is null or a.camera_id = p_camera_id)
      and (not p_relevant_only or coalesce(a.relevant, false) = true)
      and d.label = 'animal'
      and (
        p_species is null
        or coalesce(d.species_user, d.species) = p_species
      )
  ),
  agg as (
    select
      fa.hour_of_day,
      count(*)::integer as asset_count
    from filtered_assets fa
    group by fa.hour_of_day
  )
  select
    h.hour_of_day,
    coalesce(a.asset_count, 0)::integer as asset_count
  from hours h
  left join agg a on a.hour_of_day = h.hour_of_day
  order by h.hour_of_day;
$$;


--
-- Name: get_asset_event_species(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_asset_event_species(p_asset_id uuid) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select ass.species::text
  from public.asset_species_summary ass
  where ass.asset_id = p_asset_id
  order by
    ass.best_score desc nulls last,
    ass.animal_count desc nulls last,
    ass.species::text asc
  limit 1;
$$;


--
-- Name: get_species_activity(timestamp with time zone, timestamp with time zone, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_species_activity(p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_camera_id uuid DEFAULT NULL::uuid, p_relevant_only boolean DEFAULT false) RETURNS TABLE(species public.taxonomy_species_v1, detection_count integer, asset_count integer, avg_score real, max_score real)
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select
    d.species,
    count(*)::integer as detection_count,
    count(distinct a.id)::integer as asset_count,
    avg(d.score)::real as avg_score,
    max(d.score)::real as max_score
  from public.detections d
  join public.assets a on a.id = d.asset_id
  where
    d.species is not null
    and a.captured_at is not null
    and a.captured_at >= p_start_at
    and a.captured_at < p_end_at
    and (p_camera_id is null or a.camera_id = p_camera_id)
    and (not p_relevant_only or coalesce(a.relevant, false) = true)
  group by d.species
  order by detection_count desc, asset_count desc, d.species asc;
$$;


--
-- Name: handle_new_auth_user_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_auth_user_profile() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.profiles (id, preferred_language)
  values (
    new.id,
    case
      when coalesce(new.raw_user_meta_data ->> 'preferred_language', '') in ('de', 'en')
        then new.raw_user_meta_data ->> 'preferred_language'
      when coalesce(new.raw_user_meta_data ->> 'language', '') in ('de', 'en')
        then new.raw_user_meta_data ->> 'language'
      else 'de'
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


--
-- Name: next_camera_sequence(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_camera_sequence(p_organization_id uuid) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_next integer;
begin
  insert into public.organization_camera_sequences (organization_id, last_sequence, updated_at)
  values (p_organization_id, 0, now())
  on conflict (organization_id) do nothing;

  update public.organization_camera_sequences
  set
    last_sequence = last_sequence + 1,
    updated_at = now()
  where organization_id = p_organization_id
  returning last_sequence into v_next;

  if v_next is null then
    raise exception 'Could not allocate camera sequence for organization %', p_organization_id;
  end if;

  if v_next > 999 then
    raise exception 'camera sequence limit reached for organization % (max 999)', p_organization_id;
  end if;

  return v_next;
end;
$$;


--
-- Name: prevent_delete_default_revier(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_delete_default_revier() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if old.is_default then
    raise exception 'default revier cannot be deleted';
  end if;

  return old;
end;
$$;


--
-- Name: recluster_asset_event(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recluster_asset_event(p_asset_id uuid) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_old_event_id uuid;
  v_remaining_count integer;
  v_new_event_id uuid;
begin
  -- Alte Event-Zuordnungen merken.
  create temporary table if not exists pg_temp._venaris_recluster_old_events (
    event_id uuid primary key
  ) on commit drop;

  truncate table pg_temp._venaris_recluster_old_events;

  insert into pg_temp._venaris_recluster_old_events (event_id)
  select distinct ea.event_id
  from public.event_assets ea
  where ea.asset_id = p_asset_id
    and ea.event_id is not null
  on conflict do nothing;

  -- Asset aus alten Events lösen.
  delete from public.event_assets ea
  where ea.asset_id = p_asset_id;

  -- Alte Events reparieren oder löschen.
  for v_old_event_id in
    select event_id from pg_temp._venaris_recluster_old_events
  loop
    select count(*)::int
    into v_remaining_count
    from public.event_assets ea
    where ea.event_id = v_old_event_id;

    if v_remaining_count = 0 then
      delete from public.events e
      where e.id = v_old_event_id;
    else
      update public.events e
      set
        start_at = bounds.start_at,
        end_at = bounds.end_at
      from (
        select
          min(coalesce(a.captured_at, a.created_at)) as start_at,
          max(coalesce(a.captured_at, a.created_at)) as end_at
        from public.event_assets ea
        join public.assets a on a.id = ea.asset_id
        where ea.event_id = v_old_event_id
      ) bounds
      where e.id = v_old_event_id;

      perform public.update_event_aggregation(v_old_event_id);
    end if;
  end loop;

  -- Asset mit aktueller effektiver Art/Relevanz neu einsortieren.
  v_new_event_id := public.upsert_event_for_asset(p_asset_id, 10);

  return v_new_event_id;
end;
$$;


--
-- Name: refresh_demo_timestamps(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_demo_timestamps() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_demo_org_id uuid := '42a38573-001d-4e7a-b31c-04ef805d90a7';
  v_target_ts timestamptz;
  v_asset_max timestamptz;
  v_delta interval;
  v_event_max timestamptz;
  v_ingest_max timestamptz;
  v_camera_max timestamptz;
begin
  -- Ziel: neuestes Demo-Asset soll immer auf "gestern" gezogen werden
  v_target_ts := now() - interval '1 day';

  select max(a.captured_at)
    into v_asset_max
  from public.assets a
  join public.cameras c on c.id = a.camera_id
  where c.organization_id = v_demo_org_id;

  if v_asset_max is null then
    raise notice 'refresh_demo_timestamps: no demo assets found for org %', v_demo_org_id;
    return;
  end if;

  v_delta := v_target_ts - v_asset_max;

  -- 1) Assets verschieben
  update public.assets a
  set
    created_at = a.created_at + v_delta,
    captured_at = a.captured_at + v_delta
  from public.cameras c
  where a.camera_id = c.id
    and c.organization_id = v_demo_org_id;

  -- 2) Events an das neue Asset-Maximum angleichen
  select max(e.end_at)
    into v_event_max
  from public.events e
  where e.camera_id in (
    select id
    from public.cameras
    where organization_id = v_demo_org_id
  );

  if v_event_max is not null then
    update public.events e
    set
      start_at = e.start_at + (v_target_ts - v_event_max),
      end_at = e.end_at + (v_target_ts - v_event_max),
      created_at = e.created_at + (v_target_ts - v_event_max)
    where e.camera_id in (
      select id
      from public.cameras
      where organization_id = v_demo_org_id
    );
  end if;

  -- 3) Ingest-Batches angleichen
  select max(ib.received_at)
    into v_ingest_max
  from public.ingest_batches ib
  where ib.camera_id in (
    select id
    from public.cameras
    where organization_id = v_demo_org_id
  );

  if v_ingest_max is not null then
    update public.ingest_batches ib
    set received_at = ib.received_at + (v_target_ts - v_ingest_max)
    where ib.camera_id in (
      select id
      from public.cameras
      where organization_id = v_demo_org_id
    );
  end if;

  -- 4) Camera last_seen_at angleichen
  select max(c.last_seen_at)
    into v_camera_max
  from public.cameras c
  where c.organization_id = v_demo_org_id;

  if v_camera_max is not null then
    update public.cameras c
    set last_seen_at = case
      when c.last_seen_at is null then null
      else c.last_seen_at + (v_target_ts - v_camera_max)
    end
    where c.organization_id = v_demo_org_id;
  end if;

  raise notice 'refresh_demo_timestamps: demo org % shifted to target_ts %', v_demo_org_id, v_target_ts;
end;
$$;


--
-- Name: refresh_population_estimate_roe_deer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_population_estimate_roe_deer(p_revier_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_org_id uuid;
begin
  select organization_id
  into v_org_id
  from public.reviers
  where id = p_revier_id;

  if v_org_id is null then
    raise exception 'Revier % not found or has no organization_id', p_revier_id;
  end if;

  delete from public.population_estimates
  where revier_id = p_revier_id
    and species = 'roe_deer'
    and estimate_date = current_date;

  insert into public.population_estimates (
    organization_id,
    revier_id,
    species,
    estimate_date,
    total_presence_days,
    active_cameras,
    local_camera_sum,
    overlap_factor,
    coverage_rate,
    overlap_corrected,
    estimated_population_total,
    estimated_population_per_100ha,
    target_per_100ha,
    target_total,
    harvest_surplus_v0
  )
  with params as (
    select
      max(case when parameter_key = 'overlap_factor' then parameter_value end) as overlap_factor,
      max(case when parameter_key = 'coverage_rate_default' then parameter_value end) as coverage_rate_default,
      public.resolve_population_target_per_100ha(p_revier_id, 'roe_deer'::public.taxonomy_species_v1) as target_per_100ha
    from public.species_population_parameters
    where species = 'roe_deer'
  ),
  base as (
    select
      r.organization_id,
      r.id as revier_id,
      r.area_ha,
      e.camera_id,
      date(e.start_at) as observation_day,
      max(ess.event_species_count) as daily_max_count
    from public.events e
    join public.event_species_summary ess
      on ess.event_id = e.id
    join public.cameras c
      on c.id = e.camera_id
    join public.reviers r
      on r.id = c.revier_id
    where r.id = p_revier_id
      and ess.species = 'roe_deer'
      and e.start_at >= date '2025-04-01'
      and e.start_at <  date '2026-04-01'
    group by
      r.organization_id, r.id, r.area_ha, e.camera_id, date(e.start_at)
  ),
  presence_scored as (
    select
      b.*,
      (
        select count(*)
        from base b2
        where b2.camera_id = b.camera_id
          and b2.observation_day between b.observation_day - 20 and b.observation_day
      ) as rolling_signal_days
    from base b
  ),
  presence_only as (
    select *
    from presence_scored
    where rolling_signal_days >= 3
  ),
  camera_index as (
    select
      organization_id,
      revier_id,
      max(area_ha) as area_ha,
      camera_id,
      percentile_cont(0.9) within group (order by daily_max_count) as camera_signal
    from presence_only
    group by organization_id, revier_id, camera_id
  ),
  revier_presence as (
    select
      organization_id,
      revier_id,
      max(area_ha) as area_ha,
      count(distinct observation_day)::int as total_presence_days
    from presence_only
    group by organization_id, revier_id
  ),
  revier_sum as (
    select
      ci.organization_id,
      ci.revier_id,
      max(ci.area_ha) as area_ha,
      rp.total_presence_days,
      count(*)::int as active_cameras,
      sum(ci.camera_signal) as local_camera_sum
    from camera_index ci
    join revier_presence rp
      on rp.organization_id = ci.organization_id
     and rp.revier_id = ci.revier_id
    group by ci.organization_id, ci.revier_id, rp.total_presence_days
  )
  select
    rs.organization_id,
    rs.revier_id,
    'roe_deer' as species,
    current_date as estimate_date,
    rs.total_presence_days,
    rs.active_cameras,
    rs.local_camera_sum,
    p.overlap_factor,
    p.coverage_rate_default as coverage_rate,
    rs.local_camera_sum * p.overlap_factor as overlap_corrected,
    (rs.local_camera_sum * p.overlap_factor) / p.coverage_rate_default as estimated_population_total,
    ((rs.local_camera_sum * p.overlap_factor) / p.coverage_rate_default) / rs.area_ha * 100 as estimated_population_per_100ha,
    p.target_per_100ha,
    rs.area_ha * p.target_per_100ha / 100 as target_total,
    greatest(
      0,
      ((rs.local_camera_sum * p.overlap_factor) / p.coverage_rate_default)
      - (rs.area_ha * p.target_per_100ha / 100)
    ) as harvest_surplus_v0
  from revier_sum rs
  cross join params p;

end;
$$;


--
-- Name: refresh_population_estimates_for_all_active_reviers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_population_estimates_for_all_active_reviers() RETURNS TABLE(processed_count integer, success_count integer, error_count integer)
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: refresh_population_estimates_for_revier(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_population_estimates_for_revier(p_revier_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_species public.taxonomy_species_v1;
  v_model_family text;
begin
  for v_species, v_model_family in
    select
      m.species,
      m.model_family
    from public.species_population_model_mapping m
    where exists (
      select 1
      from public.events e
      join public.cameras c
        on c.id = e.camera_id
      where c.revier_id = p_revier_id
        and e.top_species = m.species
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
$$;


--
-- Name: regenerate_camera_ingest_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.regenerate_camera_ingest_token(p_camera_id uuid) RETURNS TABLE(camera_id uuid, ingest_token text)
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_ingest_token text;
begin
  v_ingest_token := encode(gen_random_bytes(24), 'hex');

  update public.cameras
  set ingest_token = v_ingest_token
  where id = p_camera_id;

  if not found then
    raise exception 'camera not found';
  end if;

  update public.camera_ingest_configs cic
  set ingest_token = v_ingest_token
  where cic.camera_id = p_camera_id
    and cic.is_active = true;

  camera_id := p_camera_id;
  ingest_token := v_ingest_token;
  return next;
end;
$$;


--
-- Name: resolve_population_target_per_100ha(uuid, public.taxonomy_species_v1); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_population_target_per_100ha(p_revier_id uuid, p_species public.taxonomy_species_v1) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    (
      select rst.target_per_100ha
      from public.revier_species_targets rst
      where rst.revier_id = p_revier_id
        and rst.species = p_species
      limit 1
    ),
    (
      select spp.parameter_value
      from public.species_population_parameters spp
      where spp.species = p_species
        and spp.parameter_key = 'target_per_100ha'
        and spp.valid_to is null
      order by spp.valid_from desc nulls last, spp.created_at desc
      limit 1
    )
  );
$$;


--
-- Name: seed_revier_species_targets(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_revier_species_targets(p_revier_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_organization_id uuid;
begin
  select r.organization_id
  into v_organization_id
  from public.reviers r
  where r.id = p_revier_id;

  if v_organization_id is null then
    raise exception 'Revier % not found or has no organization_id', p_revier_id;
  end if;

  insert into public.revier_species_targets (
    organization_id,
    revier_id,
    species,
    target_per_100ha,
    created_by,
    updated_by
  )
  select
    v_organization_id,
    p_revier_id,
    spp.species,
    spp.parameter_value,
    auth.uid(),
    auth.uid()
  from public.species_population_parameters spp
  where spp.parameter_key = 'target_per_100ha'
    and spp.valid_to is null
    and not exists (
      select 1
      from public.revier_species_targets rst
      where rst.revier_id = p_revier_id
        and rst.species = spp.species
    );
end;
$$;


--
-- Name: seed_revier_species_targets_after_revier_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_revier_species_targets_after_revier_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform public.seed_revier_species_targets(new.id);
  return new;
end;
$$;


--
-- Name: set_profiles_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_profiles_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: set_revier_boundaries_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_revier_boundaries_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: set_revier_boundary_organization_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_revier_boundary_organization_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: set_revier_species_targets_organization_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_revier_species_targets_organization_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_organization_id uuid;
begin
  select r.organization_id
  into v_organization_id
  from public.reviers r
  where r.id = new.revier_id;

  if v_organization_id is null then
    raise exception 'Revier % not found', new.revier_id;
  end if;

  if new.organization_id is not null
     and new.organization_id <> v_organization_id then
    raise exception 'organization_id does not match revier_id';
  end if;

  new.organization_id := v_organization_id;
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;

  new.updated_by := coalesce(auth.uid(), new.updated_by);

  return new;
end;
$$;


--
-- Name: update_event_aggregation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_event_aggregation(p_event_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  with species_rows as (
    select
      ess.event_id,
      ess.species,
      ess.event_species_count,
      ess.best_score,
      coalesce(sw.weight, 0.5) as species_weight
    from public.event_species_summary ess
    left join public.species_weights sw
      on sw.species = ess.species
     and sw.active = true
    where ess.event_id = p_event_id
  ),

  ranked as (
    select
      sr.*,
      (
        0.8 * coalesce(sr.best_score, 0)
        +
        0.2 * coalesce(sr.species_weight, 0.5)
      ) as species_rank
    from species_rows sr
  ),

  best as (
    select *
    from ranked
    order by species_rank desc nulls last, best_score desc nulls last, species asc
    limit 1
  ),

  score_stats as (
    select
      max(species_rank) as max_species_rank,
      avg(species_rank) as avg_species_rank,
      count(*)::int as species_variety
    from ranked
  ),

  asset_stats as (
    select
      count(*)::int as asset_count
    from public.event_assets ea
    where ea.event_id = p_event_id
  ),

  agg as (
    select
      case
        when exists (select 1 from ranked) then 'animal'::text
        else null
      end as top_label,
      (select species from best) as top_species,
      (select event_species_count from best) as top_count,
      case
        when exists (select 1 from ranked) then
          least(
            1.0,
            (
              0.6 * coalesce((select max_species_rank from score_stats), 0)
              +
              0.2 * coalesce((select avg_species_rank from score_stats), 0)
              +
              0.2 * least(1.0, ln(1 + coalesce((select asset_count from asset_stats), 0)) / ln(6))
            )
          )
        else 0
      end as relevance_score
  )

  update public.events e
  set
    top_label = a.top_label,
    top_species = a.top_species,
    top_count = a.top_count,
    relevance_score = a.relevance_score
  from agg a
  where e.id = p_event_id;
end;
$$;


--
-- Name: upsert_event_for_asset(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_event_for_asset(p_asset_id uuid, p_window_minutes integer DEFAULT 10) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_asset record;
  v_anchor_at timestamptz;
  v_asset_species text;
  v_event_id uuid;
begin
  select
    av.id,
    av.camera_id,
    av.captured_at,
    av.created_at,
    av.relevant_effective
  into v_asset
  from public.assets_v av
  where av.id = p_asset_id;

  if not found then
    raise exception 'Asset % not found', p_asset_id;
  end if;

  -- Manuell oder systemisch irrelevante Assets dürfen keine Events erzeugen.
  if coalesce(v_asset.relevant_effective, false) is not true then
    return null;
  end if;

  v_anchor_at := coalesce(v_asset.captured_at, v_asset.created_at);
  v_asset_species := public.get_asset_event_species(p_asset_id);

  select e.id
  into v_event_id
  from public.events e
  where e.camera_id = v_asset.camera_id
    and e.top_species::text is not distinct from v_asset_species
    and e.start_at is not null
    and e.end_at is not null
    and v_anchor_at >= e.start_at - make_interval(mins => p_window_minutes)
    and v_anchor_at <= e.end_at + make_interval(mins => p_window_minutes)
  order by
    e.end_at desc nulls last,
    e.start_at desc nulls last
  limit 1;

  if v_event_id is not null then
    update public.events
    set
      start_at = least(start_at, v_anchor_at),
      end_at = greatest(end_at, v_anchor_at)
    where id = v_event_id;
  else
    insert into public.events (camera_id, start_at, end_at, created_at)
    values (v_asset.camera_id, v_anchor_at, v_anchor_at, now())
    returning id into v_event_id;
  end if;

  insert into public.event_assets (event_id, asset_id)
  values (v_event_id, v_asset.id)
  on conflict do nothing;

  perform public.update_event_aggregation(v_event_id);

  return v_event_id;
end;
$$;


--
-- Name: asset_detections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_detections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    model text NOT NULL,
    model_version text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_empty boolean NOT NULL,
    has_animal boolean NOT NULL,
    has_person boolean NOT NULL,
    has_vehicle boolean NOT NULL,
    best_animal_conf real,
    best_person_conf real,
    best_vehicle_conf real,
    raw jsonb
);


--
-- Name: assets_v; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.assets_v WITH (security_invoker='true') AS
 SELECT id,
    camera_id,
    captured_at,
    storage_path,
    file_hash,
    status,
    created_at,
    relevant,
    ingest_batch_id,
    attempts,
    processing_started_at,
    processed_at,
    last_error,
    worker_id,
    empty,
    empty_confidence,
    COALESCE(relevant_user, relevant) AS relevant_effective,
    relevant_user
   FROM public.assets;


--
-- Name: detections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.detections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    label text NOT NULL,
    species public.taxonomy_species_v1,
    count integer,
    score real,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    species_user public.taxonomy_species_v1
);


--
-- Name: asset_species_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.asset_species_summary WITH (security_invoker='true') AS
 SELECT d.asset_id,
    COALESCE(d.species_user, d.species) AS species,
    (count(DISTINCT (d.meta ->> 'md_idx'::text)))::integer AS animal_count,
    max(d.score) AS best_score
   FROM (public.detections d
     JOIN public.assets_v a ON ((a.id = d.asset_id)))
  WHERE ((d.label = 'animal'::text) AND (a.relevant_effective = true) AND (COALESCE(d.species_user, d.species) IS NOT NULL))
  GROUP BY d.asset_id, COALESCE(d.species_user, d.species);


--
-- Name: camera_health_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.camera_health_rules (
    import_method text NOT NULL,
    stale_after_minutes integer NOT NULL,
    offline_after_minutes integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.camera_health_rules FORCE ROW LEVEL SECURITY;


--
-- Name: cameras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cameras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    revier_id uuid NOT NULL,
    name text NOT NULL,
    location_name text,
    import_method text DEFAULT 'email'::text NOT NULL,
    ingest_token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone,
    brand text,
    model text,
    latitude double precision,
    longitude double precision,
    direction_deg integer,
    is_active boolean DEFAULT true NOT NULL,
    installed_at timestamp with time zone,
    notes text,
    technical_name text NOT NULL,
    organization_id uuid NOT NULL,
    clock_offset_minutes integer DEFAULT 0 NOT NULL,
    CONSTRAINT cameras_direction_deg_check CHECK (((direction_deg IS NULL) OR ((direction_deg >= 0) AND (direction_deg < 360)))),
    CONSTRAINT cameras_technical_name_format_check CHECK (((technical_name IS NULL) OR (technical_name ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text)))
);


--
-- Name: camera_health; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.camera_health WITH (security_invoker='true') AS
 WITH defaults AS (
         SELECT 60 AS stale_after_minutes_default,
            1440 AS offline_after_minutes_default
        )
 SELECT c.id,
    c.name,
    c.import_method,
    c.last_seen_at,
    COALESCE(r.stale_after_minutes, d.stale_after_minutes_default) AS stale_after_minutes,
    COALESCE(r.offline_after_minutes, d.offline_after_minutes_default) AS offline_after_minutes,
        CASE
            WHEN (c.last_seen_at IS NULL) THEN 'unknown'::text
            WHEN ((now() - c.last_seen_at) < make_interval(mins => COALESCE(r.stale_after_minutes, d.stale_after_minutes_default))) THEN 'online'::text
            WHEN ((now() - c.last_seen_at) < make_interval(mins => COALESCE(r.offline_after_minutes, d.offline_after_minutes_default))) THEN 'stale'::text
            ELSE 'offline'::text
        END AS health_status
   FROM ((public.cameras c
     LEFT JOIN public.camera_health_rules r ON ((r.import_method = c.import_method)))
     CROSS JOIN defaults d);


--
-- Name: camera_ingest_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.camera_ingest_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    camera_id uuid NOT NULL,
    method text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    smtp_alias text,
    ftp_username text,
    ftp_inbox_path text,
    manual_label text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ingest_token text,
    vendor text,
    external_key text,
    provisioning_status text DEFAULT 'pending'::text NOT NULL,
    ftp_host text,
    ftp_port integer,
    provisioned_at timestamp with time zone,
    deprovisioned_at timestamp with time zone,
    last_provisioning_error text,
    ftp_password text,
    CONSTRAINT camera_ingest_configs_direction_check CHECK ((((method = 'smtp'::text) AND (smtp_alias IS NOT NULL)) OR ((method = 'ftp'::text) AND (ftp_username IS NOT NULL)) OR (method = 'manual'::text))),
    CONSTRAINT camera_ingest_configs_method_check CHECK ((method = ANY (ARRAY['smtp'::text, 'ftp'::text, 'manual'::text]))),
    CONSTRAINT camera_ingest_configs_provisioning_status_check CHECK ((provisioning_status = ANY (ARRAY['pending'::text, 'ready'::text, 'failed'::text, 'disabled'::text, 'deprovisioned'::text])))
);


--
-- Name: COLUMN camera_ingest_configs.ftp_password; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.camera_ingest_configs.ftp_password IS 'Plain FTP password for wildlife camera provisioning. Intentionally stored for operational usability because camera FTP credentials are low-sensitivity and must remain recoverable by organization admins.';


--
-- Name: camera_vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.camera_vendors (
    key text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_assets (
    event_id uuid NOT NULL,
    asset_id uuid NOT NULL
);


--
-- Name: event_feed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.event_feed AS
SELECT
    NULL::uuid AS id,
    NULL::uuid AS camera_id,
    NULL::timestamp with time zone AS start_at,
    NULL::timestamp with time zone AS end_at,
    NULL::text AS top_label,
    NULL::public.taxonomy_species_v1 AS top_species,
    NULL::integer AS top_count,
    NULL::real AS relevance_score,
    NULL::timestamp with time zone AS created_at,
    NULL::integer AS asset_count;


--
-- Name: event_species_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.event_species_summary WITH (security_invoker='true') AS
 SELECT ea.event_id,
    s.species,
    max(s.animal_count) AS event_species_count,
    max(s.best_score) AS best_score
   FROM (public.event_assets ea
     JOIN public.asset_species_summary s ON ((s.asset_id = ea.asset_id)))
  GROUP BY ea.event_id, s.species;


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    camera_id uuid NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    top_label text,
    top_species public.taxonomy_species_v1,
    top_count integer,
    relevance_score real DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ingest_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingest_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    camera_id uuid,
    received_at timestamp with time zone DEFAULT now(),
    source text,
    file_count integer,
    status text DEFAULT 'processing'::text,
    error_summary text,
    meta jsonb
);


--
-- Name: organization_camera_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_camera_sequences (
    organization_id uuid NOT NULL,
    last_sequence integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_camera_sequences_last_sequence_check CHECK ((last_sequence >= 0))
);


--
-- Name: organization_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    token text NOT NULL,
    invited_by_user_id uuid,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text,
    provider_message_id text,
    email_sent_at timestamp with time zone,
    email_error text,
    language text DEFAULT 'de'::text NOT NULL,
    CONSTRAINT organization_invites_language_check CHECK ((language = ANY (ARRAY['de'::text, 'en'::text]))),
    CONSTRAINT organization_invites_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'viewer'::text]))),
    CONSTRAINT organization_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])))
);

ALTER TABLE ONLY public.organization_invites FORCE ROW LEVEL SECURITY;


--
-- Name: organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_members (
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'invited'::text NOT NULL,
    accepted_at timestamp with time zone,
    CONSTRAINT organization_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'viewer'::text]))),
    CONSTRAINT organization_members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);


--
-- Name: organization_subscription_change_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_subscription_change_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    requested_by_user_id uuid NOT NULL,
    current_plan_key text NOT NULL,
    requested_plan_key text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    request_type text DEFAULT 'upgrade'::text NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    processed_by_user_id uuid,
    resolution_note text,
    CONSTRAINT organization_subscription_change_requests_current_plan_key_chec CHECK ((current_plan_key = ANY (ARRAY['starter'::text, 'pro'::text, 'enterprise'::text]))),
    CONSTRAINT organization_subscription_change_requests_request_type_check CHECK ((request_type = ANY (ARRAY['upgrade'::text, 'downgrade'::text, 'change'::text]))),
    CONSTRAINT organization_subscription_change_requests_requested_plan_key_ch CHECK ((requested_plan_key = ANY (ARRAY['starter'::text, 'pro'::text, 'enterprise'::text]))),
    CONSTRAINT organization_subscription_change_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'approved'::text, 'rejected'::text, 'canceled'::text])))
);

ALTER TABLE ONLY public.organization_subscription_change_requests FORCE ROW LEVEL SECURITY;


--
-- Name: organization_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    plan_key text NOT NULL,
    status text NOT NULL,
    billing_cycle text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    trial_ends_at timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    canceled_at timestamp with time zone,
    price_amount_cents integer DEFAULT 0 NOT NULL,
    price_currency text DEFAULT 'EUR'::text NOT NULL,
    max_cameras integer NOT NULL,
    max_members integer NOT NULL,
    billing_provider text DEFAULT 'none'::text NOT NULL,
    provider_customer_id text,
    provider_subscription_id text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scheduled_plan_key text,
    scheduled_change_type text,
    scheduled_change_effective_at timestamp with time zone,
    CONSTRAINT organization_subscriptions_billing_cycle_check CHECK ((billing_cycle = ANY (ARRAY['monthly'::text, 'yearly'::text]))),
    CONSTRAINT organization_subscriptions_billing_provider_check CHECK ((billing_provider = ANY (ARRAY['none'::text, 'manual'::text, 'stripe'::text]))),
    CONSTRAINT organization_subscriptions_max_cameras_check CHECK ((max_cameras >= 0)),
    CONSTRAINT organization_subscriptions_max_members_check CHECK ((max_members >= 0)),
    CONSTRAINT organization_subscriptions_plan_key_check CHECK ((plan_key = ANY (ARRAY['starter'::text, 'pro'::text, 'enterprise'::text]))),
    CONSTRAINT organization_subscriptions_price_amount_cents_check CHECK ((price_amount_cents >= 0)),
    CONSTRAINT organization_subscriptions_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'expired'::text])))
);

ALTER TABLE ONLY public.organization_subscriptions FORCE ROW LEVEL SECURITY;


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    kind text DEFAULT 'customer'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    owner_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    legal_name text,
    legal_form text,
    contact_person text,
    billing_email text,
    billing_street text,
    billing_postal_code text,
    billing_city text,
    billing_country text DEFAULT 'DE'::text,
    vat_id text,
    logo_url text,
    customer_reference text,
    is_demo boolean DEFAULT false NOT NULL,
    camera_code text DEFAULT public.generate_unique_camera_code() NOT NULL,
    CONSTRAINT organizations_camera_code_format_chk CHECK ((camera_code ~ '^[a-z0-9]{5}$'::text)),
    CONSTRAINT organizations_kind_check CHECK ((kind = ANY (ARRAY['demo'::text, 'test'::text, 'customer'::text]))),
    CONSTRAINT organizations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text])))
);


--
-- Name: population_estimates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.population_estimates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    revier_id uuid NOT NULL,
    species public.taxonomy_species_v1 NOT NULL,
    estimate_date date DEFAULT CURRENT_DATE NOT NULL,
    total_presence_days numeric,
    active_cameras integer,
    local_camera_sum numeric,
    overlap_factor numeric,
    coverage_rate numeric,
    overlap_corrected numeric,
    estimated_population_total numeric,
    estimated_population_per_100ha numeric,
    target_per_100ha numeric,
    target_total numeric,
    harvest_surplus_v0 numeric,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.population_estimates FORCE ROW LEVEL SECURITY;


--
-- Name: population_gold_benchmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.population_gold_benchmarks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    revier_id uuid NOT NULL,
    species public.taxonomy_species_v1 NOT NULL,
    benchmark_label text DEFAULT 'gold_model_v1'::text NOT NULL,
    benchmark_date date DEFAULT CURRENT_DATE NOT NULL,
    total_presence_days numeric,
    active_cameras integer,
    local_camera_sum numeric,
    overlap_factor numeric,
    coverage_rate numeric,
    overlap_corrected numeric,
    estimated_population_total numeric,
    estimated_population_per_100ha numeric,
    target_per_100ha numeric,
    target_total numeric,
    harvest_surplus_v0 numeric,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.population_gold_benchmarks FORCE ROW LEVEL SECURITY;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    preferred_language text DEFAULT 'de'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_preferred_language_check CHECK ((preferred_language = ANY (ARRAY['de'::text, 'en'::text])))
);


--
-- Name: revier_boundaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.revier_boundaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    revier_id uuid NOT NULL,
    name text DEFAULT 'Revierkontur'::text NOT NULL,
    geometry jsonb NOT NULL,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT revier_boundaries_geometry_is_feature_or_collection CHECK (((geometry ? 'type'::text) AND ((geometry ->> 'type'::text) = ANY (ARRAY['Feature'::text, 'FeatureCollection'::text]))))
);


--
-- Name: reviers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    area_ha integer NOT NULL,
    region text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    country text DEFAULT 'DE'::text,
    notes text,
    organization_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    timezone text DEFAULT 'Europe/Berlin'::text NOT NULL,
    CONSTRAINT reviers_area_ha_check CHECK (((area_ha IS NULL) OR (area_ha >= 0))),
    CONSTRAINT reviers_area_ha_positive CHECK ((area_ha > 0)),
    CONSTRAINT reviers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'archived'::text])))
);


--
-- Name: revier_camera_coverage; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.revier_camera_coverage WITH (security_invoker='true') AS
 SELECT r.id AS revier_id,
    r.organization_id,
    r.name AS revier_name,
    r.area_ha,
    count(c.id) FILTER (WHERE c.is_active) AS active_cameras,
    round(LEAST(1.0, (((count(c.id) FILTER (WHERE c.is_active))::numeric * 30.0) / (NULLIF(r.area_ha, 0))::numeric)), 2) AS coverage_rate
   FROM (public.reviers r
     LEFT JOIN public.cameras c ON ((c.revier_id = r.id)))
  GROUP BY r.id, r.organization_id, r.name, r.area_ha;


--
-- Name: revier_species_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.revier_species_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    revier_id uuid NOT NULL,
    species public.taxonomy_species_v1 NOT NULL,
    target_per_100ha numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT revier_species_targets_non_negative CHECK ((target_per_100ha >= (0)::numeric)),
    CONSTRAINT revier_species_targets_reasonable CHECK ((target_per_100ha <= (1000)::numeric))
);


--
-- Name: species_population_model_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.species_population_model_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    species public.taxonomy_species_v1 NOT NULL,
    model_family text NOT NULL,
    uses_presence_days boolean DEFAULT true NOT NULL,
    uses_group_signal boolean DEFAULT false NOT NULL,
    uses_activity_weighting boolean DEFAULT false NOT NULL,
    uses_log_damping boolean DEFAULT false NOT NULL,
    uses_seasonal_window boolean DEFAULT false NOT NULL,
    uses_territorial_interpretation boolean DEFAULT false NOT NULL,
    special_logic_flags jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.species_population_model_mapping FORCE ROW LEVEL SECURITY;


--
-- Name: species_population_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.species_population_models (
    species public.taxonomy_species_v1 NOT NULL,
    model_family text NOT NULL,
    estimation_goal text NOT NULL,
    social_structure text,
    duplicate_window_minutes integer,
    cross_camera_merge_minutes integer,
    uses_group_size boolean DEFAULT false NOT NULL,
    uses_activity_correction boolean DEFAULT false NOT NULL,
    uses_detection_zone boolean DEFAULT false NOT NULL,
    uses_movement_rate boolean DEFAULT false NOT NULL,
    uses_seasonality_factor boolean DEFAULT false NOT NULL,
    minimum_events_required integer,
    minimum_camera_days_required integer,
    confidence_logic text,
    management_relevant boolean DEFAULT true NOT NULL,
    harvest_enabled boolean DEFAULT true NOT NULL,
    formula_version text DEFAULT 'v0.1'::text NOT NULL,
    notes_internal text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.species_population_models FORCE ROW LEVEL SECURITY;


--
-- Name: species_population_parameters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.species_population_parameters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    species public.taxonomy_species_v1 NOT NULL,
    parameter_key text NOT NULL,
    parameter_value numeric NOT NULL,
    unit text,
    source_type text NOT NULL,
    source_note text,
    valid_from date,
    valid_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.species_population_parameters FORCE ROW LEVEL SECURITY;


--
-- Name: species_weights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.species_weights (
    species public.taxonomy_species_v1 NOT NULL,
    weight real NOT NULL,
    active boolean DEFAULT true NOT NULL,
    notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: taxonomy_species_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taxonomy_species_meta (
    species public.taxonomy_species_v1 NOT NULL,
    label_de text NOT NULL,
    label_en text NOT NULL,
    CONSTRAINT taxonomy_species_meta_label_de_not_blank CHECK ((btrim(label_de) <> ''::text)),
    CONSTRAINT taxonomy_species_meta_label_en_not_blank CHECK ((btrim(label_en) <> ''::text))
);


--
-- Name: asset_detections asset_detections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_detections
    ADD CONSTRAINT asset_detections_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: camera_health_rules camera_health_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.camera_health_rules
    ADD CONSTRAINT camera_health_rules_pkey PRIMARY KEY (import_method);


--
-- Name: camera_ingest_configs camera_ingest_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.camera_ingest_configs
    ADD CONSTRAINT camera_ingest_configs_pkey PRIMARY KEY (id);


--
-- Name: camera_vendors camera_vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.camera_vendors
    ADD CONSTRAINT camera_vendors_pkey PRIMARY KEY (key);


--
-- Name: cameras cameras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cameras
    ADD CONSTRAINT cameras_pkey PRIMARY KEY (id);


--
-- Name: detections detections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detections
    ADD CONSTRAINT detections_pkey PRIMARY KEY (id);


--
-- Name: event_assets event_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_assets
    ADD CONSTRAINT event_assets_pkey PRIMARY KEY (event_id, asset_id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: ingest_batches ingest_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_batches
    ADD CONSTRAINT ingest_batches_pkey PRIMARY KEY (id);


--
-- Name: organization_camera_sequences organization_camera_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_camera_sequences
    ADD CONSTRAINT organization_camera_sequences_pkey PRIMARY KEY (organization_id);


--
-- Name: organization_invites organization_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_pkey PRIMARY KEY (id);


--
-- Name: organization_invites organization_invites_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_token_key UNIQUE (token);


--
-- Name: organization_members organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (organization_id, user_id);


--
-- Name: organization_subscription_change_requests organization_subscription_change_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_subscription_change_requests
    ADD CONSTRAINT organization_subscription_change_requests_pkey PRIMARY KEY (id);


--
-- Name: organization_subscriptions organization_subscriptions_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_subscriptions
    ADD CONSTRAINT organization_subscriptions_organization_id_key UNIQUE (organization_id);


--
-- Name: organization_subscriptions organization_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_subscriptions
    ADD CONSTRAINT organization_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: population_estimates population_estimates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.population_estimates
    ADD CONSTRAINT population_estimates_pkey PRIMARY KEY (id);


--
-- Name: population_gold_benchmarks population_gold_benchmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.population_gold_benchmarks
    ADD CONSTRAINT population_gold_benchmarks_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: revier_boundaries revier_boundaries_one_per_revier; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revier_boundaries
    ADD CONSTRAINT revier_boundaries_one_per_revier UNIQUE (revier_id);


--
-- Name: revier_boundaries revier_boundaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revier_boundaries
    ADD CONSTRAINT revier_boundaries_pkey PRIMARY KEY (id);


--
-- Name: revier_species_targets revier_species_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revier_species_targets
    ADD CONSTRAINT revier_species_targets_pkey PRIMARY KEY (id);


--
-- Name: revier_species_targets revier_species_targets_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revier_species_targets
    ADD CONSTRAINT revier_species_targets_unique UNIQUE (revier_id, species);


--
-- Name: reviers reviers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviers
    ADD CONSTRAINT reviers_pkey PRIMARY KEY (id);


--
-- Name: species_population_model_mapping species_population_model_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.species_population_model_mapping
    ADD CONSTRAINT species_population_model_mapping_pkey PRIMARY KEY (id);


--
-- Name: species_population_models species_population_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.species_population_models
    ADD CONSTRAINT species_population_models_pkey PRIMARY KEY (species);


--
-- Name: species_population_parameters species_population_parameters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.species_population_parameters
    ADD CONSTRAINT species_population_parameters_pkey PRIMARY KEY (id);


--
-- Name: species_population_parameters species_population_parameters_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.species_population_parameters
    ADD CONSTRAINT species_population_parameters_unique UNIQUE (species, parameter_key, valid_from);


--
-- Name: species_weights species_weights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.species_weights
    ADD CONSTRAINT species_weights_pkey PRIMARY KEY (species);


--
-- Name: taxonomy_species_meta taxonomy_species_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_species_meta
    ADD CONSTRAINT taxonomy_species_meta_pkey PRIMARY KEY (species);


--
-- Name: asset_detections_asset_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX asset_detections_asset_id_idx ON public.asset_detections USING btree (asset_id);


--
-- Name: assets_camera_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assets_camera_created_idx ON public.assets USING btree (camera_id, created_at DESC);


--
-- Name: assets_storage_delete_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assets_storage_delete_due_idx ON public.assets USING btree (storage_delete_after) WHERE ((storage_delete_after IS NOT NULL) AND (storage_deleted_at IS NULL));


--
-- Name: camera_ingest_configs_ftp_inbox_path_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX camera_ingest_configs_ftp_inbox_path_key ON public.camera_ingest_configs USING btree (ftp_inbox_path) WHERE (ftp_inbox_path IS NOT NULL);


--
-- Name: camera_ingest_configs_ftp_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX camera_ingest_configs_ftp_username_key ON public.camera_ingest_configs USING btree (ftp_username) WHERE (ftp_username IS NOT NULL);


--
-- Name: camera_ingest_configs_smtp_alias_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX camera_ingest_configs_smtp_alias_key ON public.camera_ingest_configs USING btree (smtp_alias) WHERE (smtp_alias IS NOT NULL);


--
-- Name: cameras_technical_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cameras_technical_name_key ON public.cameras USING btree (technical_name);


--
-- Name: detections_asset_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX detections_asset_id_idx ON public.detections USING btree (asset_id);


--
-- Name: detections_species_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX detections_species_idx ON public.detections USING btree (species);


--
-- Name: event_assets_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX event_assets_unique ON public.event_assets USING btree (event_id, asset_id);


--
-- Name: events_camera_end_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_camera_end_idx ON public.events USING btree (camera_id, end_at DESC);


--
-- Name: idx_assets_camera_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_camera_created ON public.assets USING btree (camera_id, created_at DESC);


--
-- Name: idx_assets_processing_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_processing_started ON public.assets USING btree (status, processing_started_at);


--
-- Name: idx_assets_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_status_created ON public.assets USING btree (status, created_at);


--
-- Name: idx_batches_camera_received; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_camera_received ON public.ingest_batches USING btree (camera_id, received_at DESC);


--
-- Name: idx_camera_ingest_configs_active_ftp_username; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_camera_ingest_configs_active_ftp_username ON public.camera_ingest_configs USING btree (ftp_username) WHERE ((is_active = true) AND (ftp_username IS NOT NULL));


--
-- Name: idx_camera_ingest_configs_active_ingest_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_camera_ingest_configs_active_ingest_token ON public.camera_ingest_configs USING btree (ingest_token) WHERE ((is_active = true) AND (ingest_token IS NOT NULL));


--
-- Name: idx_camera_ingest_configs_active_manual_label; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_camera_ingest_configs_active_manual_label ON public.camera_ingest_configs USING btree (manual_label) WHERE ((is_active = true) AND (manual_label IS NOT NULL));


--
-- Name: idx_camera_ingest_configs_active_smtp_alias; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_camera_ingest_configs_active_smtp_alias ON public.camera_ingest_configs USING btree (smtp_alias) WHERE ((is_active = true) AND (smtp_alias IS NOT NULL));


--
-- Name: idx_camera_ingest_configs_camera_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_camera_ingest_configs_camera_id ON public.camera_ingest_configs USING btree (camera_id);


--
-- Name: idx_camera_ingest_configs_method; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_camera_ingest_configs_method ON public.camera_ingest_configs USING btree (method);


--
-- Name: idx_camera_ingest_configs_one_active_per_camera_method; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_camera_ingest_configs_one_active_per_camera_method ON public.camera_ingest_configs USING btree (camera_id, method) WHERE (is_active = true);


--
-- Name: idx_camera_ingest_configs_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_camera_ingest_configs_vendor ON public.camera_ingest_configs USING btree (vendor);


--
-- Name: idx_cameras_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cameras_organization_id ON public.cameras USING btree (organization_id);


--
-- Name: idx_cameras_technical_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_cameras_technical_name ON public.cameras USING btree (technical_name) WHERE (technical_name IS NOT NULL);


--
-- Name: idx_ingest_batches_meta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingest_batches_meta ON public.ingest_batches USING gin (meta);


--
-- Name: idx_organization_camera_sequences_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_camera_sequences_updated_at ON public.organization_camera_sequences USING btree (updated_at);


--
-- Name: idx_organization_invites_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_invites_language ON public.organization_invites USING btree (language);


--
-- Name: idx_organization_members_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_members_organization_id ON public.organization_members USING btree (organization_id);


--
-- Name: idx_organization_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_members_user_id ON public.organization_members USING btree (user_id);


--
-- Name: idx_organization_subscriptions_plan_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_subscriptions_plan_key ON public.organization_subscriptions USING btree (plan_key);


--
-- Name: idx_organization_subscriptions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_subscriptions_status ON public.organization_subscriptions USING btree (status);


--
-- Name: idx_profiles_preferred_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_preferred_language ON public.profiles USING btree (preferred_language);


--
-- Name: idx_reviers_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviers_organization_id ON public.reviers USING btree (organization_id);


--
-- Name: idx_reviers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviers_status ON public.reviers USING btree (status);


--
-- Name: idx_subscription_change_requests_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_change_requests_created_at ON public.organization_subscription_change_requests USING btree (created_at DESC);


--
-- Name: idx_subscription_change_requests_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_change_requests_organization_id ON public.organization_subscription_change_requests USING btree (organization_id);


--
-- Name: idx_subscription_change_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_change_requests_status ON public.organization_subscription_change_requests USING btree (status);


--
-- Name: organization_invites_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_email_idx ON public.organization_invites USING btree (email);


--
-- Name: organization_invites_email_sent_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_email_sent_at_idx ON public.organization_invites USING btree (email_sent_at);


--
-- Name: organization_invites_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_organization_id_idx ON public.organization_invites USING btree (organization_id);


--
-- Name: organization_invites_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_provider_idx ON public.organization_invites USING btree (provider);


--
-- Name: organization_invites_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_invites_status_idx ON public.organization_invites USING btree (status);


--
-- Name: organizations_camera_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_camera_code_key ON public.organizations USING btree (camera_code);


--
-- Name: population_gold_benchmarks_label_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX population_gold_benchmarks_label_idx ON public.population_gold_benchmarks USING btree (benchmark_label);


--
-- Name: population_gold_benchmarks_revier_species_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX population_gold_benchmarks_revier_species_idx ON public.population_gold_benchmarks USING btree (revier_id, species);


--
-- Name: reviers_one_default_per_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reviers_one_default_per_org_idx ON public.reviers USING btree (organization_id) WHERE (is_default = true);


--
-- Name: species_population_model_mapping_family_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX species_population_model_mapping_family_idx ON public.species_population_model_mapping USING btree (model_family);


--
-- Name: species_population_model_mapping_species_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX species_population_model_mapping_species_uidx ON public.species_population_model_mapping USING btree (species);


--
-- Name: event_feed _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.event_feed WITH (security_invoker='true') AS
 SELECT e.id,
    e.camera_id,
    e.start_at,
    e.end_at,
    e.top_label,
    e.top_species,
    e.top_count,
    e.relevance_score,
    e.created_at,
    (count(ea.asset_id))::integer AS asset_count
   FROM (public.events e
     LEFT JOIN public.event_assets ea ON ((ea.event_id = e.id)))
  GROUP BY e.id;


--
-- Name: organizations create_default_revier_for_organization_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER create_default_revier_for_organization_trigger AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.create_default_revier_for_organization();


--
-- Name: reviers prevent_delete_default_revier_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_delete_default_revier_trigger BEFORE DELETE ON public.reviers FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_default_revier();


--
-- Name: revier_boundaries revier_boundaries_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER revier_boundaries_set_updated_at BEFORE UPDATE ON public.revier_boundaries FOR EACH ROW EXECUTE FUNCTION public.set_revier_boundaries_updated_at();


--
-- Name: revier_boundaries revier_boundaries_validate_organization_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER revier_boundaries_validate_organization_id BEFORE INSERT OR UPDATE OF organization_id, revier_id ON public.revier_boundaries FOR EACH ROW EXECUTE FUNCTION public.set_revier_boundary_organization_id();


--
-- Name: organizations trg_create_default_subscription_for_organization; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_create_default_subscription_for_organization AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.create_default_subscription_for_organization();


--
-- Name: profiles trg_profiles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_profiles_updated_at();


--
-- Name: reviers trg_seed_revier_species_targets_after_revier_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seed_revier_species_targets_after_revier_insert AFTER INSERT ON public.reviers FOR EACH ROW EXECUTE FUNCTION public.seed_revier_species_targets_after_revier_insert();


--
-- Name: revier_species_targets trg_set_revier_species_targets_organization_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_revier_species_targets_organization_id BEFORE INSERT OR UPDATE OF revier_id, organization_id, target_per_100ha ON public.revier_species_targets FOR EACH ROW EXECUTE FUNCTION public.set_revier_species_targets_organization_id();


--
-- Name: asset_detections asset_detections_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_detections
    ADD CONSTRAINT asset_detections_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: assets assets_camera_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_camera_id_fkey FOREIGN KEY (camera_id) REFERENCES public.cameras(id) ON DELETE CASCADE;


--
-- Name: assets assets_ingest_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_ingest_batch_id_fkey FOREIGN KEY (ingest_batch_id) REFERENCES public.ingest_batches(id) ON DELETE SET NULL;


--
-- Name: camera_ingest_configs camera_ingest_configs_camera_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.camera_ingest_configs
    ADD CONSTRAINT camera_ingest_configs_camera_id_fkey FOREIGN KEY (camera_id) REFERENCES public.cameras(id) ON DELETE CASCADE;


--
-- Name: cameras cameras_organization_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cameras
    ADD CONSTRAINT cameras_organization_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: cameras cameras_revier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cameras
    ADD CONSTRAINT cameras_revier_id_fkey FOREIGN KEY (revier_id) REFERENCES public.reviers(id);


--
-- Name: detections detections_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detections
    ADD CONSTRAINT detections_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: event_assets event_assets_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_assets
    ADD CONSTRAINT event_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: event_assets event_assets_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_assets
    ADD CONSTRAINT event_assets_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: events events_camera_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_camera_id_fkey FOREIGN KEY (camera_id) REFERENCES public.cameras(id) ON DELETE CASCADE;


--
-- Name: ingest_batches ingest_batches_camera_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_batches
    ADD CONSTRAINT ingest_batches_camera_id_fkey FOREIGN KEY (camera_id) REFERENCES public.cameras(id) ON DELETE CASCADE;


--
-- Name: organization_camera_sequences organization_camera_sequences_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_camera_sequences
    ADD CONSTRAINT organization_camera_sequences_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_invites organization_invites_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organization_subscription_change_requests organization_subscription_change_requests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_subscription_change_requests
    ADD CONSTRAINT organization_subscription_change_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_subscriptions organization_subscriptions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_subscriptions
    ADD CONSTRAINT organization_subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: revier_boundaries revier_boundaries_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revier_boundaries
    ADD CONSTRAINT revier_boundaries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: revier_boundaries revier_boundaries_revier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revier_boundaries
    ADD CONSTRAINT revier_boundaries_revier_id_fkey FOREIGN KEY (revier_id) REFERENCES public.reviers(id) ON DELETE CASCADE;


--
-- Name: revier_species_targets revier_species_targets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revier_species_targets
    ADD CONSTRAINT revier_species_targets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: revier_species_targets revier_species_targets_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revier_species_targets
    ADD CONSTRAINT revier_species_targets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: revier_species_targets revier_species_targets_revier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revier_species_targets
    ADD CONSTRAINT revier_species_targets_revier_id_fkey FOREIGN KEY (revier_id) REFERENCES public.reviers(id) ON DELETE CASCADE;


--
-- Name: revier_species_targets revier_species_targets_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revier_species_targets
    ADD CONSTRAINT revier_species_targets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: reviers reviers_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviers
    ADD CONSTRAINT reviers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: camera_vendors Authenticated users can read active camera vendors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read active camera vendors" ON public.camera_vendors FOR SELECT TO authenticated USING ((active = true));


--
-- Name: asset_detections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asset_detections ENABLE ROW LEVEL SECURITY;

--
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

--
-- Name: camera_health_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.camera_health_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: camera_ingest_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.camera_ingest_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: camera_vendors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.camera_vendors ENABLE ROW LEVEL SECURITY;

--
-- Name: cameras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cameras ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_detections deny all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deny all" ON public.asset_detections TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: assets deny all (anon/auth); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deny all (anon/auth)" ON public.assets TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: cameras deny all (anon/auth); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deny all (anon/auth)" ON public.cameras TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: detections deny all (anon/auth); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deny all (anon/auth)" ON public.detections TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: event_assets deny all (anon/auth); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deny all (anon/auth)" ON public.event_assets TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: events deny all (anon/auth); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deny all (anon/auth)" ON public.events TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: ingest_batches deny all (anon/auth); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deny all (anon/auth)" ON public.ingest_batches TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: reviers deny all (anon/auth); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "deny all (anon/auth)" ON public.reviers TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: detections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.detections ENABLE ROW LEVEL SECURITY;

--
-- Name: event_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: ingest_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ingest_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_camera_sequences no_direct_access_org_camera_sequences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY no_direct_access_org_camera_sequences ON public.organization_camera_sequences TO authenticated, anon USING (false) WITH CHECK (false);


--
-- Name: organization_camera_sequences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_camera_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_invites organization_invites_org_admins_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_invites_org_admins_delete ON public.organization_invites FOR DELETE TO authenticated USING (private.is_org_admin(organization_id));


--
-- Name: organization_invites organization_invites_org_admins_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_invites_org_admins_insert ON public.organization_invites FOR INSERT TO authenticated WITH CHECK (private.is_org_admin(organization_id));


--
-- Name: organization_invites organization_invites_org_admins_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_invites_org_admins_select ON public.organization_invites FOR SELECT TO authenticated USING (private.is_org_admin(organization_id));


--
-- Name: organization_invites organization_invites_org_admins_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_invites_org_admins_update ON public.organization_invites FOR UPDATE TO authenticated USING (private.is_org_admin(organization_id)) WITH CHECK (private.is_org_admin(organization_id));


--
-- Name: organization_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_subscription_change_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_subscription_change_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_subscription_change_requests organization_subscription_change_requests_org_admins_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_subscription_change_requests_org_admins_delete ON public.organization_subscription_change_requests FOR DELETE TO authenticated USING (private.is_org_admin(organization_id));


--
-- Name: organization_subscription_change_requests organization_subscription_change_requests_org_admins_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_subscription_change_requests_org_admins_insert ON public.organization_subscription_change_requests FOR INSERT TO authenticated WITH CHECK (private.is_org_admin(organization_id));


--
-- Name: organization_subscription_change_requests organization_subscription_change_requests_org_admins_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_subscription_change_requests_org_admins_update ON public.organization_subscription_change_requests FOR UPDATE TO authenticated USING (private.is_org_admin(organization_id)) WITH CHECK (private.is_org_admin(organization_id));


--
-- Name: organization_subscription_change_requests organization_subscription_change_requests_org_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_subscription_change_requests_org_members_select ON public.organization_subscription_change_requests FOR SELECT TO authenticated USING (private.is_org_member(organization_id));


--
-- Name: organization_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_subscriptions organization_subscriptions_org_admins_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_subscriptions_org_admins_delete ON public.organization_subscriptions FOR DELETE TO authenticated USING (private.is_org_admin(organization_id));


--
-- Name: organization_subscriptions organization_subscriptions_org_admins_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_subscriptions_org_admins_insert ON public.organization_subscriptions FOR INSERT TO authenticated WITH CHECK (private.is_org_admin(organization_id));


--
-- Name: organization_subscriptions organization_subscriptions_org_admins_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_subscriptions_org_admins_update ON public.organization_subscriptions FOR UPDATE TO authenticated USING (private.is_org_admin(organization_id)) WITH CHECK (private.is_org_admin(organization_id));


--
-- Name: organization_subscriptions organization_subscriptions_org_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_subscriptions_org_members_select ON public.organization_subscriptions FOR SELECT TO authenticated USING (private.is_org_member(organization_id));


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: population_estimates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.population_estimates ENABLE ROW LEVEL SECURITY;

--
-- Name: population_estimates population_estimates_org_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY population_estimates_org_members_select ON public.population_estimates FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.reviers r
     JOIN public.organization_members om ON ((om.organization_id = r.organization_id)))
  WHERE ((r.id = population_estimates.revier_id) AND (om.user_id = auth.uid())))));


--
-- Name: population_gold_benchmarks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.population_gold_benchmarks ENABLE ROW LEVEL SECURITY;

--
-- Name: population_gold_benchmarks population_gold_benchmarks_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY population_gold_benchmarks_authenticated_read ON public.population_gold_benchmarks FOR SELECT TO authenticated USING (true);


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--
-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: camera_ingest_configs read camera ingest configs for organization members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read camera ingest configs for organization members" ON public.camera_ingest_configs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.cameras c
     JOIN public.reviers r ON ((r.id = c.revier_id)))
     JOIN public.organization_members om ON ((om.organization_id = r.organization_id)))
  WHERE ((c.id = camera_ingest_configs.camera_id) AND (om.user_id = auth.uid())))));


--
-- Name: organizations read organizations for members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read organizations for members" ON public.organizations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.organization_members om
  WHERE ((om.organization_id = organizations.id) AND (om.user_id = auth.uid())))));


--
-- Name: organization_members read own organization memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own organization memberships" ON public.organization_members FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: camera_health_rules read rules (authenticated); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read rules (authenticated)" ON public.camera_health_rules FOR SELECT TO authenticated USING (true);


--
-- Name: species_weights read species weights (authenticated); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read species weights (authenticated)" ON public.species_weights FOR SELECT TO authenticated USING (true);


--
-- Name: revier_boundaries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.revier_boundaries ENABLE ROW LEVEL SECURITY;

--
-- Name: revier_boundaries revier_boundaries_org_admins_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY revier_boundaries_org_admins_delete ON public.revier_boundaries FOR DELETE TO authenticated USING (private.is_org_admin(organization_id));


--
-- Name: revier_boundaries revier_boundaries_org_admins_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY revier_boundaries_org_admins_insert ON public.revier_boundaries FOR INSERT TO authenticated WITH CHECK (private.is_org_admin(organization_id));


--
-- Name: revier_boundaries revier_boundaries_org_admins_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY revier_boundaries_org_admins_update ON public.revier_boundaries FOR UPDATE TO authenticated USING (private.is_org_admin(organization_id)) WITH CHECK (private.is_org_admin(organization_id));


--
-- Name: revier_boundaries revier_boundaries_org_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY revier_boundaries_org_members_select ON public.revier_boundaries FOR SELECT TO authenticated USING (private.is_org_member(organization_id));


--
-- Name: revier_species_targets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.revier_species_targets ENABLE ROW LEVEL SECURITY;

--
-- Name: revier_species_targets revier_species_targets_org_admins_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY revier_species_targets_org_admins_delete ON public.revier_species_targets FOR DELETE TO authenticated USING (private.is_org_admin(organization_id));


--
-- Name: revier_species_targets revier_species_targets_org_admins_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY revier_species_targets_org_admins_insert ON public.revier_species_targets FOR INSERT TO authenticated WITH CHECK (private.is_org_admin(organization_id));


--
-- Name: revier_species_targets revier_species_targets_org_admins_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY revier_species_targets_org_admins_update ON public.revier_species_targets FOR UPDATE TO authenticated USING (private.is_org_admin(organization_id)) WITH CHECK (private.is_org_admin(organization_id));


--
-- Name: revier_species_targets revier_species_targets_org_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY revier_species_targets_org_members_select ON public.revier_species_targets FOR SELECT TO authenticated USING (private.is_org_member(organization_id));


--
-- Name: reviers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reviers ENABLE ROW LEVEL SECURITY;

--
-- Name: species_population_model_mapping; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.species_population_model_mapping ENABLE ROW LEVEL SECURITY;

--
-- Name: species_population_model_mapping species_population_model_mapping_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY species_population_model_mapping_authenticated_read ON public.species_population_model_mapping FOR SELECT TO authenticated USING (true);


--
-- Name: species_population_models; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.species_population_models ENABLE ROW LEVEL SECURITY;

--
-- Name: species_population_models species_population_models_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY species_population_models_authenticated_read ON public.species_population_models FOR SELECT TO authenticated USING (true);


--
-- Name: species_population_parameters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.species_population_parameters ENABLE ROW LEVEL SECURITY;

--
-- Name: species_population_parameters species_population_parameters_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY species_population_parameters_authenticated_read ON public.species_population_parameters FOR SELECT TO authenticated USING (true);


--
-- Name: species_weights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.species_weights ENABLE ROW LEVEL SECURITY;

--
-- Name: taxonomy_species_meta; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.taxonomy_species_meta ENABLE ROW LEVEL SECURITY;

--
-- Name: taxonomy_species_meta taxonomy_species_meta_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY taxonomy_species_meta_read_authenticated ON public.taxonomy_species_meta FOR SELECT TO authenticated USING (true);


--
-- PostgreSQL database dump complete
--

\unrestrict MojV4ABWKHMA4QoFCuUop7p66MF0HlKFNY7Brh2moqde3J9IlniqeXjibGBtKuW

