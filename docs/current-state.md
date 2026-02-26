# Venaris – Current State

Last updated: 2026-02-26

---

## ✅ System Status

- Ingest stable (token ingest + manual upload)
- FTP bridge stable (Reolink simulation)
- SMTP/IMAP bridge stable (X-View simulation)
- Ingest batch monitoring implemented
- Camera health engine (rule-based per import_method) implemented
- Home + Cameras UI fully server-driven (RLS safe)
- Event layer working (clustering + aggregation)
- Relevant toggle working + persists
- Detections stub working (dev)
- Security Advisor clean (0 errors / 0 warnings / 0 suggestions)

---

# 1️⃣ Infrastructure

### Repository
- GitHub: venaris-ai/venaris
- Branch: main

### Tech Stack
- Next.js (App Router, Turbopack)
- Supabase (Postgres + Storage)
- Tailwind CSS

---

# 2️⃣ Storage

Bucket: `camera-assets`

Naming scheme:
{cameraId}/{timestamp}-{hash12}.ext

---

# 3️⃣ Database (Active Tables)

### reviers
- id
- name
- area_ha
- region
- created_at

### cameras
- id
- revier_id
- name
- location_name
- import_method (`ftp | smtp | manual`)
- ingest_token
- last_seen_at
- created_at

### assets
- id
- camera_id
- storage_path
- file_hash (sha256 per camera dedup)
- status
- relevant
- captured_at
- created_at
- ingest_batch_id

### detections (DEV STUB)
- id
- asset_id
- label
- species
- count
- score
- meta
- created_at

### events
- id
- camera_id
- start_at
- end_at
- top_label
- top_species
- top_count
- relevance_score
- created_at

### event_assets
- event_id
- asset_id

### ingest_batches
- id
- camera_id
- received_at
- source
- file_count
- status
- error_summary
- meta (jsonb)

### camera_health_rules ✅
- import_method (PK)
- stale_after_minutes
- offline_after_minutes
- created_at

---

# 4️⃣ Views

### camera_health ✅
Rule-based health evaluation per import_method.

Exposes:
- id
- name
- import_method
- last_seen_at
- stale_after_minutes
- offline_after_minutes
- health_status (`online | stale | offline | unknown`)

Health logic:
- online → last_seen < stale_after_minutes
- stale → between stale_after and offline_after
- offline → > offline_after
- unknown → no last_seen_at

### event_feed
- security_invoker enabled
- used by `/events`

---

# 5️⃣ API Routes (Server)

### POST /api/upload
- Dedup per camera via sha256
- Upload to storage
- Insert into `assets`
- Write detection stub
- Call `upsert_event_for_asset`
- Update `cameras.last_seen_at`

### POST /api/ingest
- Auth via `x-ingest-token`
- Supports single + multiple files
- Creates `ingest_batches`
- Dedup per camera via sha256
- Backfills `captured_at` if duplicate + NULL
- Sets `captured_at` from:
  1) `capturedAt`
  2) `metadata.device_time`
- Writes detection stub
- Calls `upsert_event_for_asset`
- Updates `cameras.last_seen_at`

### GET /api/assets
Query params:
- onlyRelevant
- cameraId
- limit

### GET /api/asset-url
- Signed URL (20 min)

### POST /api/asset-relevant
- Toggle relevant flag

### GET /api/ingest-batches
Filters:
- cameraId
- source
- status
- limit

### GET /api/camera-health
- Reads from `camera_health` view
- No RLS exposure

### GET /api/camera-token
- Returns ingest_token for given cameraId

### POST /api/camera-token
- Regenerates ingest token

---

# 6️⃣ Integrations

## Reolink (FTP → ingest)

- Folder: `C:\dev\venaris_ftp_inbox`
- Script: `scripts/ftp-bridge.mjs`
- Watches folder
- Parses timestamp from filename
- Sends to `/api/ingest`
- Deletes file after success
- Updates camera health

Status: ✅ stable

---

## X-View (SMTP/IMAP → ingest)

- Mailbox: `xview@venaris.io`
- Script: `scripts/smtp-bridge.mjs`
- Poll interval: `IMAP_POLL_SECONDS`
- Default mode: UNSEEN only
- UID-based dedup via `.smtp-bridge-state.json`
- Robust per-UID fetch strategy
- Marks mail as `\Seen` after success

Status: ✅ stable

---

# 7️⃣ UI Status

## Home (`/`)
- Upload
- Asset list
- Relevant filter
- Camera dropdown shows health indicator

## Cameras (`/cameras`)
- Health indicator (emoji + rule-based)
- Displays:
  - last_seen_at
  - stale_after_minutes
  - offline_after_minutes
- Token copy + regenerate
- Last ingest batches
- Last assets preview

## Ingest Monitoring (`/ingest`)
- Lists ingest_batches
- Status badges
- Error summary display

---

# 8️⃣ Security / RLS

- RLS enabled on all public tables
- Client cannot query tables directly
- All reads via server routes (service role)
- Functions use fixed search_path
- Security Advisor clean

---

# 9️⃣ Architecture State

Venaris now has:

- Multi-source ingestion layer (FTP + SMTP + manual)
- Batch monitoring layer
- Rule-based health engine (configurable per import method)
- Event clustering layer
- Detection stub layer
- Secure server API layer

System modular and production-structurable.

---

# 🔟 Open TODOs (Next Phase)

### Core Platform
- [ ] Replace detection stub with real model pipeline
- [ ] System vs user relevance separation
- [ ] Detection-based event scoring refinement

### Monitoring
- [ ] Health alert log table (DB only)
- [ ] Error-rate based health override
- [ ] Per-camera ingest KPI stats

### Product Layer
- [ ] Dashboard (online/stale/offline summary)
- [ ] Revier-based filtering
- [ ] Multi-user structure (future SaaS)

---

# 11️⃣ Operational Notes

- SMTP bridge processes UNSEEN mails by default.
- Health thresholds configurable via `camera_health_rules`.
- System supports:
  - ftp
  - smtp
  - manual

Architecture stable and ready for next abstraction layer.