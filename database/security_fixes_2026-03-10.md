# Security Fixes – 2026-03-10

After creating the Supabase schema snapshot, the Security Advisor reported three findings.

## Issues

1. asset_species_summary view defined without security_invoker
2. event_species_summary view defined without security_invoker
3. species_weights table exposed without RLS

## Fixes applied

### Views

Both views were updated to respect Row Level Security of the querying user:

- asset_species_summary
- event_species_summary



### species_weights

Row Level Security enabled and read access granted for authenticated users.



## Rationale

- ensures Supabase RLS policies are respected
- prevents privilege escalation through SECURITY DEFINER views
- aligns with existing security_invoker usage in other views

## Snapshot reference

Original schema snapshot stored in:
