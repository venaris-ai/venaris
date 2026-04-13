-- Refreshes timestamps for the Venaris Demo tenant so 30/90/365 day filters stay populated.
-- Intended to be executed manually and via Supabase pg_cron.

create or replace function public.refresh_demo_timestamps()
returns void
language plpgsql
as $$
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