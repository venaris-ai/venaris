# Venaris – Current State

Last updated: 2026-02-24

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
- storage_path
- file_hash
- status
- relevant
- created_at

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
- Inserts into `assets`
- Updates camera `last_seen_at`

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

---

## 6️⃣ Open Technical TODOs

- [ ] ingest_batches table
- [ ] token-based /api/ingest
- [ ] split relevance into system + user
- [ ] event clustering logic
- [ ] camera onboarding screen

---

## 7️⃣ Known Constraints

- Relevance currently boolean only
- No deduplication on upload yet
- No batch tracking
- No vendor integrations