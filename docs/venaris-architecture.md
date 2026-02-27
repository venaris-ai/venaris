# Venaris – Architecture (MVP)

Last updated: 2026-02-27

---

## 🎯 Vision

Venaris is a wildlife data platform.

Cameras are sensors — not the product.

The product is structured wildlife intelligence.

The long-term goal is to transform unstructured wildlife observations
(images, time-series signals, environmental metadata)
into structured, queryable ecological intelligence.

---

## 🧭 Core Principle

Raw data is not valuable.

Structured context is valuable.

Venaris converts:

Images → Detections → Events → Patterns → Insights

Current stage:
Images → Assets → Events (stub intelligence)

---

## 🏗 System Overview

Venaris consists of five logical layers:

1. Ingestion Layer
2. Storage Layer
3. Intelligence Layer
4. Monitoring Layer
5. Application Layer

The Ingestion Layer is now considered stable.

---

## 1️⃣ Ingestion Layer

Purpose:
Receive wildlife sensor data from multiple import methods.

Supported import methods:

- ftp
- smtp
- manual

Entry points:

- POST /api/ingest (token-based)
- POST /api/upload (manual)

Cameras are authenticated via ingest_token.

Each ingest:

- Creates ingest_batch
- Deduplicates per camera (SHA256)
- Stores asset
- Updates camera heartbeat (last_seen_at)
- Triggers event clustering
- Triggers detection stub (future: model pipeline)

---

### SMTP Ingestion (Vendor-aware)

SMTP Bridge:

Mailbox (IMAP)
→ smtp-bridge.mjs
→ /api/ingest

Supports:

- Attachments
- Inline images (CID embedded)
- Vendor flag (e.g. SMTP_VENDOR=reolink)
- UID-based deduplication
- UNSEEN-only processing (default)

Duplicate handling:
- skippedDuplicates reported
- captured_at backfilled if needed

---

### FTP Ingestion

FTP folder watcher:

FTP camera
→ local inbox
→ ftp-bridge.mjs
→ /api/ingest

Characteristics:

- Filename timestamp parsing
- File deleted after successful ingest
- SHA256 deduplication server-side

---

## 2️⃣ Storage Layer

### Supabase Storage

Bucket:
camera-assets

Naming scheme:

{cameraId}/{timestamp}-{hash12}.ext

Image access:

- Signed URLs
- 20-minute expiry
- Generated server-side only

---

## Database Tables

### reviers
Hunting areas / management units.

### cameras
Represents wildlife sensors.

Fields:
- id
- revier_id
- name
- location_name
- import_method
- ingest_token
- last_seen_at
- created_at

---

### assets
Raw captured observations.

Fields:
- id
- camera_id
- storage_path
- file_hash
- status
- relevant
- captured_at
- created_at
- ingest_batch_id

---

### ingest_batches
Logical delivery units of ingest operations.

Fields:
- id
- camera_id
- received_at
- source
- file_count
- status
- error_summary
- meta (jsonb)

---

## 3️⃣ Intelligence Layer

This is the core of Venaris.

Current state:
Detection stub only.

### detections
Structured information extracted from assets.

Fields:
- asset_id
- label
- species
- count
- score
- meta

Future:
Model-based detection pipeline.

---

### events
Aggregated wildlife events per camera.

Events represent time-clustered wildlife activity.

Event logic:

Assets within time window →
Grouped →
Aggregated into event →
Scored

Currently:
Basic clustering.

Future:
Detection-density based scoring.

---

### event_assets
Join table between events and assets.

---

## 4️⃣ Monitoring Layer

Venaris monitors sensor reliability and ingest integrity.

### camera_health_rules
Defines health thresholds per import_method.

### camera_health (view)
Calculates:

- online
- stale
- offline
- unknown

Based on:
last_seen_at + rule thresholds

Health is fully DB-driven.
UI reads only from view.

---

### ingest_batches
Tracks ingest quality:

- file_count
- status
- skipped duplicates
- errors
- source (ftp / smtp / manual)

---

## 5️⃣ Application Layer

### Home (/)
- Upload
- Asset list
- Relevance toggle
- Camera status indicator

### Cameras (/cameras)
- Health view
- Token management
- Last 3 assets preview (signed URLs)
- Last ingest batches
- Manual refresh controls

### Ingest Monitoring (/ingest)
- Batch list
- Status transparency
- Source differentiation

### Events (/events)
- Wildlife activity feed
- Event detail view
- AssetGrid with relevance toggle

---

## 🧠 Relevance Model

Current:
Boolean `relevant`

Planned evolution:

- relevance_score (system generated)
- user_relevant (manual override)
- event_relevance_score

Long-term:
Relevance becomes probabilistic and context-aware.

---

## 🔒 Security Model

- RLS enabled on all tables
- Client cannot read tables directly
- All reads via server routes (service role)
- Token-based ingest authentication
- No public write access
- Signed URLs only (no public bucket exposure)

---

## 🚀 Strategic Direction

Venaris is evolving from:

Camera ingestion system

to:

Structured wildlife intelligence platform.

Current phase:
Stable ingestion & monitoring layer.

Next phase:
Intelligence layer expansion.

Future directions:

- AI species detection
- Pattern detection across cameras
- Species movement analysis
- Population density estimation
- Seasonal trend analysis
- Multi-revier aggregation
- Predictive wildlife modeling