Venaris – Dev Notes

Last updated: 2026-03-09 (Visible Intelligence Layer v1 + Seed Intelligence Dataset)

This file documents operational setup, real-world behavior, and important implementation details that are not purely architectural.

It is intentionally practical.

1️⃣ Local Development Setup (Windows)

Project root:

C:\dev\venaris

Run app:

npm run dev

Local URL:

http://localhost:3000

Environment file:

.env.local

Contains:

NEXT_PUBLIC_SUPABASE_URL

NEXT_PUBLIC_SUPABASE_ANON_KEY

SUPABASE_SERVICE_ROLE_KEY

Optional:

local test ingest tokens

⚠️ Never commit .env files.

However:

Masked infrastructure environment templates may exist in the repository for documentation purposes.

Example location:

infrastructure/hetzner-worker/env/

These files must never contain real credentials.

2️⃣ Unified Ingest Pipeline (CRITICAL)

Core logic lives in:

src/lib/ingestCore.ts

Used by:

src/app/api/ingest/route.ts

src/app/api/upload/route.ts

This guarantees:

same dedup logic

same batch handling

no duplicated ingest logic

Important architectural clarification:

Event clustering becomes meaningful only after wildlife detections exist.
So ingest should stay fast and focused on asset creation, not intelligence interpretation.

3️⃣ Ingest API Contract (Workers → Production)

Route:

src/app/api/ingest/route.ts

Requirements:

Header

x-ingest-token

Body

multipart/form-data

File field

file OR files

metadata must be JSON string.

Example metadata:

{
  "source": "ftp",
  "ftp_user": "xview01",
  "filename": "IMG_1234.JPG"
}

metadata.source determines:

ingest_batches.source

4️⃣ Common Failure Modes (Already Encountered)
❌ Raw binary upload (application/octet-stream)

Result:

500 Failed to parse body as FormData

Fix:

Always send multipart/form-data.

❌ Missing metadata

Result:

ingest_batches.source incorrect

Fix:

Always attach metadata JSON.

❌ Wrong ingest URL

Workers accidentally targeting localhost instead of production.

Fix:

Workers must always target production API.

❌ Vercel Deployment Protection

Observed:

401

HTML login / redirects

Fix:

Append:

?x-vercel-protection-bypass=<token>

to worker ingest URL.

❌ 307/308 Redirect

Fix:

Always use bypass query parameter.

Worker handles redirects but still relies on correct base URL.

⚠️ Real Incident (2026-03-06)

Symptom:

Detection pipeline produced errors such as:

fake_detection_failed: invalid input value for enum taxonomy_species_v1: "test_species"

Root cause:

Hetzner workers were targeting an outdated Vercel deployment.

Worker environment contained:

VENARIS_INGEST_URL=https://<old-vercel-deployment>/api/ingest

As a result:

Production code and worker code were temporarily out of sync.

Resolution:

Worker .env files updated to reference the current Vercel deployment.

After correction:

Ingestion and detection pipeline resumed normal operation.

Lesson learned:

Workers must always reference the active production deployment.

Long-term improvement:

Prefer stable domain (e.g. venaris.ai) instead of ephemeral Vercel deployment URLs.

5️⃣ Import Adapter (Manual Channel)

Route:

src/app/api/upload/route.ts

Capabilities:

multi-file upload

ZIP upload (via JSZip)

Metadata:

metadata.source="manual"

Channels:

upload

import

Safety guards:

MAX_FILES

MAX_ZIP_BYTES

All files forwarded to ingestCore.

UI:

/import

Human ingestion entrypoint.

6️⃣ SMTP Bridge (Reolink)

Flow:

IMAP mailbox → smtp-bridge.mjs → /api/ingest

Characteristics:

processes UNSEEN only

dedup via IMAP UID

supports inline images (CID)

metadata.source="smtp"

Poll interval:

60s

Status:

Stable for MVP.

7️⃣ FTP Gateway (Hetzner)

