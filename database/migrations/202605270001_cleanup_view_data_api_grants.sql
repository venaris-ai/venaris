-- 202605270001_cleanup_view_data_api_grants.sql
--
-- Tighten Data API grants for internal/reporting views.
-- These views are not accessed directly by the app via supabase.from(...).
-- Server-side/service-role usage remains possible.

revoke all on table public.assets_v from anon;
revoke all on table public.assets_v from authenticated;

revoke all on table public.asset_species_summary from anon;
revoke all on table public.asset_species_summary from authenticated;

revoke all on table public.event_feed from anon;
revoke all on table public.event_feed from authenticated;

revoke all on table public.event_species_summary from anon;
revoke all on table public.event_species_summary from authenticated;

revoke all on table public.camera_health from anon;
revoke all on table public.camera_health from authenticated;

revoke all on table public.revier_camera_coverage from anon;
revoke all on table public.revier_camera_coverage from authenticated;