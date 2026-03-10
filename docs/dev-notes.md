Venaris – Dev Notes

Last updated: 2026-03-10 (Direct SMTP Ingest + Postfix + Maildir Bridge)

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

❌ Invalid ingest token

Observed in new Maildir SMTP worker during direct SMTP migration.

Result:

401 {"error":"invalid ingest token"}

Root cause:

camera_ingest_configs.ingest_token was not yet aligned with the live camera token.

Fix:

Store the valid per-camera ingest token in:

camera_ingest_configs.ingest_token

Important architectural lesson:

SMTP worker must no longer rely on hardcoded .env camera tokens.
Tokens must come from DB camera routing config.

❌ Unknown SMTP camera alias

Observed during external SMTP tests with addresses such as:

test-cam-9999@cams.venaris.io

Result:

Worker correctly logged:

unknown camera alias

Fix:

Move such messages into:

/home/venaris/Maildir/invalid

This prevents reprocessing loops.

❌ Maildir processing loop on unknown camera

Observed in first Maildir worker iteration.

Root cause:

Failed messages remained inside:

/home/venaris/Maildir/new

and were reprocessed every cycle.

Fix:

Unknown alias messages must be moved to:

Maildir/invalid

API failures must be moved to:

Maildir/error

Successful messages must be moved to:

Maildir/processed
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

Human ingestion entry point.

6️⃣ SMTP Ingest (Current Production Path)
Current production flow
Camera
↓
SMTP
↓
MX cams.venaris.io
↓
Hetzner Postfix
↓
Maildir
↓
maildir-bridge.mjs
↓
/api/ingest

This is now the preferred SMTP ingest architecture.

Why this replaced IMAP polling

Benefits:

no dependency on external mailbox routing

no mailbox-per-camera setup

no catch-all requirement from hosting provider

direct infrastructure control

scalable to many cameras

queue-based processing

7️⃣ Previous SMTP Bridge (Deprecated)

Previous flow:

Mailbox (IMAP)
→ smtp-bridge.mjs
→ /api/ingest

Characteristics:

processed UNSEEN only

dedup via IMAP UID

vendor-aware parsing

inline image support

metadata.source="smtp"

Environment:

/opt/venaris-worker/.env.smtp

Service:

venaris-smtp-bridge

Status:

DISABLED

This service remains archived and documented, but is no longer the target SMTP production path.

8️⃣ Direct SMTP Gateway (Hetzner)
Purpose

Provide Venaris-owned SMTP entry point for camera ingest.

Domain
cams.venaris.io
DNS setup

mail.cams.venaris.io → Hetzner server IP

cams.venaris.io → MX → mail.cams.venaris.io

Important:

Only the SMTP subdomain was redirected.
Main domain mail for venaris.io remains unaffected.

SMTP server

Postfix on Hetzner.

Important Postfix config includes:

myhostname = mail.cams.venaris.io
mydestination = mail.cams.venaris.io, localhost
home_mailbox = Maildir/
inet_interfaces = all
inet_protocols = ipv4
virtual_alias_domains = cams.venaris.io
virtual_alias_maps = regexp:/etc/postfix/virtual_cams

Catch-all regex file:

/etc/postfix/virtual_cams

Rule:

/^.+@cams\.venaris\.io$/ venaris

This makes all mail to:

*@cams.venaris.io

arrive locally for user:

venaris

without mailbox provisioning.

UFW requirement

Port 25 must be explicitly opened:

sudo ufw allow 25/tcp

Without this, external SMTP delivery fails even if Postfix is listening.

9️⃣ Maildir Queue

Location:

/home/venaris/Maildir

Relevant folders:

new
processed
invalid
error

Meaning:

new → unprocessed SMTP messages

processed → ingest successful

invalid → unknown camera alias / unusable mail

error → ingest/API failure

Operational benefit:

This gives clear SMTP ingest state visibility and prevents loops.

🔟 Maildir Worker (Production)

Location:

/opt/venaris-worker/maildir-bridge.mjs

Repository copy:

infrastructure/hetzner-worker/maildir-bridge.mjs

Service:

venaris-maildir-bridge.service

Behavior:

scan Maildir queue

parse raw mail with mailparser

extract original recipient

resolve camera using DB

filter image attachments

send multipart request to /api/ingest

move mail to correct Maildir state

Recipient resolution order:

X-Original-To

To

This was validated with real Hetzner/Postfix-delivered email.

Current lookup rule
select *
from camera_ingest_configs
where smtp_alias = <recipient>
  and is_active = true
limit 1

Resolved values used by worker:

camera_id

vendor

ingest_token

1️⃣1️⃣ FTP Gateway (Hetzner)

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

1️⃣2️⃣ FTP Worker (Production)

Location:

/opt/venaris-worker

Service:

venaris-ftp-worker

Environment:

/opt/venaris-worker/.env

Behavior:

poll inbox

ensure file size stable

