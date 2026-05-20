-- database/migrations/20260520200000_allow_service_role_growth_dashboard_auth_users.sql

begin;

-- Required because public.admin_growth_dashboard now runs as SECURITY INVOKER.
-- The view is read server-side via supabaseServer() with SUPABASE_SERVICE_ROLE_KEY.
-- anon/authenticated remain blocked from the view and from auth.users.

grant usage on schema auth to service_role;
grant select on table auth.users to service_role;

commit;