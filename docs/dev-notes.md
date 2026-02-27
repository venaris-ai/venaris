
# Venaris – Dev Notes

Last updated: 2026-02-27

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

Bridges starten

FTP → ingest
node scripts/ftp-bridge.mjs

SMTP → ingest
node scripts/smtp-bridge.mjs

Hinweis:
Bridges sind bewusst getrennte Prozesse.
Sie simulieren produktionsnahe Hardware-Ingestion.

2. Environment Variables (lokal)
Supabase

NEXT_PUBLIC_SUPABASE_URL

NEXT_PUBLIC_SUPABASE_ANON_KEY

SUPABASE_SERVICE_ROLE_KEY

App / Ingest

VENARIS_BASE_URL (z.B. http://localhost:3000
)

FTP Bridge

INGEST_TOKEN (Token einer Kamera, z.B. cam1-test)

Optional:

FTP_INBOX (default: C:\dev\venaris_ftp_inbox)

INGEST_URL (default: http://localhost:3000/api/ingest
)

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

SMTP_VENDOR (optional, z.B. reolink)

SMTP_CAMERA_ID

SMTP_INGEST_TOKEN

Wichtig:
IMAP_PROCESS_ALL nur für Debugging verwenden.
Standard ist UNSEEN-only Betrieb.

3. RLS & Server Access

RLS ist auf allen Tabellen aktiv.

Client darf keine Tabellen direkt lesen.

Alle Reads laufen über Server-Routes mit Service Role.

Niemals:

Supabase-Client im Frontend direkt für DB-Reads verwenden

Service Role Key im Client exponieren

Security Advisor: clean.

4. SMTP Besonderheiten
Verarbeitung

Standardmäßig werden nur UNSEEN Mails verarbeitet.

Bereits gelesene Mails werden ignoriert.

UID-Dedup wird über .smtp-bridge-state.json gespeichert.

Diese Datei darf niemals committed werden.

Reolink Besonderheiten

Reolink kann Bilder senden als:

klassische Attachments

Inline Images (CID embedded im HTML-Body)

Bridge unterstützt beide Varianten.

Vendor-Handling:
SMTP_VENDOR=reolink aktiviert spezifische Verarbeitung.

Duplicate Handling

Wenn ein Bild identisch ist:

skippedDuplicates wird im ingest response protokolliert.

captured_at wird ggf. backfilled.

5. FTP Besonderheiten

Dateien werden nach erfolgreichem Ingest gelöscht.

Filename kann capturedAt enthalten (YYYYMMDD_HHMMSS).

Dedup erfolgt serverseitig per SHA256 pro Kamera.

FTP ist rein dateibasiert, keine UID-Logik.

6. Health Engine

Health wird nicht im Code berechnet.

Health basiert auf DB-Regeln (camera_health_rules).

Regeln sind pro import_method definiert.

UI liest ausschließlich aus View camera_health.

Health basiert auf:

last_seen_at

stale_after_minutes

offline_after_minutes

SMTP- und FTP-Ingest aktualisieren last_seen_at automatisch.

7. UI Besonderheiten
Cameras Page

Zeigt:

Health Status (Emoji + Regel)

last_seen_at

Token + Regenerate

Letzte 3 Assets (Signed URLs)

Letzte 10 Ingest Batches

Assets werden über /api/assets geladen.
Signed URLs werden serverseitig generiert (/api/asset-url).

8. Typische Fehlerquellen
SMTP Bridge läuft, aber nichts passiert

IMAP_PROCESS_ALL=false + Mail bereits SEEN

Falscher SMTP_VENDOR

Falscher ingest_token

Kamera-ID falsch gemappt

Git hängt bei Commit

Ursache:

git commit -a ohne -m

Editor blockiert

Fix:
rm -f .git/index.lock

Danach:
git commit -m "message"

Nie:

.git löschen

9. Commit Hygiene

Nie committen:

.env.local

.smtp-bridge-state.json

Commit Schema:

feat:

fix:

docs:

chore:

Bevorzugt:

git commit -m "feat: short clear description"

Nicht verwenden:

git commit -a
10. Architektur-Status

Ingestion Layer gilt als stabil:

FTP

SMTP (inkl. Inline Images)

Manual Upload

Dedup

Batch Monitoring

Health Engine

System bereit für Intelligence Layer.












