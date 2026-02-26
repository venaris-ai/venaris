
# Venaris – Dev Notes

Last updated: 2026-02-26

Diese Datei ist bewusst operativ.
Sie beantwortet:

- Wie läuft das System lokal?
- Was bricht typischerweise?
- Was darf man nicht kaputt machen?

---

## 1. Local Setup

### App starten

```bash
npm run dev


### Bridges starten
FTP -> ingest
node scripts/ftp-bridge.mjs

SMTP -> ingest
node scripts/smtp-bridge.mjs


## 2. Environment Variables (lokal)
Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

App / Ingest
VENARIS_BASE_URL (z.B. http://localhost:3000)

FTP Bridge
INGEST_TOKEN (Token einer Kamera, z.B. cam1-test)
Optional:

FTP_INBOX (default: C:\dev\venaris_ftp_inbox)
INGEST_URL (default: http://localhost:3000/api/ingest)

SMTP Bridge
IMAP_HOST
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER
IMAP_PASS
IMAP_MAILBOX=INBOX
IMAP_POLL_SECONDS
IMAP_MARK_SEEN=true
IMAP_PROCESS_ALL=false

Wichtig:
IMAP_PROCESS_ALL nur für Debugging verwenden.

## 3. RLS & Server Access

RLS ist auf allen Tabellen aktiv.
Client darf keine Tabellen direkt lesen.
Alle Reads laufen über Server-Routes mit Service Role.
Niemals Supabase-Client im Frontend direkt für DB-Reads verwenden.

## 4. SMTP Besonderheiten
Standardmäßig werden nur UNSEEN Mails verarbeitet.
Bereits gelesene Mails werden ignoriert.
UID-Dedup wird über .smtp-bridge-state.json gespeichert.
Diese Datei darf niemals committed werden.

## 5. FTP Besonderheiten
Dateien werden nach erfolgreichem Ingest gelöscht.
Filename kann capturedAt enthalten (YYYYMMDD_HHMMSS).
Dedup erfolgt serverseitig per SHA256.

## 6. Health Engine
Health wird nicht im Code berechnet.
Health basiert auf DB-Regeln (camera_health_rules).
Regeln sind pro import_method definiert.
UI liest ausschließlich aus View camera_health.

## 7. Commit Hygiene
Nie committen:
.env.local
.smtp-bridge-state.json

Commit Schema:
feat:
fix:
docs:
chore:

