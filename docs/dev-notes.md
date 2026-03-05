Venaris – Dev Notes

Last updated: 2026-03-05 (Day 5 – Detection Worker + MegaDetector + Species v1 Live)

This file documents operational setup, real-world behavior, and important implementation details that are not purely architectural.

It is intentionally practical.

1️⃣ Local Development Setup (Windows)

Project root
C:\dev\venaris

Run app
npm run dev

Local URL
http://localhost:3000

Environment file
.env.local

Contains

NEXT_PUBLIC_SUPABASE_URL

NEXT_PUBLIC_SUPABASE_ANON_KEY

SUPABASE_SERVICE_ROLE_KEY

Optional

local test ingest tokens

⚠️ Never commit .env files.

2️⃣ Unified Ingest Pipeline (CRITICAL)

Core logic lives in
src/lib/ingestCore.ts

Used by

src/app/api/ingest/route.ts

src/app/api/upload/route.ts

This guarantees:

same dedup logic

same batch handling

same event clustering trigger

no duplicated ingest logic

3️⃣ Ingest API Contract (Workers → Production)

Route
src/app/api/ingest/route.ts

Requirements

Header
x-ingest-token

Body
multipart/form-data

File field
file OR files

metadata must be JSON string.

Example metadata

{
  "source": "ftp",
  "ftp_user": "xview01",
  "filename": "IMG_1234.JPG"
}

metadata.source determines
ingest_batches.source

4️⃣ Common Failure Modes (Already Encountered)

❌ Raw binary upload (application/octet-stream)
Result: 500 Failed to parse body as FormData
Fix: always send multipart/form-data.

❌ Missing metadata
Result: ingest_batches.source incorrect
Fix: always attach metadata JSON.

❌ Wrong ingest URL
Workers accidentally targeting localhost:3000 instead of production
Fix: workers must always target production API.

❌ Vercel Deployment Protection
Observed: 401 + HTML login / redirects
Fix: append
?x-vercel-protection-bypass=<token>
to worker ingest URL.

❌ 307/308 Redirect
Fix: always use bypass query parameter (worker handles redirects but relies on correct URL).

5️⃣ Import Adapter (Manual Channel)

Route
src/app/api/upload/route.ts

Capabilities

multi-file upload

ZIP upload (via JSZip)

metadata.source="manual"

channels: upload / import

Safety guards

MAX_FILES

MAX_ZIP_BYTES

All files forwarded to ingestCore.

UI
/import
Human ingestion entrypoint.

6️⃣ SMTP Bridge (Reolink)

Flow
IMAP mailbox → smtp-bridge.mjs → /api/ingest

Characteristics

processes UNSEEN only

dedup via IMAP UID

supports inline images (CID)

metadata.source="smtp"

poll interval: 60s

Stable for MVP.

7️⃣ FTP Gateway (Hetzner)

Purpose
Handle FTP-native cameras.

Server
Hetzner VPS, Ubuntu 24.04

Security

SSH key only

root login disabled

UFW enabled

Ports

22

21

40000–40100

vsftpd config
/etc/vsftpd.conf

Key lines

user_sub_token=$USER

local_root=/data/ftp-ingest/$USER/inbox

pasv_enable=YES

pasv_min_port=40000

pasv_max_port=40100

pasv_address=<server-ip>

chroot_local_user=YES

allow_writeable_chroot=YES

anonymous_enable=NO

local_umask=007

⚠️ local_umask=007 is critical so files are group-writable and worker can delete.

8️⃣ FTP Worker (Production)

Location
/opt/venaris-worker

Service
venaris-ftp-worker (systemd)

Environment
/opt/venaris-worker/.env

Key vars

VENARIS_INGEST_URL=https://<prod>/api/ingest?x-vercel-protection-bypass=<token>

POLL_SECONDS=15

CAMERA_TOKEN_XVIEW01=cam-view-1

Behavior

scan inbox

ensure file size stable (LTE safety)

compute SHA256

send multipart FormData (metadata.source="ftp")

delete file on success

keep file on error (retry via polling)

Dedup example:

accepted=0 skippedDup=1
Inbox remains clean.

9️⃣ Detection Architecture (Operational)

Detection is asynchronous.

Assets are processed in background by a dedicated worker service:

venaris-detection-worker (systemd)

Pipeline (v1)

claim queued assets (RPC)

download image from Supabase Storage

MegaDetector → detections

Empty filter → assets.empty + assets.empty_confidence + assets.relevant