Purpose:

Handle FTP-native cameras.

Server:

Hetzner VPS, Ubuntu 24.04

Security:

SSH key only

root login disabled

UFW enabled

Ports:

22

21

40000–40100

vsftpd config:

/etc/vsftpd.conf

Key lines:

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

Location:

/opt/venaris-worker

Service:

venaris-ftp-worker (systemd)

Environment:

/opt/venaris-worker/.env

Key vars:

VENARIS_INGEST_URL=https://<prod>/api/ingest?x-vercel-protection-bypass=<token>

POLL_SECONDS=15

CAMERA_TOKEN_XVIEW01=cam-view-1

Behavior:

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

Pipeline:

claim queued assets (RPC)

download image from Supabase Storage

MegaDetector → detections

Species classification (only if animal) → update detections

Empty filter → assets.empty + assets.empty_confidence + assets.relevant

Event clustering RPC

Important operational note:

A “hard run” can process the entire backlog (hundreds of assets) if many assets are still queued.

Important confirmed behavior from worker code:

Worker itself does not implement event aggregation logic.
It only triggers:

upsert_event_for_asset(...)

The aggregation logic remains DB-centric.

🔟 MegaDetector (Stage 1)

Purpose:

Detect presence of:

animal

human

vehicle

Output:

bboxes

confidence scores

Primary MVP role:

Drive “empty vs non-empty” system decision.

Worker implementation detail:

MegaDetector output is stored as rows in detections:

label = animal/human/vehicle

score = MD confidence

meta.bbox = relative bbox

meta.model = megadetector_v1000

meta.md_idx = per-object detection index

Thresholds (env):

MD_MIN_CONF

MD_MAX_DETECTIONS

MD_ANIMAL_THRESHOLD

Important new interpretation:

meta.md_idx is now the canonical key for wildlife counting within one image.

1️⃣1️⃣ Empty Filter (System Decision)

Rule (v1):

Compute best animal score among detections.

If:

best_animal_score < MD_ANIMAL_THRESHOLD → empty=true

Else:

empty=false

Writes to assets:

empty

empty_confidence

relevant = !empty

Known behavior observed:

Images with only human / vehicle detections result in:

best_animal_score = 0 → empty=true

This is intended for MVP.

1️⃣2️⃣ Species Classifier (Stage 2 – Option A)

Approach:

Pretrained CLIP zero-shot classification over Venaris taxonomy.

Runs only when:

MegaDetector has at least one animal detection.

Input:

Image + bbox list from MegaDetector.

Technique:

crop bbox (+ pad)

CLIP similarity vs prompt set

choose best label if similarity exceeds threshold

Important config (env):

SPECIES_PYTHON

SPECIES_RUNNER

SPECIES_SIM_THRESHOLD

SPECIES_BBOX_PAD

SPECIES_SPECIES_SOFTMAX=0

Observed behavior:

CLIP performs well for distinct species:

fox

badger

wolf

wild_boar

Controlled test (2026-03-06):

All correctly classified with confidence ≈ 0.96–0.97.

Ambiguity observed:

red_deer (night IR image) classified as roe_deer.

Interpretation:

Expected ambiguity within deer classes under infrared imagery.

This is a model limitation, not a system malfunction.

1️⃣3️⃣ Venaris Wildlife Taxonomy v1 (DB-backed)

Taxonomy is a Postgres ENUM:

taxonomy_species_v1

Values:

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

Table mapping:

detections.species uses type taxonomy_species_v1

1️⃣4️⃣ Detection Tables (Current Truth)

Tables exist:

detections

asset_detections

Operational decision (MVP):

Use detections as the single source of truth.

asset_detections currently unused.

Important correction confirmed during intelligence work:

detections.count is currently not a reliable biological counting source.

Current biological counting uses:

count(distinct meta.md_idx)

instead.

1️⃣5️⃣ Counting Model v1 (practical implementation note)

This is now an active operational rule.

