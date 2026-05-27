-- 202605270002_revoke_anon_table_data_api_grants.sql
--
-- Tighten Data API grants for public tables.
-- RLS remains the primary row-level protection, but anon should not have
-- table-level API privileges for Venaris application data.

revoke all on table public.asset_detections from anon;
revoke all on table public.assets from anon;
revoke all on table public.camera_health_rules from anon;
revoke all on table public.camera_ingest_configs from anon;
revoke all on table public.camera_vendors from anon;
revoke all on table public.cameras from anon;
revoke all on table public.detections from anon;
revoke all on table public.event_assets from anon;
revoke all on table public.events from anon;
revoke all on table public.growth_web_analytics_daily from anon;
revoke all on table public.ingest_batches from anon;
revoke all on table public.organization_invites from anon;
revoke all on table public.organization_members from anon;
revoke all on table public.organization_subscription_change_requests from anon;
revoke all on table public.organization_subscriptions from anon;
revoke all on table public.organizations from anon;
revoke all on table public.population_estimates from anon;
revoke all on table public.population_gold_benchmarks from anon;
revoke all on table public.profiles from anon;
revoke all on table public.revier_boundaries from anon;
revoke all on table public.revier_species_targets from anon;
revoke all on table public.reviers from anon;
revoke all on table public.species_population_model_mapping from anon;
revoke all on table public.species_population_models from anon;
revoke all on table public.species_population_parameters from anon;
revoke all on table public.species_weights from anon;
revoke all on table public.taxonomy_species_meta from anon;