compute SHA256

send multipart FormData (metadata.source="ftp")

delete file on success

keep file on error (retry via polling)

Example dedup log:

accepted=0 skippedDup=1

Inbox remains clean.

1️⃣3️⃣ Detection Architecture (Operational)

Detection is asynchronous.

Assets are processed in background by a dedicated worker service:

venaris-detection-worker

Pipeline:

claim queued assets
↓
download image from Supabase Storage
↓
MegaDetector → detections
↓
Species classification (if animal)
↓
update detections
↓
Empty filter → assets.empty + assets.empty_confidence + assets.relevant
↓
Event clustering RPC

Important operational note:

A “hard run” can process the entire backlog (hundreds of assets) if many assets are still queued.

Important confirmed behavior from worker code:

Worker itself does not implement event aggregation logic.
It only triggers:

upsert_event_for_asset(...)

Aggregation remains DB-centric.

1️⃣4️⃣ MegaDetector (Stage 1)

Purpose:

Detect presence of:

animal

human

vehicle

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

1️⃣5️⃣ Empty Filter (System Decision)

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

1️⃣6️⃣ Species Classifier (Stage 2)

Approach:

Pretrained CLIP zero-shot classification over Venaris taxonomy.

Runs only when:

MegaDetector has at least one animal detection.

Technique:

crop bbox (+ pad)
↓
CLIP similarity vs prompt set
↓
best label if threshold passed

Important config:

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

Observed ambiguity:

red_deer can be classified as roe_deer in IR night imagery.
This is treated as model ambiguity, not system malfunction.

1️⃣7️⃣ Venaris Wildlife Taxonomy v1 (DB-backed)

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

detections.species
1️⃣8️⃣ Detection Tables (Current Truth)

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

1️⃣9️⃣ Counting Model v1 (Practical Implementation Note)

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

2️⃣0️⃣ Visible Intelligence Layer (Operational)

Visible Intelligence is now running in the application.

Event Relevance

Event scoring now works on wildlife-only logic:

only label = 'animal'

species weights configurable in DB

event summaries derived from wildlife summaries, not raw row counts

Config table:

species_weights

Aggregation logic:

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

For 365d, summary loading uses chunked fetching of event_species_summary to avoid request-size issues.

Current solution:

fetchEventSpeciesSummaryChunked(...)
2️⃣1️⃣ Seed Intelligence Dataset

Seed generator:

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

2️⃣2️⃣ Worker Operation & Debug Routine

SSH:

ssh venaris@<server-ip>
Detection worker

Status:

sudo systemctl status venaris-detection-worker --no-pager -l

Logs:

sudo journalctl -u venaris-detection-worker -f

Pattern:

processed asset=<id> cam="<name>" detections=<n> empty=<true/false> dt_ms=<ms>
Maildir worker

Status:

sudo systemctl status venaris-maildir-bridge --no-pager -l

Logs:

journalctl -u venaris-maildir-bridge -f

Queue counts:

find /home/venaris/Maildir/new -type f | wc -l
find /home/venaris/Maildir/processed -type f | wc -l
find /home/venaris/Maildir/error -type f | wc -l
find /home/venaris/Maildir/invalid -type f | wc -l
Postfix

Live logs:

sudo journalctl -u postfix -f
2️⃣3️⃣ Known Risk Areas (Current)

hard backlog runs can take time

no dead-letter queue beyond Maildir error folder

LTE partial uploads

token leakage risk

some camera provisioning still manual

model updates require versioning discipline

current event clustering is time-window based only

event clustering can over-group artificial test uploads from different species if imported too close together

Maildir worker currently scans directory sequentially (not yet parallelized)

SMTP spam filtering is still basic and should be hardened later

Important nuance:

The over-grouping issue is mainly a test-data artifact, not a production blocker for real camera usage.

2️⃣4️⃣ Important Production Truths

Hetzner is a gateway and worker runtime layer. It must remain operationally replaceable.

Supabase is the single source of truth.

If Hetzner is destroyed:

no wildlife data is lost

no assets are lost

no events are lost

All persistent state lives in Supabase.

Wildlife intelligence rules exclude:

human

vehicle

from biological/event intelligence.

SMTP camera routing truth now lives in:

camera_ingest_configs

not in .env.

📦 Infrastructure Archiving

The full Hetzner worker runtime is archived into the repository:

infrastructure/hetzner-worker/

Included components:

ftp-worker.mjs

smtp-bridge.mjs (deprecated path)

maildir-bridge.mjs (current SMTP path)

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

direct SMTP ingest via Hetzner

Maildir queue-based SMTP processing

DB-driven SMTP camera resolution

wildlife-only event scoring

asset-level wildlife summaries

event-level wildlife summaries

intelligence dashboard v1

realistic seed dataset for dashboard testing

This is enough to continue with:

dashboard refinement

wilddruck indicator

provisioning logic

where & when refinement

field validation preparation