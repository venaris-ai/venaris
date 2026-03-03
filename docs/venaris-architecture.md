Venaris – Architecture (MVP)

Last updated: 2026-03-03

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

Images → Detections → Events → Patterns → Insights

Current stage:
Images → Assets → Events (stub intelligence)

🏗 System Overview

Venaris consists of five logical layers:

Ingestion Layer

Storage Layer

Intelligence Layer

Monitoring Layer

Application Layer

System State (MVP Status)

The Ingestion Layer is now production-stable for:

SMTP (Reolink)

FTP (X-View via Hetzner Gateway)

Manual Upload

All ingest channels normalize into a unified ingest contract.

1️⃣ Ingestion Layer
Purpose

Receive wildlife sensor data from multiple import methods
and normalize them into a unified ingest contract.

Unified Ingest Contract

Endpoint:

POST /api/ingest

Requirements:

Header: x-ingest-token

Body: multipart/form-data

file

metadata (JSON)

Example metadata:

{
  "source": "ftp",
  "ftp_user": "xview01",
  "filename": "IMG_1234.JPG"
}
Ingest Responsibilities

Each ingest:

Creates ingest_batch

Deduplicates per camera (SHA256)

Stores asset in Supabase Storage

Updates camera.last_seen_at

Triggers event clustering

Triggers detection stub (future model pipeline)

SMTP Ingestion (Vendor-Aware Bridge)

Architecture:

Mailbox (IMAP)
→ smtp-bridge.mjs
→ /api/ingest

Supports:

Attachments

Inline images (CID)

SMTP_VENDOR flag (e.g. reolink)

UID-based deduplication

UNSEEN-only processing

Duplicate handling:

skippedDuplicates reported

captured_at backfilled if needed

MVP note:
SMTP is mailbox-based per camera.
Not long-term optimal but stable for MVP.

FTP Ingestion (Gateway-Based Architecture)
Final Architecture (Production-Ready)

Wildlife Camera (X-View LTE)
→ Hetzner VPS (FTP Gateway via vsftpd)
→ /data/ftp-ingest/<ftp_user>/inbox
→ FTP Worker (Node.js, systemd service)
→ POST /api/ingest
→ Supabase Storage

Gateway Characteristics

Dedicated VPS (Hetzner)

vsftpd in passive mode

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

Permissions model:

Owner: ftp user (e.g. xview01)

Group: ftp-ingest

Mode: 2770 (setgid enabled)

local_umask=007 (vsftpd)

This ensures:

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

Poll-based (POLL_SECONDS)

Stable file-size check before ingest

SHA256 pre-hash logging

Multipart/form-data generation

Automatic metadata injection

Delete only after successful ingest

Retries on failure (implicit via polling)

Vercel Deployment Protection (Automation)

Production API is protected via Vercel Deployment Protection.

Worker uses:

?x-vercel-protection-bypass=<token>

Bypass token stored in:

/opt/venaris-worker/.env

No tokens stored in GitHub.

Deduplication Model

Deduplication is server-side (API layer).

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

Image access:

Signed URLs

20-minute expiry

Generated server-side only

FTP Gateway holds no permanent image storage.

Supabase is the single source of truth.

Database Tables
reviers

Hunting areas / management units.

cameras

Represents wildlife sensors.

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

source (ftp / smtp / manual / token)

file_count

skipped_duplicates

status

error_summary

meta (jsonb)

Batch source derived from metadata.source.

3️⃣ Intelligence Layer

Current state:
Detection stub only.

detections

Fields:

asset_id

label

species

count

score

meta

Future:
Model-based detection pipeline.

events

Aggregated wildlife activity.

Logic:

Assets within time window
→ grouped
→ aggregated
→ scored

Currently:

Basic time-window clustering via RPC

Future:

Detection-density scoring

Species-aware clustering

Movement modeling

event_assets

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

ingest monitoring

Tracks:

file_count

skipped duplicates

source differentiation

error summary

FTP and SMTP are first-class differentiated ingest sources.

5️⃣ Application Layer
Home (/)

Upload

Asset list

Relevance toggle

Camera status indicator

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

Production-ready multi-channel ingestion & monitoring.

Next phase:

Model-based detection

Species classification

Event scoring

Pattern analysis across cameras

Cross-revier aggregation

Predictive wildlife modeling