-- A manual upload is exclusive per organization, not per camera.
-- Only the trusted server and worker may call these functions.
create table public.manual_import_sessions (
  request_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id uuid not null unique references public.ingest_batches(id) on delete cascade,
  manifest_hash text not null,
  lease_until timestamptz not null
);
alter table public.manual_import_sessions enable row level security;
revoke all on public.manual_import_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.manual_import_sessions to service_role;
create index manual_import_sessions_org_lease_idx
  on public.manual_import_sessions (organization_id, lease_until);
-- The old multipart endpoint remains compatible, but participates in the same
-- organization lock instead of letting older clients bypass it.
create table public.manual_import_legacy_leases (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  request_id uuid not null,
  lease_until timestamptz not null
);
alter table public.manual_import_legacy_leases enable row level security;
revoke all on public.manual_import_legacy_leases from public, anon, authenticated;
grant select, insert, update, delete on public.manual_import_legacy_leases to service_role;
alter table public.manual_import_files add column import_index integer;
create unique index manual_import_files_batch_index_idx
  on public.manual_import_files (ingest_batch_id, import_index)
  where import_index is not null;

create function public.prepare_manual_import_chunk(
  p_org uuid, p_camera uuid, p_request uuid, p_hash text,
  p_files jsonb, p_offset integer, p_limit integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_session public.manual_import_sessions%rowtype;
  v_batch uuid;
  v_count integer;
  v_bytes bigint;
  v_rows jsonb;
begin
  if p_offset < 0 or p_limit < 1 or p_limit > 25
     or jsonb_typeof(p_files) <> 'array' then
    raise exception 'invalid manual import manifest';
  end if;
  v_count := jsonb_array_length(p_files);
  select coalesce(sum((f->>'size')::bigint), 0) into v_bytes
  from jsonb_array_elements(p_files) f;
  if v_count < 1 or v_count > 500 or v_bytes > 50000000
     or p_offset >= v_count or exists (
       select 1 from jsonb_array_elements(p_files) f
       where coalesce((f->>'size')::bigint, 0) <= 0
          or coalesce(f->>'ext', '') not in ('.jpg', '.jpeg', '.png', '.webp')
     ) then
    raise exception 'invalid manual import limits';
  end if;
  if not exists (select 1 from public.cameras c where c.id = p_camera and c.organization_id = p_org) then
    raise exception 'camera does not belong to organization';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text, 78119));
  select * into v_session from public.manual_import_sessions where request_id = p_request;
  if found then
    if v_session.organization_id <> p_org or v_session.manifest_hash <> p_hash then
      return jsonb_build_object('state', 'conflict');
    end if;
    v_batch := v_session.batch_id;
    if exists (select 1 from public.manual_import_files
      where ingest_batch_id = v_batch and status in ('expired','failed') and uploaded_at is null) then
      return jsonb_build_object('state', 'expired');
    end if;
  end if;
  -- Completed uploads do not need a lease, even if the worker is still processing.
  if v_batch is null or exists (select 1 from public.manual_import_files
      where ingest_batch_id = v_batch and status = 'prepared') then
    if exists (select 1 from public.manual_import_legacy_leases l
      where l.organization_id = p_org and l.lease_until > now()) or exists (
      select 1 from public.manual_import_sessions s
      where s.organization_id = p_org and s.request_id <> p_request and s.lease_until > now()
        and exists (select 1 from public.manual_import_files f
                    where f.ingest_batch_id = s.batch_id and f.status = 'prepared')
    ) then
      return jsonb_build_object('state', 'busy');
    end if;
    if v_batch is null then
      insert into public.ingest_batches (camera_id, source, file_count, status, meta)
      values (p_camera, 'manual', v_count, 'processing',
        jsonb_build_object('source','manual','channel','import','adapter','signed_standard',
          'file_count',v_count,'total_bytes',v_bytes,'max_import_bytes',50000000))
      returning id into v_batch;
      insert into public.manual_import_sessions (request_id, organization_id, batch_id, manifest_hash, lease_until)
      values (p_request, p_org, v_batch, p_hash, now() + interval '10 minutes');
      insert into public.manual_import_files
        (organization_id, camera_id, ingest_batch_id, storage_bucket, storage_path,
         original_filename, content_type, expected_size_bytes, status, expires_at, import_index)
      select p_org, p_camera, v_batch, 'camera-assets',
        p_camera::text || '/manual-import/' || v_batch::text || '/' ||
        lpad(ord::text, 4, '0') || '-' || gen_random_uuid()::text || (f->>'ext'),
        f->>'name', f->>'type', (f->>'size')::bigint, 'prepared',
        now() + interval '2 hours', (ord - 1)::integer
      from jsonb_array_elements(p_files) with ordinality as a(f, ord);
    else
      update public.manual_import_sessions set lease_until = now() + interval '10 minutes'
      where request_id = p_request;
    end if;
  end if;

  -- A lost upload response is recoverable without uploading a second object.
  update public.manual_import_files f
  set status = 'finalize_pending', uploaded_at = now(), error_summary = null
  where f.ingest_batch_id = v_batch and f.status = 'prepared'
    and f.import_index >= p_offset and f.import_index < p_offset + p_limit
    and exists (select 1 from storage.objects o
      where o.bucket_id = f.storage_bucket and o.name = f.storage_path
        and o.metadata->>'size' = f.expected_size_bytes::text);
  update public.manual_import_files
  set expires_at = now() + interval '2 hours 5 minutes'
  where ingest_batch_id = v_batch and status = 'prepared'
    and import_index >= p_offset and import_index < p_offset + p_limit;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,'index',f.import_index,'storage_path',f.storage_path,
    'content_type',f.content_type,'expected_size_bytes',f.expected_size_bytes,
    'status',f.status,'uploaded_at',f.uploaded_at) order by f.import_index), '[]'::jsonb)
  into v_rows from public.manual_import_files f
  where f.ingest_batch_id = v_batch
    and f.import_index >= p_offset and f.import_index < p_offset + p_limit;
  return jsonb_build_object('state','ok','batchId',v_batch,'rows',v_rows);
