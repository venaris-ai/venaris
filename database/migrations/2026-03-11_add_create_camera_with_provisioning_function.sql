-- Create camera with canonical provisioning
-- Date: 2026-03-11
--
-- Architecture decisions:
-- - cameras.id remains the primary key
-- - cameras.technical_name is the canonical provisioning key
-- - cameras belong administratively to organizations
-- - cameras may optionally be assigned to a revier
-- - camera_ingest_configs is the routing truth
-- - cameras.import_method and cameras.ingest_token remain legacy-compatible for now
-- - the same freshly generated ingest token is written to both legacy and new routing fields

create or replace function public.create_camera_with_provisioning(
  p_organization_id uuid,
  p_camera_name text,
  p_method text,
  p_revier_id uuid default null,
  p_vendor text default null,
  p_location_name text default null,
  p_brand text default null,
  p_model text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_direction_deg integer default null,
  p_installed_at timestamp with time zone default null,
  p_notes text default null
)
returns table (
  camera_id uuid,
  technical_name text,
  ingest_token text,
  smtp_alias text,
  ftp_username text,
  ftp_inbox_path text,
  manual_label text
)
language plpgsql
as $$
declare
  v_org_slug text;
  v_seq integer;
  v_technical_name text;
  v_camera_id uuid;
  v_ingest_token text;
  v_smtp_alias text;
  v_ftp_username text;
  v_ftp_inbox_path text;
  v_manual_label text;
begin
  -- Validate required fields
  if p_camera_name is null or btrim(p_camera_name) = '' then
    raise exception 'Camera name must not be empty';
  end if;

  if p_method not in ('smtp', 'ftp', 'manual') then
    raise exception 'Unsupported provisioning method: %', p_method;
  end if;

  if p_vendor is not null and p_vendor not in (
    'berger&schröter',
    'blazevideo',
    'braun',
    'bushnell',
    'gardepro',
    'hikmicro',
    'maginon',
    'minox',
    'reconyx',
    'reolink',
    'seissiger',
    'spypoint',
    'xview',
    'zeiss',
    'other'
  ) then
    raise exception 'Unsupported vendor: %', p_vendor;
  end if;

  if p_direction_deg is not null and (p_direction_deg < 0 or p_direction_deg >= 360) then
    raise exception 'direction_deg must be between 0 and 359';
  end if;

  -- Ensure organization exists
  select o.slug
    into v_org_slug
  from public.organizations o
  where o.id = p_organization_id;

  if v_org_slug is null then
    raise exception 'Organization % not found', p_organization_id;
  end if;

  -- If revier is provided, ensure it belongs to the same organization
  if p_revier_id is not null and not exists (
    select 1
    from public.reviers r
    where r.id = p_revier_id
      and r.organization_id = p_organization_id
  ) then
    raise exception 'Revier % does not belong to organization %', p_revier_id, p_organization_id;
  end if;

  -- Reserve next per-organization sequence
  v_seq := public.next_camera_sequence(p_organization_id);

  -- Guardrail: keep canonical format at 4 digits
  if v_seq > 9999 then
    raise exception 'Camera sequence limit exceeded for organization % (max 9999)', p_organization_id;
  end if;

  -- Build canonical technical name
  v_technical_name := public.build_camera_technical_name(v_org_slug, v_seq);

  -- Generate secret ingest token
  v_ingest_token := encode(gen_random_bytes(24), 'hex');

  -- Derive routing values from technical_name
  v_smtp_alias := null;
  v_ftp_username := null;
  v_ftp_inbox_path := null;
  v_manual_label := null;

  if p_method = 'smtp' then
    v_smtp_alias := v_technical_name || '@cams.venaris.io';
  elsif p_method = 'ftp' then
    v_ftp_username := v_technical_name;
    v_ftp_inbox_path := '/data/ftp-ingest/' || v_technical_name || '/inbox';
  elsif p_method = 'manual' then
    v_manual_label := v_technical_name;
  end if;

  -- Create camera
  insert into public.cameras (
    organization_id,
    revier_id,
    name,
    technical_name,
    location_name,
    import_method,
    ingest_token,
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
    btrim(p_camera_name),
    v_technical_name,
    p_location_name,
    p_method,
    v_ingest_token,
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

  -- Create active routing config
  insert into public.camera_ingest_configs (
    camera_id,
    method,
    is_active,
    smtp_alias,
    ftp_username,
    ftp_inbox_path,
    manual_label,
    ingest_token,
    vendor,
    notes
  )
  values (
    v_camera_id,
    p_method,
    true,
    v_smtp_alias,
    v_ftp_username,
    v_ftp_inbox_path,
    v_manual_label,
    v_ingest_token,
    p_vendor,
    'Auto-provisioned via create_camera_with_provisioning()'
  );

  -- Return created values
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