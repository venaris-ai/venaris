-- Backfill camera_ingest_configs for current demo and test cameras
-- Date: 2026-03-10

insert into public.camera_ingest_configs (
  camera_id,
  method,
  is_active,
  smtp_alias,
  ftp_username,
  ftp_inbox_path,
  manual_label,
  vendor,
  notes
)
values
  -- Demo seed cameras
  ('9d71e823-e15a-4134-8281-642e8dd8195b', 'manual', true, null, null, null, 'demo-cam-0001', 'seed', 'Backfilled from existing demo seed camera'),
  ('f96a6440-dba1-42e7-9063-55b9a9906213', 'manual', true, null, null, null, 'demo-cam-0002', 'seed', 'Backfilled from existing demo seed camera'),
  ('5ac19296-9e94-41a5-95b5-763626cf3ac5', 'manual', true, null, null, null, 'demo-cam-0003', 'seed', 'Backfilled from existing demo seed camera'),
  ('e8f434c4-e8b6-416f-8ac4-319d9943653e', 'manual', true, null, null, null, 'demo-cam-0004', 'seed', 'Backfilled from existing demo seed camera'),
  ('9f5b2da6-6ce4-4f9e-879b-0746d0e81e98', 'manual', true, null, null, null, 'demo-cam-0005', 'seed', 'Backfilled from existing demo seed camera'),

  -- Test cameras
  ('a64d9782-f018-4059-b176-e433d54e16cb', 'manual', true, null, null, null, 'test-cam-0001', 'test', 'Backfilled from existing test camera'),
  ('1d273bd3-f030-424a-8c03-f4c2bd33c9bd', 'smtp', true, 'test-cam-0002@cams.venaris.io', null, null, null, 'reolink', 'Backfilled from existing test SMTP camera'),
  ('825514f7-23b2-4ac7-adba-8d3f75573932', 'ftp', true, null, 'test-cam-0003', '/data/ftp-ingest/test-cam-0003/inbox', null, 'xview', 'Backfilled from existing test FTP camera')
on conflict do nothing;