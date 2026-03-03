Venaris – Current State

Last updated: 2026-03-03 (Day 3 – Unified Ingest + Import Center)

✅ System Status

Unified ingest pipeline (FTP + SMTP + Manual via shared ingestCore)

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

Event layer working (clustering + aggregation)

Relevant toggle working + persists

Detection stub working (dev)

Import Adapter (ZIP + multi-file) implemented

Import Center UI implemented

Navigation updated (Import added)

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
JSZip (Import Adapter ZIP support)

2️⃣ Production Gateway (FTP – Stable)
Hetzner VPS

Server:
CX23
Ubuntu 24.04

Security:
SSH key-only login
Root login disabled
UFW enabled

Open ports:
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

Permission model (final)
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
POLL_SECONDS=15
CAMERA_TOKEN_XVIEW01=cam-view-1
Worker Behavior (Confirmed Live)

Poll inbox

Ensure file size stable (LTE safety)

Compute SHA256 (log only)

Send multipart FormData

metadata.source="ftp"

Manual redirect handling (307/308)

Delete file only after successful ingest

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

For duplicates:

accepted=0 skippedDup=1
deleted ...

Inbox remains clean.

4️⃣ SMTP Bridge (Production Confirmed)

Service:
venaris-smtp-bridge (systemd)

Environment:
/opt/venaris-worker/.env.smtp

Poll interval:
60 seconds

Behavior:

IMAP UNSEEN-only

UID dedup

Vendor-aware parsing

Inline images supported

metadata.source="smtp"

Sends to production ingest endpoint (with bypass token)

Status: ✅ Stable

5️⃣ Unified Ingest Architecture

Core Logic extracted to:

src/lib/ingestCore.ts

Used by:

POST /api/ingest

POST /api/upload

Guarantees:

ingest_batches record created

source derived from metadata

per-camera SHA256 dedup

storage upload

assets insert

event clustering RPC

detection stub (dev)

cameras.last_seen_at updated

batch status + summary handling

This removed duplicated logic between ingest and upload.

6️⃣ Import Adapter (Manual Channel)

Route:

POST /api/upload

Capabilities:

Multi-file upload

ZIP upload (auto-extracted via JSZip)

metadata.source="manual"

channel="import" or "upload"

MAX_FILES guard

MAX_ZIP_BYTES guard

All files forwarded to ingestCore pipeline.

Import batches now appear in monitoring as:

source = manual

7️⃣ Import Center (UI)

Route:

/import

Capabilities:

Camera selection (auto-default first camera)

Single button: “Bilder oder ZIP auswählen…”

Multi-file support

ZIP support

Drag & Drop support

Batch result feedback

Uses /api/upload with channel="import"

Navigation updated:

Home · Cameras · Import · Ingest · Events

Import is now the human-facing ingestion entrypoint.
Ingest page remains technical monitoring.

8️⃣ Storage

Bucket:
camera-assets

Naming scheme:

{cameraId}/{timestamp}-{hash12}.ext

Signed URLs:
20 min expiry
Generated server-side only

Supabase is the only persistent storage.
Hetzner holds no permanent wildlife data.

9️⃣ Database (Active Tables)
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

Cam 1 → ftp/manual (test)

assets

id

camera_id

storage_path

file_hash

status

relevant

captured_at

created_at

ingest_batch_id

detections (DEV STUB)
events
event_assets
ingest_batches

id

camera_id

received_at

source (ftp | smtp | manual)

file_count

status

error_summary

meta (jsonb)

camera_health_rules
🔟 Views
camera_health

Rule-based evaluation per import_method
States: online / stale / offline / unknown

event_feed

security_invoker enabled
Used by /events

1️⃣1️⃣ API Routes (Production-Ready)

POST /api/upload
Manual & Import Adapter

POST /api/ingest
Token-based ingest (FTP + SMTP workers)

GET /api/assets
GET /api/asset-url
POST /api/asset-relevant
GET /api/ingest-batches
GET /api/camera-health
GET /api/camera-token
POST /api/camera-token

1️⃣2️⃣ Architecture Maturity

Venaris now has:

Multi-source ingestion layer

Vendor-aware SMTP bridge

Dedicated FTP Gateway (isolated)

Worker-based ingestion transformation

Unified ingest pipeline

ZIP-capable Import Adapter

Import Center UI

Vercel-protected production ingest endpoint

SHA256 deduplication

Batch monitoring

Rule-based health engine

Event clustering layer

Detection stub layer

Secure RLS API layer

Signed URL preview system

Infrastructure is production-structurable.

🔜 Immediate Next Step

ZEISS Secacam 5 integration.

Likely path:
App/Web export → Import Center (ZIP) → ingest normalization.

Optional next technical layer:

EXIF timestamp parsing

Filename timestamp parsing

Structured import metadata

🔒 Operational Notes

SMTP processes UNSEEN only

FTP Gateway isolates users via chroot

Worker deletes files only after successful ingest

Dedup is idempotent

Supabase is single source of truth

Hetzner is transport layer only

Worker requires bypass token if Vercel Protection active

Rotate bypass token if leaked