-- 20260608_popsim_rolling_12_month_window.sql
-- Purpose: Standardize all PopSim population functions on a rolling 12-month analysis window.
-- Scope: Only time-window logic is changed. Model formulas, thresholds, joins and supported species remain unchanged.
-- Window definition used consistently:
--   v_window_start := current_date - interval '12 months';
--   v_window_end   := current_date + interval '1 day';

begin;

CREATE OR REPLACE FUNCTION public.compute_population_territorial_density(
  p_revier_id uuid,
  p_species public.taxonomy_species_v1
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  v_window_start := current_date - interval '12 months';
  v_window_end := current_date + interval '1 day';

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
      and e.start_at >= v_window_start
      and e.start_at < v_window_end
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
$function$;

CREATE OR REPLACE FUNCTION public.compute_population_seasonal_migration_presence(
  p_revier_id uuid,
  p_species public.taxonomy_species_v1
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  v_window_start := current_date - interval '12 months';
  v_window_end := current_date + interval '1 day';

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
      and e.start_at >= v_window_start
      and e.start_at < v_window_end
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
$function$;

CREATE OR REPLACE FUNCTION public.compute_population_group_density(
  p_revier_id uuid,
  p_species public.taxonomy_species_v1
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_percentile numeric;
  v_presence_window_days int;
  v_min_events int;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  v_window_start := current_date - interval '12 months';
  v_window_end := current_date + interval '1 day';

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
      and e.start_at >= v_window_start
      and e.start_at < v_window_end
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
$function$;

CREATE OR REPLACE FUNCTION public.refresh_population_estimate_roe_deer(
  p_revier_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  v_window_start := current_date - interval '12 months';
  v_window_end := current_date + interval '1 day';

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
      public.resolve_population_target_per_100ha(
        p_revier_id,
        'roe_deer'::public.taxonomy_species_v1
      ) as target_per_100ha
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
      and e.start_at >= v_window_start
      and e.start_at < v_window_end
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
$function$;

CREATE OR REPLACE FUNCTION public.refresh_population_estimates_for_revier(
  p_revier_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
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
      from public.events e
      join public.cameras c
        on c.id = e.camera_id
      where c.revier_id = p_revier_id
        and e.top_species = m.species
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

CREATE OR REPLACE FUNCTION public.compute_population_for_revier(
  p_revier_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
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
      from public.events e
      join public.cameras c
        on c.id = e.camera_id
      where c.revier_id = p_revier_id
        and e.top_species = m.species
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

CREATE OR REPLACE FUNCTION public.compute_population_occupancy_presence(
  p_revier_id uuid,
  p_species public.taxonomy_species_v1
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  v_window_start := current_date - interval '12 months';
  v_window_end := current_date + interval '1 day';

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
        and e.start_at >= v_window_start
        and e.start_at < v_window_end
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
          and e.start_at >= v_window_start
          and e.start_at < v_window_end
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
        and e.start_at >= v_window_start
        and e.start_at < v_window_end
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
        and e.start_at >= v_window_start
        and e.start_at < v_window_end
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
$function$;

CREATE OR REPLACE FUNCTION public.compute_population_diurnal_surface_activity(
  p_revier_id uuid,
  p_species public.taxonomy_species_v1
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  v_window_start := current_date - interval '12 months';
  v_window_end := current_date + interval '1 day';

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
      and e.start_at >= v_window_start
      and e.start_at < v_window_end
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
$function$;

CREATE OR REPLACE FUNCTION public.compute_population_sparse_large_presence(
  p_revier_id uuid,
  p_species public.taxonomy_species_v1
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  v_window_start := current_date - interval '12 months';
  v_window_end := current_date + interval '1 day';

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
      and e.start_at >= v_window_start
      and e.start_at < v_window_end
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
$function$;

CREATE OR REPLACE FUNCTION public.compute_population_wolf(
  p_revier_id uuid,
  p_species public.taxonomy_species_v1
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org_id uuid;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  v_window_start := current_date - interval '12 months';
  v_window_end := current_date + interval '1 day';

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
      and e.start_at >= v_window_start
      and e.start_at < v_window_end
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
        and e.start_at >= v_window_start
        and e.start_at < v_window_end
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
$function$;

commit;