Asset-Level

asset_species_summary is derived from detections using:

label = 'animal'

species is not null

count(distinct meta.md_idx) as animal_count

Meaning:

One image with 3 roe deer → animal_count = 3

Event-Level

event_species_summary is derived from asset_species_summary using:

MAX(asset_species_count) per species within one event

Meaning:

Three consecutive images of the same roe deer should not automatically count as 3 animals.

This rule now drives:

event-level top_count

event wildlife interpretation

dashboard observation logic

1️⃣6️⃣ Visible Intelligence Layer (Operational)

Visible Intelligence is now running in the application.

Event Relevance

Event scoring now works on wildlife-only logic:

only label = 'animal'

species weights configurable in DB

event summaries derived from wildlife summaries, not raw row counts

Config table:

species_weights

Event aggregation logic:

update_event_aggregation(...)

Views:

asset_species_summary

event_species_summary

Events UI

/events now shows:

top species

top count

relevance score

camera label

asset count

Events are ranked by relevance.

Intelligence Dashboard

Route:

/intelligence

Current scope:

seed cameras only

Modules live:

Species Overview

Where & When

Activity

Periods:

30d

90d

365d

Important implementation note:

For 365d, summary loading must be chunked because large .in(eventIds) queries can cause 400 Bad Request.

Current solution:

fetchEventSpeciesSummaryChunked(...)

This is now part of src/app/intelligence/page.tsx.

1️⃣7️⃣ Seed Intelligence Dataset

A seed generator now exists for intelligence/dashboard testing.

Script:

scripts/seed-intelligence.mjs

Purpose:

create realistic wildlife dashboard data

avoid worker / AI runtime for dashboard tests

simulate habitat-specific and time-specific wildlife behavior

Important note:

Node scripts do not automatically load .env.local.

Seeder must explicitly load environment using dotenv.

Typical fix:

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

Seed characteristics:

1 seed revier

5 seed cameras

realistic species distributions

realistic time-of-day activity

multiple animals in one asset

direct inserts into DB

no real images

no Supabase Storage previews

Practical implication:

Seed assets may show “Kein Preview” in UI.
That is expected and acceptable.

1️⃣8️⃣ Worker Operation & Debug Routine

SSH:

ssh venaris@<server-ip>

Check service:

sudo systemctl status venaris-detection-worker --no-pager -l

Logs:

sudo journalctl -u venaris-detection-worker -f

Key log line pattern:

processed asset=<id> cam="<name>" detections=<n> empty=<true/false> captured=<source> dt_ms=<ms>
1️⃣9️⃣ Known Risk Areas (Current)

hard backlog runs can take time

no dead-letter queue

LTE partial uploads

token leakage risk

multi-camera scaling still env-based

model updates require versioning discipline

current event clustering is time-window based only

event clustering can over-group artificial test uploads from different species if imported too close together

Important nuance:

This last issue is mainly a test-data artifact, not a production blocker for real camera usage.

2️⃣0️⃣ Important Production Truths

Hetzner is a gateway. It must remain stateless.

Supabase is the single source of truth.

If Hetzner is destroyed, no wildlife data is lost.

All persistent state lives in Supabase.

Wildlife intelligence rules now exclude:

human

vehicle

from biological/event intelligence.

📦 Infrastructure Archiving

The full Hetzner worker runtime was archived into the repository:

infrastructure/hetzner-worker/

Included components:

ftp-worker.mjs

smtp-bridge.mjs

MegaDetector runner

species classifier runner

systemd services

masked environment templates

Purpose:

Ensure the production worker environment is reproducible and documented.

Practical Status Summary

The system now has:

stable ingest

stable async AI worker

wildlife-only event scoring

asset-level wildlife summaries

event-level wildlife summaries

intelligence dashboard v1

realistic seed dataset for dashboard testing

This is enough to continue with:

dashboard refinement

wilddruck indicator

where & when refinement

field validation preparation