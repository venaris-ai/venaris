-- supabase/migrations/20260617_security_advisor_cleanup.sql
-- Venaris security advisor cleanup.
-- Applied manually in Supabase SQL Editor on 2026-06-17.
--
-- 1) Fixed mutable search_path warning for trigger function.
-- 2) Added explicit deny policy for internal manual import staging table.
--
-- Note:
-- Supabase Auth leaked password protection was enabled in the dashboard
-- and is not represented as SQL here.

alter function public.set_manual_import_files_updated_at()
set search_path = public, pg_temp;

alter table public.manual_import_files enable row level security;

drop policy if exists "manual_import_files_no_direct_client_access"
on public.manual_import_files;

create policy "manual_import_files_no_direct_client_access"
on public.manual_import_files
for all
to anon, authenticated
using (false)
with check (false);