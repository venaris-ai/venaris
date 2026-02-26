# Venaris – Architecture (MVP)

Last updated: 2026-02-26

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

---

## 🏗 System Overview

Venaris consists of five logical layers:

1. Ingestion Layer
2. Storage Layer
3. Intelligence Layer
4. Monitoring Layer
5. Application Layer

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

Each ingest:

- Creates ingest_batch
- Deduplicates per camera (SHA256)
- Stores asset
- Updates camera heartbeat
- Triggers event clustering
- Triggers detection stub (future: model pipeline)

Cameras are authenticated via ingest_token.

---

## 2️⃣ Storage Layer

### Supabase Storage

Bucket:
camera-assets

Naming scheme:

{cameraId}/{timestamp}-{hash12}.ext

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
- meta

---

## 3️⃣ Intelligence Layer

This is the core of Venaris.

### detections
Structured information extracted from assets.

Fields:
- asset_id
- label
- species
- count
- score
- meta

Currently:
Stub implementation.

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

---

### ingest_batches
Tracks ingest quality:

- file_count
- status
- skipped duplicates
- errors

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
- Ingest batch overview
- Asset preview

### Ingest Monitoring (/ingest)
- Batch list
- Status transparency

### Events (/events)
- Wildlife activity feed
- Aggregated intelligence view

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

---

## 🚀 Strategic Direction

Venaris is evolving from:

Camera ingestion system

to:

Structured wildlife intelligence platform.

Future directions:

- Pattern detection across cameras
- Species movement analysis
- Population density estimation
- Seasonal trend analysis
- Multi-revier aggregation
- Predictive wildlife modeling