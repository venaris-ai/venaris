Venaris – Architecture (MVP)

Last updated: 2026-03-03 (Unified Ingest + Import Center)

🎯 Vision

Venaris is a wildlife data platform.

Cameras are sensors — not the product.
The product is structured wildlife intelligence.

The long-term goal is to transform unstructured wildlife observations
(images, time-series signals, environmental metadata)
into structured, queryable ecological intelligence.

🧭 Core Principle

Raw data is not valuable.
Structured context is valuable.

Venaris converts:

Images → Assets → Detections → Events → Patterns → Insights

Current stage (MVP):

Images → Assets → Events (stub intelligence)

🏗 System Overview

Venaris consists of five logical layers:

Ingestion Layer

Storage Layer

Intelligence Layer

Monitoring Layer

Application Layer

System State (MVP Status)

The Ingestion Layer is production-stable for:

SMTP (Reolink)

FTP (X-View via Hetzner Gateway)

Manual Import (ZIP + multi-file via Import Adapter)

All ingest channels normalize into a unified ingest pipeline.

Core logic is centralized in:

src/lib/ingestCore.ts

Both:

POST /api/ingest

POST /api/upload

use the same processing logic.

This guarantees consistency across all import methods.

1️⃣ Ingestion Layer
Purpose

Receive wildlife sensor data from multiple import methods
and normalize them into a unified ingest contract.

Unified Ingest Contract

Primary endpoint:

POST /api/ingest

Requirements:

Header:
x-ingest-token

Body:
multipart/form-data

Fields:

file (or files)

metadata (JSON)

optional: capturedAt

Example metadata:

{
  "source": "ftp",
  "ftp_user": "xview01",
  "filename": "IMG_1234.JPG"
}
Import Adapter (Manual Channel)

Endpoint:

POST /api/upload

Capabilities:

Multi-file upload

ZIP upload (auto-extracted via JSZip)

metadata.source="manual"

channel="import" or "upload"

Guard rails (MAX_FILES, MAX_ZIP_BYTES)

All files are forwarded to ingestCore.

This creates ingest_batches with:

source = manual

Ingest Responsibilities (Unified)

Each ingest:

Creates ingest_batch

Deduplicates per camera (SHA256)

Stores asset in Supabase Storage

Updates camera.last_seen_at

Triggers event clustering (RPC)

Triggers detection stub (DEV)

Deduplication is per-camera and idempotent.

SMTP Ingestion (Vendor-Aware Bridge)

Architecture:

Mailbox (IMAP)
→ smtp-bridge.mjs (systemd service)
→ POST /api/ingest

Features:

Attachments

Inline images (CID)

SMTP_VENDOR flag (e.g. reolink)

UID-based deduplication

UNSEEN-only processing

Poll interval configurable (MVP: 60s)

Duplicate handling:

skippedDuplicates incremented

captured_at backfilled if metadata.device_time present

MVP note:
SMTP is mailbox-based per camera.
Stable but not horizontally scalable long-term.

FTP Ingestion (Gateway-Based Architecture)
Final Architecture (Production-Ready)

Wildlife Camera (X-View LTE)
→ Hetzner VPS (FTP Gateway via vsftpd)
→ /data/ftp-ingest/<ftp_user>/inbox
→ FTP Worker (Node.js, systemd)
→ POST /api/ingest
→ Supabase Storage

Gateway Characteristics

Dedicated VPS (Hetzner)

vsftpd passive mode

Per-camera FTP user

chroot isolation

No public file exposure

UFW firewall

SSH key authentication only

Root login disabled

FTP users cannot access other users' directories.

Directory Structure
/data/ftp-ingest/
  └── xview01/
        └── inbox/

Permission model:

Owner: ftp user (e.g. xview01)

Group: ftp-ingest

Mode: 2770 (setgid enabled)

vsftpd local_umask=007

Ensures:

Worker can read & delete

Files are group-writable

Isolation between cameras

No world-readable access

FTP Worker

Location:

/opt/venaris-worker/ftp-worker.mjs