end;
$$;

create function public.renew_manual_import_lease(p_org uuid, p_request uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_batch uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text, 78119));
  select batch_id into v_batch from public.manual_import_sessions
  where request_id = p_request and organization_id = p_org;
  if v_batch is null then return jsonb_build_object('state','not_found'); end if;
  if not exists (select 1 from public.manual_import_files where ingest_batch_id = v_batch and status = 'prepared') then
    return jsonb_build_object('state','ok');
  end if;
  if exists (select 1 from public.manual_import_legacy_leases l
      where l.organization_id = p_org and l.lease_until > now()) or exists (select 1 from public.manual_import_sessions s
      where s.organization_id = p_org and s.request_id <> p_request and s.lease_until > now()
        and exists (select 1 from public.manual_import_files f
                    where f.ingest_batch_id = s.batch_id and f.status = 'prepared')) then
    return jsonb_build_object('state','busy');
  end if;
  update public.manual_import_sessions set lease_until = now() + interval '10 minutes'
  where request_id = p_request and organization_id = p_org;
  return jsonb_build_object('state','ok');
end;
$$;

create function public.claim_legacy_manual_import(p_org uuid, p_request uuid, p_release boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text, 78119));
  if p_release then
    delete from public.manual_import_legacy_leases where organization_id = p_org and request_id = p_request;
    return true;
  end if;
  if exists (select 1 from public.manual_import_legacy_leases
      where organization_id = p_org and lease_until > now() and request_id <> p_request)
    or exists (select 1 from public.manual_import_sessions s
      where s.organization_id = p_org and s.lease_until > now()
        and exists (select 1 from public.manual_import_files f
                    where f.ingest_batch_id = s.batch_id and f.status = 'prepared')) then
    return false;
  end if;
  insert into public.manual_import_legacy_leases(organization_id,request_id,lease_until)
    values(p_org,p_request,now()+interval '10 minutes')
  on conflict (organization_id) do update set request_id=excluded.request_id, lease_until=excluded.lease_until;
  return true;
end;
$$;

create function public.complete_manual_import_chunk(p_org uuid, p_batch uuid, p_ids uuid[])
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_count integer;
  v_queued integer;
