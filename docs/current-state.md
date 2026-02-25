# Venaris – Current State

Last updated: 2026-02-25

---

## Home Refactor + Ingest Metadata + Event Clustering

### Changes
- Home page refactored (clean header, camera dropdown instead of UUID input)
- Duplicate header/link issue fixed
- ingest_batches.meta (jsonb) added
- Ingest API stores metadata in batch
- is_relevant column removed from assets (keep only assets.relevant)
- Event clustering v1 added via RPC: upsert_event_for_asset(asset_id, window_minutes)
- /api/ingest calls event clustering after asset insert (non-fatal)
- /api/upload now: dedup by sha256 (per camera), updates camera last_seen_at, and calls event clustering

### System Status
- Token ingest working
- Batch tracking working (ingest_batches)
- Dedup working (ingest + upload)
- Camera health working (last_seen_at updates)
- Relevance toggle working (assets.relevant)
- Storage verified
- Event clustering working (events + event_assets)

---

## 1️⃣ Infrastructure

### Repository
- GitHub: venaris-ai/venaris
- Branch: main

### Tech Stack
- Next.js (App Router)
- Supabase (Postgres + Storage)
- Tailwind CSS

---

## 2️⃣ Storage

- Bucket: `camera-assets`
- File naming:
  `{cameraId}/{timestamp}-{hash12}.ext`

---

## 3️⃣ Database (Active Tables)

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
- import_method
- ingest_token
- last_seen_at
- created_at

### assets
- id
- camera_id
- captured_at
- storage_path
- file_hash
- status
- relevant
- created_at
- ingest_batch_id

### ingest_batches
- id
- camera_id
- received_at
- source
- file_count
- status
- error_summary
- meta

### detections
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

---

## 4️⃣ API Routes

### POST /api/upload
- Upload single image
- Deduplicates via sha256 (per camera)
- Inserts into `assets`
- Updates camera `last_seen_at`
- Calls event clustering RPC

### POST /api/ingest
- Auth via `x-ingest-token`
- Supports single and multiple file uploads
- Creates ingest batch
- Deduplicates via sha256 (per camera)
- Stores batch meta (optional)
- Inserts into `assets`
- Updates camera `last_seen_at`
- Calls event clustering RPC (non-fatal)

### GET /api/asset-url
- Returns signed URL (20 min)

### POST /api/asset-relevant
- Updates `assets.relevant`

---

## 5️⃣ UI Status

- Manual upload per camera
- Camera picker
- Asset preview (signed URL)
- Relevant / irrelevant toggle
- Filter: only relevant
- (Next) Event feed page

---

## 6️⃣ Open Technical TODOs

- [ ] Event feed UI + event details page
- [ ] Derive events.top_* and relevance_score from detections
- [ ] captured_at normalization (EXIF / filename / SMTP timestamp)
- [ ] inactivity detection (camera offline) as system events
- [ ] camera onboarding screen
- [ ] vendor integrations (Reolink FTP, X-View SMTP)

---

## 7️⃣ Known Constraints

- Relevance currently boolean only (no split system vs user)
- Event scoring/top fields not computed yet
- Vendor-specific timestamp parsing not implemented yet