Managed via:

systemd → venaris-ftp-worker.service

Characteristics:

Poll-based (MVP: 15s)

Stable file-size check (LTE safety)

SHA256 pre-hash logging

Multipart/form-data generation

metadata.source="ftp"

Manual redirect handling (307/308)

Delete only after successful ingest

Retry via polling

Vercel Deployment Protection (Automation)

Production API is protected via Vercel Deployment Protection.

Workers use:

?x-vercel-protection-bypass=<token>

Bypass token stored only in:

/opt/venaris-worker/.env

No tokens stored in GitHub.

Deduplication Model

Server-side (API layer).

Strategy:

SHA256 file hash

Unique constraint per camera

Duplicate → skippedDuplicates++

Asset not re-created

Event clustering not retriggered

This ensures idempotent ingest behavior.

2️⃣ Storage Layer
Supabase Storage

Bucket:

camera-assets

Naming scheme:

{cameraId}/{timestamp}-{hash12}.ext

Access:

Signed URLs

20-minute expiry

Generated server-side only

FTP Gateway holds no permanent image storage.

Supabase is the single source of truth.

Database Tables
reviers

Hunting areas / management units.

cameras

Wildlife sensors.

Fields:

id

revier_id

name

location_name

import_method (smtp / ftp / manual)

ingest_token

last_seen_at

created_at

assets

Raw captured observations.

Fields:

id

camera_id

storage_path

file_hash

status

relevant

captured_at

created_at

ingest_batch_id

ingest_batches

Logical delivery units.

Fields:

id

camera_id

received_at

source (ftp / smtp / manual)

file_count

status

error_summary

meta (jsonb)

Batch source derived from metadata.source.

3️⃣ Intelligence Layer

Current state:
Detection stub only.

detections:

asset_id

label

species

count

score

meta

Future:
Model-based detection pipeline.

Events

Aggregated wildlife activity.

Logic:

Assets within time window
→ grouped
→ aggregated
→ scored

Currently:

Basic time-window clustering via RPC.

Future:

Detection-density scoring

Species-aware clustering

Movement modeling

Cross-camera correlation

event_assets:
Join table between events and assets.

4️⃣ Monitoring Layer

Venaris monitors ingest reliability and sensor health.

camera_health_rules

Defines thresholds per import_method.

camera_health (view)

Calculates:

online

stale

offline

unknown

Based on:

last_seen_at + rule thresholds

Fully DB-driven.

Ingest Monitoring

Tracks:

file_count

skipped duplicates

source differentiation

error summary

FTP, SMTP, and Manual are first-class differentiated ingest sources.

5️⃣ Application Layer
Home (/)

Debug + asset list (MVP internal view)

Import (/import)

Primary human ingestion entrypoint:

Camera selection

Multi-file

ZIP

Drag & drop

Batch feedback

Cameras (/cameras)

Health view

Token management

Last 3 assets preview

Last ingest batches

Manual refresh controls

Ingest Monitoring (/ingest)

Batch list

Source transparency

Error visibility

Events (/events)

Wildlife activity feed

Event detail view

AssetGrid with relevance toggle

🧠 Relevance Model

Current:

boolean relevant

Planned evolution:

relevance_score

user_relevant override

event_relevance_score

Long-term:

Probabilistic, context-aware relevance modeling.

🔒 Security Model

RLS enabled

No client-side direct table access

All reads via server routes

Service role only on server

Token-based ingest authentication

No public write endpoints

Signed URLs only

Gateway:

SSH key only

No password login

chroot FTP users

Restricted passive port range

Firewall enforced

No permanent image storage

🚀 Strategic Direction

Venaris is evolving from:

Camera ingestion system

to:

Structured wildlife intelligence platform.

Current phase:

Production-ready multi-channel ingestion & monitoring
Unified ingest pipeline
Import Adapter + Import Center

Next phase:

Model-based detection

Species classification

Event scoring

Pattern analysis across cameras

Cross-revier aggregation

Predictive wildlife modeling