begin
  if cardinality(p_ids) < 1 or cardinality(p_ids) > 500 then
    raise exception 'invalid upload IDs';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text, 78119));
  select count(*) into v_count from public.manual_import_files
  where organization_id = p_org and ingest_batch_id = p_batch and id = any(p_ids);
  if v_count <> cardinality(p_ids) then
    return jsonb_build_object('state','not_found');
  end if;
  update public.manual_import_files f
  set status = 'finalize_pending', uploaded_at = now(), error_summary = null
  where f.organization_id = p_org and f.ingest_batch_id = p_batch
    and f.id = any(p_ids) and f.status = 'prepared'
    and exists (select 1 from storage.objects o
      where o.bucket_id = f.storage_bucket and o.name = f.storage_path
        and o.metadata->>'size' = f.expected_size_bytes::text);
  get diagnostics v_queued = row_count;
  if exists (select 1 from public.manual_import_files
      where organization_id = p_org and ingest_batch_id = p_batch and id = any(p_ids)
        and (status = 'prepared' or uploaded_at is null)) then
    return jsonb_build_object('state','missing');
  end if;
  -- Do not extend an abandoned session over a newer active upload.
  update public.manual_import_sessions s set lease_until = now() + interval '10 minutes'
  where s.batch_id = p_batch and s.organization_id = p_org
    and not exists (select 1 from public.manual_import_legacy_leases l
      where l.organization_id = p_org and l.lease_until > now())
    and not exists (select 1 from public.manual_import_sessions other
      where other.organization_id = p_org and other.batch_id <> p_batch
        and other.lease_until > now() and exists (select 1 from public.manual_import_files f
          where f.ingest_batch_id = other.batch_id and f.status = 'prepared'));
  return jsonb_build_object('state','ok','finalizedQueued',v_queued,'alreadyQueued',v_count-v_queued);
end;
$$;

-- Recover storage objects even if the browser closed before sending /complete.
-- Never expire an active upload, and only expire rows without a matching object.
create function public.recover_manual_import_uploads()
returns table (batch_id uuid, recovered_status text)
language sql security invoker set search_path = '' as $$
  with candidates as (
    select f.id, exists (
      select 1 from storage.objects o where o.bucket_id = f.storage_bucket
        and o.name = f.storage_path and o.metadata->>'size' = f.expected_size_bytes::text
    ) as stored
    from public.manual_import_files f
    where f.status = 'prepared'
      and not exists (select 1 from public.manual_import_sessions s
        where s.batch_id = f.ingest_batch_id and s.lease_until > now())
      and (f.expires_at < now() or exists (
        select 1 from storage.objects o where o.bucket_id = f.storage_bucket
          and o.name = f.storage_path and o.metadata->>'size' = f.expected_size_bytes::text))
    order by f.expires_at
    limit 100 for update of f skip locked
  )
  update public.manual_import_files f set
    status = case when c.stored then 'finalize_pending' else 'expired' end,
    uploaded_at = case when c.stored then now() else f.uploaded_at end,
    finalized_at = case when c.stored then null else now() end,
    error_summary = case when c.stored then null else 'signed upload token expired before completion' end
  from candidates c where f.id = c.id and f.status = 'prepared'
  returning f.ingest_batch_id, f.status;
$$;

revoke execute on function public.prepare_manual_import_chunk(uuid,uuid,uuid,text,jsonb,integer,integer) from public, anon, authenticated;
revoke execute on function public.renew_manual_import_lease(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.claim_legacy_manual_import(uuid,uuid,boolean) from public, anon, authenticated;
revoke execute on function public.complete_manual_import_chunk(uuid,uuid,uuid[]) from public, anon, authenticated;
revoke execute on function public.recover_manual_import_uploads() from public, anon, authenticated;
grant execute on function public.prepare_manual_import_chunk(uuid,uuid,uuid,text,jsonb,integer,integer) to service_role;
grant execute on function public.renew_manual_import_lease(uuid,uuid) to service_role;
grant execute on function public.claim_legacy_manual_import(uuid,uuid,boolean) to service_role;
grant execute on function public.complete_manual_import_chunk(uuid,uuid,uuid[]) to service_role;
grant execute on function public.recover_manual_import_uploads() to service_role;
