# Venaris – Current State

Last updated: 2026-02-26

---

## ✅ System Status
- Ingest stable (token ingest + manual upload)
- Home: camera dropdown + assets list working again (now via server API routes due to RLS)
- Cameras working
- Event layer working (clustering + feed + detail page)
- Relevant toggle working + persists
- Detections stub working (writes rows)
- Event aggregation working (top_species/top_count/relevance_score)
- Security Advisor clean (0 errors / 0 warnings / 0 suggestions)
- Reolink office simulation working (FTP → folder → bridge → /api/ingest)
- X-View office simulation working (SMTP/IMAP → bridge → /api/ingest) ✅

---

## 1️⃣ Infrastructure

### Repository
- GitHub: venaris-ai/venaris
- Branch: main

### Tech Stack
- Next.js (App Router, Turbopack)
- Supabase (Postgres + Storage)
- Tailwind CSS

---

## 2️⃣ Storage
- Bucket: `camera-assets`
- Naming:
  `{cameraId}/{timestamp}-{hash12}.ext`

---

## 3️⃣ Database (Active Tables)

### reviers
- id, name, area_ha, region, created_at

### cameras
- id, revier_id, name, location_name, import_method, ingest_token, last_seen_at, created_at

### assets
- id, camera_id, storage_path, file_hash, status, relevant, captured_at, created_at, ingest_batch_id

### detections
- id, asset_id, label, species, count, score, meta, created_at

### events
- id, camera_id, start_at, end_at, top_label, top_species, top_count, relevance_score, created_at

### event_assets
- event_id, asset_id

### ingest_batches
- id, camera_id, received_at, source, file_count, status, error_summary, meta (jsonb)

---

## 4️⃣ API Routes (Server)

### POST /api/upload
- Dedup per camera by sha256
- Uploads to storage + inserts into `assets`
- Writes detections stub (dev)
- Calls `upsert_event_for_asset` (non-fatal)
- Updates `cameras.last_seen_at`

### POST /api/ingest
- Auth via `x-ingest-token`
- Supports single + multiple files
- Creates `ingest_batches` (meta stored)
- Dedup per camera by sha256
- Sets `assets.captured_at` from:
  1) `capturedAt` (form field)
  2) `metadata.device_time`
- Writes detections stub (dev)
- Calls `upsert_event_for_asset` (non-fatal)
- Updates `cameras.last_seen_at`

### GET /api/asset-url
- Signed URL (20 min)

### POST /api/asset-relevant
- Updates `assets.relevant`

### GET /api/cameras ✅
- Returns cameras list (server-side, uses service role)

### GET /api/assets?onlyRelevant=true|false ✅
- Returns assets list (server-side, uses service role)

---

## 5️⃣ Event Layer (DB/RPC)

### RPC: upsert_event_for_asset(asset_id, window_minutes)
- Clusters assets into events (time window)
- Links via `event_assets`
- Triggers aggregation

### RPC: update_event_aggregation(event_id)
- Computes `top_*` and `relevance_score` from detections (v1: max score)

### View: event_feed
- security_invoker enabled

---

## 6️⃣ Security / RLS
- RLS enabled on all public tables
- Explicit deny policies for anon/auth (client cannot read tables directly)
- Functions fixed search_path
- Security Advisor: 0 errors / 0 warnings / 0 suggestions

---

## 7️⃣ UI Status

### Home (`/`)
- Client UI + upload
- Loads cameras/assets via server API routes (because RLS blocks anon)
- Relevant filter works

### Events (`/events`)
- Feed shows top_species/top_count/score
- Detail page works: shows asset grid (signed URLs) + relevant toggle persists

---

## 8️⃣ Integrations

### Reolink office simulation (FTP → ingest)
- Folder: `C:\dev\venaris_ftp_inbox` (outside repo)
- Script: `scripts/ftp-bridge.mjs` (in repo)
- Watches folder, POSTs to `/api/ingest` using `x-ingest-token`
- Adds metadata `{ source:"ftp", vendor:"reolink", original_filename, received_time }`
- Parses `capturedAt` from filename if pattern `YYYYMMDD_HHMMSS` exists
- Deletes file after successful ingest
- Tested OK: “Ingest OK … accepted:1”

### X-View office simulation (SMTP/IMAP → ingest) ✅
- Mailbox: `xview@venaris.io` (provider IMAP)
- Script: `scripts/smtp-bridge.mjs` (in repo)
- Polls IMAP mailbox every `IMAP_POLL_SECONDS` (default 15s)
- Searches UNSEEN by default (set `IMAP_PROCESS_ALL=true` for debugging)
- Fetch strategy hardened: per-UID `fetchOne(..., { source:true })` to avoid stream timeouts
- Parses image attachments (jpg/jpeg/png/gif/webp) and POSTs to `/api/ingest` with `x-ingest-token`
- Adds metadata `{ source:"smtp", vendor:"x-view", mail_from, mail_subject, mail_date, received_time, original_filename, sha256 }`
- Marks mail as `\\Seen` after successful ingest (if `IMAP_MARK_SEEN=true`)
- Local state file for UID-dedup: `.smtp-bridge-state.json` (ignored via `.gitignore`)
- Tested OK: multiple consecutive jpg emails ingested successfully (“ingest OK … accepted:1”)

---

## 9️⃣ Open TODOs (Next)
- [ ] Optional: Dedup upgrade in /api/ingest (if duplicate: backfill captured_at when NULL)
- [ ] Replace detections stub with real model pipeline
- [ ] Improve relevance (system vs user)
- [ ] Dashboard
- [ ] Optional: Ingest monitoring UI for `ingest_batches`

---

## 10️⃣ Notes for next session
- After enabling RLS “deny all”, the Home page must not query Supabase tables directly from client.
- Home now uses `/api/cameras` and `/api/assets` server routes.
- SMTP bridge is sensitive to mails being already Seen; use `IMAP_PROCESS_ALL=true` only for backfills/debug.