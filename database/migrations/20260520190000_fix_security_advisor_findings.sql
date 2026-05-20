-- supabase/migrations/20260520190000_fix_security_advisor_findings.sql

begin;

-- 1) admin_growth_dashboard:
--    - nicht mehr als SECURITY DEFINER ausführen
--    - nicht direkt für anon/authenticated lesbar machen
--    Wichtig: service_role bleibt nutzbar, falls dein Server-Admin-Dashboard diese View serverseitig liest.

alter view if exists public.admin_growth_dashboard
  set (security_invoker = true);

revoke all on table public.admin_growth_dashboard from public;
revoke all on table public.admin_growth_dashboard from anon;
revoke all on table public.admin_growth_dashboard from authenticated;

grant select on table public.admin_growth_dashboard to service_role;


-- 2) growth_web_analytics_daily:
--    RLS ist aktiv, aber es gibt keine Policy.
--    Diese explizite Deny-Policy entfernt den "no policy"-Advisor-Hinweis,
--    ohne die Tabelle für Clientrollen zu öffnen.
--    service_role bleibt von RLS nicht betroffen.

drop policy if exists "growth_web_analytics_daily_client_read_denied"
  on public.growth_web_analytics_daily;

create policy "growth_web_analytics_daily_client_read_denied"
  on public.growth_web_analytics_daily
  for select
  to anon, authenticated
  using (false);


-- 3) Function Search Path Mutable:
--    Fester search_path für Trigger-/Helper-Funktionen.

alter function public.set_revier_boundaries_updated_at()
  set search_path = public, pg_temp;

alter function public.set_revier_boundary_organization_id()
  set search_path = public, pg_temp;


-- 4) SECURITY DEFINER Funktionen nicht per PostgREST/RPC ausführbar machen:
--    Triggerfunktionen und interne Seeder sollen nicht direkt von anon/authenticated
--    aufgerufen werden können.

revoke execute on function public.seed_revier_species_targets(uuid) from public;
revoke execute on function public.seed_revier_species_targets(uuid) from anon;
revoke execute on function public.seed_revier_species_targets(uuid) from authenticated;

revoke execute on function public.seed_revier_species_targets_after_revier_insert() from public;
revoke execute on function public.seed_revier_species_targets_after_revier_insert() from anon;
revoke execute on function public.seed_revier_species_targets_after_revier_insert() from authenticated;

revoke execute on function public.set_revier_species_targets_organization_id() from public;
revoke execute on function public.set_revier_species_targets_organization_id() from anon;
revoke execute on function public.set_revier_species_targets_organization_id() from authenticated;


-- 5) Optional, aber sinnvoll: auch diese SECURITY DEFINER Funktionen mit festem search_path absichern.
--    Wenn eine der Funktionen nicht existiert, würde ALTER FUNCTION fehlschlagen.
--    Da sie laut Advisor existieren, ist das hier korrekt.

alter function public.seed_revier_species_targets(uuid)
  set search_path = public, pg_temp;

alter function public.seed_revier_species_targets_after_revier_insert()
  set search_path = public, pg_temp;

alter function public.set_revier_species_targets_organization_id()
  set search_path = public, pg_temp;

commit;