Species classification (only if animal) → update detections.species

event clustering (RPC)

Important operational note:
A “hard run” can process the entire backlog (hundreds of assets) if many assets are still queued.

🔟 MegaDetector (Stage 1)

Purpose
Detect presence of:

animal

human

vehicle

Output

bboxes

confidence scores

Primary MVP role
Drive “empty vs non-empty” system decision.

Worker implementation detail
MegaDetector output is stored as rows in detections:

label = animal/human/vehicle

score = MD confidence

meta.bbox = relative bbox

meta.model = megadetector_v1000

Thresholds (env)

MD_MIN_CONF (filters detections returned from runner)

MD_MAX_DETECTIONS (caps returned detections)

MD_ANIMAL_THRESHOLD (used for empty filter decision)

1️⃣1️⃣ Empty Filter (System Decision)

Rule (v1)

compute best animal score among detections

if best_animal_score < MD_ANIMAL_THRESHOLD → empty=true

else → empty=false

Writes to assets

empty

empty_confidence (currently 1 - best_animal_score)

relevant = !empty (system decision)

Known behavior observed

images with only “human/vehicle” will result in best_animal_score=0 → empty=true

This is intended for MVP, but may be refined later.

1️⃣2️⃣ Species Classifier (Stage 2 – Option A)

Approach
Pretrained CLIP zero-shot classification over Venaris taxonomy.

Runs only when
MegaDetector has at least one animal detection.

Input
Image + bbox list from MegaDetector.

Technique

crop bbox (+ pad)

CLIP similarity vs prompt set

choose best label if similarity exceeds threshold

Important config (env)

SPECIES_PYTHON

SPECIES_RUNNER

SPECIES_SIM_THRESHOLD

SPECIES_BBOX_PAD

SPECIES_SPECIES_SOFTMAX=0
(score uses similarity value for consistency)

Observed: with correct threshold & padding, CLIP can map deer → roe_deer (example sim ~0.33).

1️⃣3️⃣ Venaris Wildlife Taxonomy v1 (DB-backed)

Taxonomy is a Postgres ENUM:

taxonomy_species_v1

Values (15 classes)

roe_deer

wild_boar

red_deer

fallow_deer

mouflon

fox

wolf

badger

raccoon

raccoon_dog

hare

rabbit

pheasant

crow

other

Table mapping

detections.species uses type taxonomy_species_v1

1️⃣4️⃣ Detection Tables (Current Truth)

Tables exist:

detections

asset_detections

Operational decision (MVP)

Use detections as the single source of truth for MD + species.

asset_detections is currently unused and can remain unused unless we need aggregated per-asset flags later.

detections columns

label (text)

species (taxonomy_species_v1, nullable)

score (MD confidence)

meta (jsonb, bbox + model)

additional (optional / added): species_sim (similarity score)

1️⃣5️⃣ captured_at (EXIF Backfill)

The detection worker can backfill captured_at if missing.

Logic (v1)

if assets.captured_at exists → keep

else, for configured import methods only:

attempt EXIF parse under strict caps:

EXIF_MAX_BYTES

EXIF_TIMEOUT_MS

else fallback to created_at (“receipt time”)

Configured methods

EXIF_ONLY_FOR_IMPORT_METHODS=ftp,manual,token-ingest

Logs expose source:

captured=exif

captured=created_at_fallback

etc.

1️⃣6️⃣ Worker Operation & Debug Routine

SSH
ssh venaris@<server-ip>

Check service

sudo systemctl status venaris-detection-worker --no-pager -l

Logs

sudo journalctl -u venaris-detection-worker -f

Key “must-have” log line pattern (MVP)

processed asset=<id> cam="<name>" detections=<n> empty=<true/false> captured=<source> dt_ms=<ms>

This is essential to interpret confusing states quickly (e.g. detections=1 empty=true).

1️⃣7️⃣ Known Risk Areas (Current)

Hard backlog runs can take time (hundreds of assets)

No quarantine/dead-letter queue (failures retry until MAX_ATTEMPTS then failed)

LTE partial uploads (handled via “stable file size” check on FTP worker)

Token leakage (bypass token + ingest tokens)

Multi-camera scaling still env-based

Model updates require versioning discipline (store model name/version in meta)

1️⃣8️⃣ Important Production Truths

Hetzner is a gateway. It must remain stateless.
Supabase is the single source of truth.

If Hetzner is destroyed, no wildlife data is lost.
All persistent state lives in Supabase.