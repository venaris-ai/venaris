-- Fix Supabase Security Advisor findings
-- Date: 2026-03-10

-- 1. Ensure views respect RLS of calling user

alter view public.asset_species_summary
set (security_invoker = true);

alter view public.event_species_summary
set (security_invoker = true);

-- 2. Enable RLS on species_weights

alter table public.species_weights
enable row level security;

-- 3. Allow authenticated users to read species weights

create policy "read species weights (authenticated)"
on public.species_weights
for select
to authenticated
using (true);