-- STAGING ONLY: run after applying 20261117_manual_import_resilience.sql.
-- Requires a dedicated staging camera; all test changes are rolled back.
begin;
do $test$
declare
  v_camera uuid;
  v_org uuid;
  v_request uuid := gen_random_uuid();
  v_second uuid := gen_random_uuid();
  v_manifest jsonb := '[{"name":"test.jpg","type":"image/jpeg","ext":".jpg","size":100}]';
  v_result jsonb;
  v_batch uuid;
  v_file uuid;
begin
  select id, organization_id into v_camera, v_org from public.cameras
  where name = 'MANUAL_IMPORT_TEST' limit 1;
  if v_camera is null then raise exception 'Create a dedicated MANUAL_IMPORT_TEST camera in staging first'; end if;
  v_result := public.prepare_manual_import_chunk(v_org,v_camera,v_request,'test-hash',v_manifest,0,10);
  if v_result->>'state' <> 'ok' then raise exception 'initial prepare failed: %',v_result; end if;
  v_batch := (v_result->>'batchId')::uuid;
  v_file := (v_result->'rows'->0->>'id')::uuid;
  v_result := public.prepare_manual_import_chunk(v_org,v_camera,v_request,'test-hash',v_manifest,0,10);
  if (v_result->>'batchId')::uuid is distinct from v_batch or
     (v_result->'rows'->0->>'id')::uuid is distinct from v_file then
    raise exception 'idempotent prepare failed';
  end if;
  v_result := public.prepare_manual_import_chunk(v_org,v_camera,v_second,'test-hash2',v_manifest,0,10);
  if v_result->>'state' <> 'busy' then raise exception 'parallel upload was not blocked'; end if;
  v_result := public.complete_manual_import_chunk(v_org,v_batch,array[v_file]);
  if v_result->>'state' <> 'missing' then raise exception 'completion accepted a missing object'; end if;
  -- Simulate a successful handoff without writing directly into storage.objects.
  update public.manual_import_files set status='finalize_pending', uploaded_at=now() where id=v_file;
  v_result := public.prepare_manual_import_chunk(v_org,v_camera,v_second,'test-hash2',v_manifest,0,10);
  if v_result->>'state' <> 'ok' then raise exception 'lock not released at handoff: %',v_result; end if;
  update public.manual_import_sessions set lease_until=now()-interval '1 second' where request_id=v_second;
  v_result := public.prepare_manual_import_chunk(v_org,v_camera,gen_random_uuid(),'test-hash3',v_manifest,0,10);
  if v_result->>'state' <> 'ok' then raise exception 'abandoned lease did not expire'; end if;
end;
$test$;
rollback;
