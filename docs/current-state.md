Perfekt.
Hier ist die aktualisierte current-state.md – konsistent mit dem realen Stand (FTP jetzt voll production-stable inkl. Vercel Bypass, Permission-Fix und erfolgreichem End-to-End-Test).

Du kannst den kompletten Inhalt ersetzen.

Venaris – Current State

Last updated: 2026-03-03 (Day 3 – FTP Production Stable)

✅ System Status

Ingest stable (token ingest + manual upload)

SMTP/IMAP bridge stable (Reolink live)

FTP Gateway fully operational (X-View via Hetzner)

Worker → Production API (Vercel) confirmed

Vercel Deployment Protection bypass implemented

SHA256 per-camera dedup stable

File deletion after ingest confirmed

Vendor-aware SMTP processing implemented

Inline image handling (CID + attachment) implemented

Ingest batch monitoring implemented

Camera health engine (rule-based per import_method) implemented

Home + Cameras UI fully server-driven (RLS safe)

Cameras UI enhanced (last 3 shots + last batches)

Event layer working (clustering + aggregation)

Relevant toggle working + persists

Detection stub working (dev)

Security Advisor clean (0 errors / 0 warnings / 0 suggestions)

1️⃣ Infrastructure
Repository

GitHub: venaris-ai/venaris

Branch: main

Daily commits

No secrets committed

Tech Stack

Next.js (App Router)

Supabase (Postgres + Storage)

Tailwind CSS

Node.js (SMTP bridge + FTP worker)

Hetzner VPS (FTP Gateway)

2️⃣ Production Gateway (FTP – Stable)
Hetzner VPS

Server:

CX23

Ubuntu 24.04

Security:

SSH key-only login

Root login disabled

UFW enabled

Ports open:

22 (SSH)

21 (FTP control)

40000–40100 (Passive FTP)

Gateway is stateless.

FTP (vsftpd)

Directory model:

/data/ftp-ingest/<ftp_user>/inbox

Example:

User: xview01

Path: /data/ftp-ingest/xview01/inbox

Permission model (final):

/data                     755 root:root
/data/ftp-ingest          755 root:root
/data/ftp-ingest/xview01  2770 xview01:ftp-ingest
/data/.../inbox           2770 xview01:ftp-ingest

Key elements:

Shared group: ftp-ingest

setgid enabled (2)

vsftpd: local_umask=007

Files created as 660

Worker can delete successfully

Confirmed:
File delete after ingest works.

3️⃣ FTP Worker (Production Confirmed)

Location:

/opt/venaris-worker

Service:

venaris-ftp-worker (systemd)

Environment:

/opt/venaris-worker/.env

Key variables:

VENARIS_INGEST_URL=https://<prod>/api/ingest?x-vercel-protection-bypass=<token>
POLL_SECONDS=5
CAMERA_TOKEN_XVIEW01=cam-view-1
Worker Behavior (Confirmed Live)

Poll inbox

Ensure file size stable (LTE safety)

Compute SHA256 (log only)

Send multipart FormData

metadata.source="ftp"

If response OK:

ingest_batch created

dedup handled

file deleted

If error:

file retained for retry

Observed:

ok batchId=...
accepted=1 skippedDup=0
deleted ...

and for duplicates:

accepted=0 skippedDup=1
deleted ...

Inbox remains clean.

4️⃣ Storage

Bucket:

camera-assets

Naming scheme:

{cameraId}/{timestamp}-{hash12}.ext

Signed URLs:

20 min expiry

Generated server-side only

Supabase is the only persistent storage.
Hetzner holds no permanent wildlife data.

5️⃣ Database (Active Tables)
reviers

id

name

area_ha

region

created_at

cameras

id

revier_id

name

location_name

import_method (ftp | smtp | manual)

ingest_token

last_seen_at

created_at

Current cameras:

Reolink → smtp

X-View → ftp

assets

id

camera_id

storage_path

file_hash (sha256 per-camera dedup)

status

relevant

captured_at

created_at

ingest_batch_id

detections (DEV STUB)

id

asset_id

label

species

count

score

meta

created_at

events

id

camera_id

start_at

end_at

top_label

top_species

top_count

relevance_score

created_at

event_assets

event_id

asset_id

ingest_batches

id

camera_id

received_at

source (ftp | smtp | manual)

file_count

skipped_duplicates

status

error_summary

meta (jsonb)

camera_health_rules

import_method (PK)

stale_after_minutes

offline_after_minutes

created_at

6️⃣ Views
camera_health

Rule-based evaluation per import_method.

Health states:

online

stale

offline

unknown

Based on:
last_seen_at + thresholds

event_feed

security_invoker enabled

Used by /events

7️⃣ API Routes (Production-Ready)
POST /api/upload

Manual upload.

POST /api/ingest

Token-based ingest.
Multipart only.
Per-camera SHA256 dedup.
Backfills captured_at.
Triggers event RPC.
Updates cameras.last_seen_at.

GET /api/assets

Filters:

onlyRelevant

cameraId

limit

GET /api/asset-url

Returns signed URL (20 min).

POST /api/asset-relevant

Toggle relevant.

GET /api/ingest-batches

Filterable by:

cameraId

source

status

limit

GET /api/camera-health

Reads from camera_health view.

GET /api/camera-token

Returns ingest_token.

POST /api/camera-token

Regenerates ingest token.

8️⃣ Integrations
Reolink Go Ranger PT (SMTP → ingest)

Mailbox: reolink@venaris.io

Script: smtp-bridge.mjs

UNSEEN-only mode

UID dedup

Vendor-aware

Inline images supported

Status: ✅ Stable

X-View LTE (FTP → Worker → ingest)

FTP user: xview01

Passive FTP

Ingest token: cam-view-1

import_method: ftp

Worker forwarding confirmed

Production ingest confirmed

File deletion confirmed

Status: ✅ Fully operational

9️⃣ Architecture Maturity

Venaris now has:

Multi-source ingestion layer

Vendor-aware SMTP bridge

Dedicated FTP Gateway (isolated)

Worker-based ingestion transformation

Vercel-protected production ingest endpoint

SHA256 deduplication

Batch monitoring

Rule-based health engine

Event clustering layer

Detection stub layer

Secure RLS API layer

Signed URL preview system

Infrastructure is production-structurable.

🔟 Immediate Next Step

Next expansion:

ZEISS Secacam 5 integration.

Likely path:
App-based export → Cloud folder → Ingest normalization.

Separate design session required.

11️⃣ Operational Notes

SMTP processes UNSEEN only.

FTP Gateway isolates users via chroot.

Worker deletes files only after successful ingest.

Dedup is idempotent.

Supabase is the single source of truth.

Hetzner is a transport layer only.

Worker requires bypass token if Vercel Protection active.

Rotate bypass token if leaked.