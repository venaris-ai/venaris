# Venaris database baseline 2026-05-19

This folder contains the new Venaris database baseline created from the live Supabase/Postgres database on 2026-05-19.

## Files

Apply in this order:

1. `extensions-2026-05-19.sql`
2. `baseline-2026-05-19.sql`
3. `seed-reference-2026-05-19.sql`

## Scope

`baseline-2026-05-19.sql` contains the schema-only dump for the Venaris-owned schemas:

- `public`
- `private`

It includes tables, views, functions, triggers, indexes, constraints, RLS status and policies.

`seed-reference-2026-05-19.sql` contains only non-tenant reference/configuration data:

- `camera_vendors`
- `camera_health_rules`
- `species_weights`
- `taxonomy_species_meta`
- `species_population_models`
- `species_population_parameters`
- `species_population_model_mapping`
- `population_gold_benchmarks`

It intentionally does not include productive tenant/user/event data such as organizations, members, profiles, cameras, assets, detections, events or reviers.

## Target environment

This baseline is intended for a Supabase project database.

It assumes Supabase-managed schemas such as `auth` already exist. For example, some foreign keys reference `auth.users`.

## Created from

Created with PostgreSQL 17 client tools using `pg_dump` against the live Supabase database.

