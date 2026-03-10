# SQL4 - Functions

```text
| routine_name             | routine_definition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| get_species_activity     | 
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
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| claim_queued_assets      | 
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
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| upsert_event_for_asset   | 
declare
  v_asset record;
  v_anchor_at timestamptz;
  v_last_event record;
  v_event_id uuid;
begin
  select a.*
  into v_asset
  from public.assets a
  where a.id = p_asset_id;

  if not found then
    raise exception 'Asset % not found', p_asset_id;
  end if;

  v_anchor_at := coalesce(v_asset.captured_at, v_asset.created_at);

  select e.*
  into v_last_event
  from public.events e
  where e.camera_id = v_asset.camera_id
  order by e.end_at desc nulls last, e.start_at desc
  limit 1;

  if found
     and v_last_event.end_at is not null
     and v_anchor_at <= (v_last_event.end_at + make_interval(mins => p_window_minutes)) then

    update public.events
      set end_at = greatest(v_last_event.end_at, v_anchor_at)
    where id = v_last_event.id
    returning id into v_event_id;

  else
    insert into public.events (camera_id, start_at, end_at, created_at)
    values (v_asset.camera_id, v_anchor_at, v_anchor_at, now())
    returning id into v_event_id;
  end if;

  insert into public.event_assets (event_id, asset_id)
  values (v_event_id, v_asset.id)
  on conflict do nothing;

  -- ✅ Aggregation trigger (non-strict)
  perform public.update_event_aggregation(v_event_id);

  return v_event_id;
end;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| get_activity_by_hour     | 
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
      and (p_species is null or d.species = p_species)
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
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| update_event_aggregation | 
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
      'animal'::text as top_label,
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
 |