-- database/extensions-2026-05-19.sql
-- Required Supabase/Postgres extensions for the Venaris baseline.

create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
