alter table public.camera_ingest_configs
  drop constraint if exists camera_ingest_configs_zeiss_smtp_external_key_check;

alter table public.camera_ingest_configs
  add constraint camera_ingest_configs_zeiss_smtp_external_key_check
  check (
    not (
      is_active = true
      and method = 'smtp'
      and upper(coalesce(vendor, '')) = 'ZEISS'
    )
    or external_key ~ '^[0-9]{15}$'
  );

create unique index if not exists idx_camera_ingest_configs_active_vendor_external_key
  on public.camera_ingest_configs (upper(vendor), external_key)
  where is_active = true
    and method = 'smtp'
    and external_key is not null;
