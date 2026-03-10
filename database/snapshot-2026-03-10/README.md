# README.md

```md
# Supabase Snapshot 2026-03-10

Dieser Ordner enthält einen manuellen Snapshot der aktuellen produktiven/public Supabase-Struktur von Venaris.

Zweck:
- Bestandsaufnahme vor Umbauten
- Absicherung der aktuellen DB-Struktur
- Grundlage für sichere Migrationen

Bekannte Security-Findings zum Zeitpunkt des Snapshots:
- asset_species_summary: Security Definer View / kein security_invoker gesetzt
- event_species_summary: Security Definer View / kein security_invoker gesetzt
- species_weights: RLS nicht aktiviert