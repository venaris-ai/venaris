Venaris – Dev Notes

Last updated: 2026-03-12 (Secure FTP Provisioning + FTPDIR Bridge + SMTP/FTP Retention + Manual Import Stabilization)

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

For local camera provisioning UI / API tests, local environment now also requires:

FTP_PUBLIC_HOST

FTP_PUBLIC_PORT

HETZNER_PROVISIONER_URL

HETZNER_PROVISIONER_TOKEN

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
  "ftp_user": "test-cam-0003",
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

Observed in Maildir SMTP worker and later in FTPDIR bridge migration.

Result:

401 {"error":"invalid ingest token"}

Root cause:

camera_ingest_configs.ingest_token not aligned with live camera token.

Fix:

Store the valid per-camera ingest token in:

camera_ingest_configs.ingest_token

Important architectural lesson:

Workers must not rely on hardcoded .env camera tokens.
Tokens must come from DB camera routing config.

❌ Unknown SMTP camera alias

Observed during SMTP tests with addresses such as:

test-cam-9999@cams.venaris.io

Result:

Worker correctly logged:

unknown or not-ready smtp alias

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

❌ FTP camera inbox exists but worker does not ingest

Observed during FTPDIR bridge migration.

Typical causes:

folder not created yet

wrong ownership / permissions

camera still points to old ftp user

invalid ingest token in config

Fix:

verify Linux user exists

verify /data/ftp-ingest/<technical_name>/inbox exists

verify ownership + group ftp-ingest

verify camera points to new technical_name-based ftp user

verify camera_ingest_configs.ingest_token

❌ Local /cameras/new fails with missing HETZNER_PROVISIONER_URL or HETZNER_PROVISIONER_TOKEN

Observed during localhost UI test.

Root cause:

local .env.local did not include Hetzner provisioning env vars.

Fix:

add provisioning env vars to local .env.local and restart dev server.

❌ create_camera_with_provisioning() failed with gen_random_bytes not found

Observed during first full /api/cameras/create E2E test.

Root cause:

Function used:

gen_random_bytes(...)

while running with:

SET search_path TO ''

On Supabase, extension function needed schema qualification.

Fix:

Use:

extensions.gen_random_bytes(...)

inside the SQL function.

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

Prefer stable domain instead of ephemeral Vercel deployment URLs.

5️⃣ Import Adapter (Manual Channel)

Route:

src/app/api/upload/route.ts

Capabilities:

multi-file upload

ZIP upload (via JSZip)

drag & drop

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

Manual Import Stabilization (NEW)

Manual import is no longer treated as a generic upload against arbitrary cameras.

Current rule:

Import UI now lists only cameras where:

camera_ingest_configs.method = 'manual'

camera_ingest_configs.is_active = true

camera_ingest_configs.provisioning_status = 'ready'

Manual cameras now become ready automatically at creation time.

Existing manual cameras were backfilled to:

provisioning_status = 'ready'

Manual ingest has now been validated end-to-end:

camera creation → manual camera visible in import dropdown → upload → ingest batch visible in UI.

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

/^.+@cams.venaris.io
$/ venaris

This makes all mail to:

*@cams.venaris.io

arrive locally for user:

venaris

without mailbox provisioning.

UFW requirement

Port 25 must be explicitly opened:

sudo ufw allow 25/tcp

Without this, external SMTP delivery fails even if Postfix is listening.

TLS / nginx note (NEW)

HTTPS certificate for:

cams.venaris.io

is now active via nginx + certbot.

This is not required for SMTP transport itself,
but it hardens the Hetzner-side subdomain boundary and keeps infrastructure naming consistent.

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

Retention (NEW)

Maildir bridge now includes retention cleanup.

Current retention policy:

processed → 7 days

invalid → 14 days

error → 14 days

new is never auto-cleaned.

Purpose:

prevent unbounded disk growth on Hetzner

keep useful operational debugging window

keep Hetzner as runtime/transport layer, not long-term archive

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

run retention cleanup

Recipient resolution order:

X-Original-To

To

This was validated with real Hetzner/Postfix-delivered email.

Current lookup rule

select *
from camera_ingest_configs
where smtp_alias = <recipient>
  and is_active = true
  and provisioning_status = 'ready'
limit 1

Resolved values used by worker:

camera_id

vendor

ingest_token

Important practical improvement:

maildir-bridge now supports Vercel protection bypass consistently like the new ftpdir-bridge.

Environment:

/opt/venaris-worker/.env.maildir

Important entries:

NEXT_PUBLIC_SUPABASE_URL

SUPABASE_SERVICE_ROLE_KEY

VENARIS_INGEST_URL

VERCEL_BYPASS_TOKEN

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

Directory Lifecycle (NEW)

Per FTP camera, provisioning now creates:

/data/ftp-ingest/<technical_name>/
inbox/
processed/
invalid/
error/

This is no longer just a static inbox-only setup.

1️⃣2️⃣ FTP Worker (Current Production Path)

Previous FTP production worker:

venaris-ftp-worker

Status:

DISABLED / retired

Reason:

It depended on hardcoded .env token mapping and static inbox scanning.

That architecture has been replaced.

Current FTP production worker

Service:

venaris-ftpdir-bridge.service

Worker:

/opt/venaris-worker/ftpdir-bridge.mjs

Repository copy:

infrastructure/hetzner-worker/ftpdir-bridge.mjs

Environment:

/opt/venaris-worker/.env.ftpdir

Behavior:

load active FTP configs from DB

filter for method='ftp'

filter for is_active=true

filter for provisioning_status='ready'

scan only provisioned inboxes

ensure file size stable

compute SHA256

send multipart FormData (metadata.source="ftp")

move files into processed / invalid / error

run retention cleanup

delete only after successful ingest

Important architectural lesson:

FTP worker must now behave analogously to SMTP:
DB-driven, not .env-driven.

1️⃣3️⃣ FTP Provisioner Runtime (NEW)

Purpose:

Automate Linux-side FTP onboarding for real product camera provisioning.

Service:

venaris-ftp-provisioner.service

Runtime:

/opt/venaris-worker/ftp-provisioner.mjs

Environment:

/opt/venaris-worker/.env.provisioner

Public URL:

https://provisioner.venaris.io

Internal bind:

127.0.0.1:8787

Security model:

raw worker port not exposed externally

nginx reverse proxy

HTTPS via Let's Encrypt

bearer token required

UFW port 8787 closed

Responsibilities:

create Linux ftp user

assign ftp-ingest group

set camera FTP password

create full directory tree

set ownership + SGID permissions

support password reset / disable / deprovision actions

Practical result:

FTP provisioning is now part of the SaaS product flow,
not an external manual sysadmin step.

1️⃣4️⃣ Detection Architecture (Operational)

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

1️⃣5️⃣ MegaDetector (Stage 1)

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

1️⃣6️⃣ Empty Filter (System Decision)

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

1️⃣7️⃣ Species Classifier (Stage 2)

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

1️⃣8️⃣ Venaris Wildlife Taxonomy v1 (DB-backed)

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

1️⃣9️⃣ Detection Tables (Current Truth)

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

2️⃣0️⃣ Counting Model v1 (Practical Implementation Note)

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

2️⃣1️⃣ Visible Intelligence Layer (Operational)

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

2️⃣2️⃣ Seed Intelligence Dataset

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

2️⃣3️⃣ Camera Provisioning Model

Venaris now has a database-driven camera provisioning model.

Canonical camera provisioning key:

cameras.technical_name

Format:

<organization-slug>-cam-<4-digit-sequence>

Examples:

demo-cam-0001

test-cam-0004

heubachwiesen-cam-0001

Important decisions:

cameras.id remains the primary key

cameras.technical_name is the canonical provisioning key

camera_ingest_configs is the new routing truth

cameras.ingest_token and cameras.import_method remain temporarily as legacy compatibility fields

Sequence logic:

per organization

starts at 0001

current intended range 0001–9999

never reuse numbers

prefer is_active=false over deletion

Provisioning values are derived from technical_name:

SMTP alias:

<technical_name>@cams.venaris.io

FTP username:

<technical_name>

FTP inbox path:

/data/ftp-ingest/<technical_name>/inbox

Manual label:

<technical_name>

Sequence persistence table:

organization_camera_sequences

Provisioning function:

create_camera_with_provisioning()

Function responsibilities:

validate organization

validate optional revier assignment

allocate next organization sequence

build technical_name

generate secure ingest token

insert camera row

insert ingest config row

return provisioning data

Token decision:

Provisioning generates a fresh secure token.

The same generated token is written into both:

cameras.ingest_token

camera_ingest_configs.ingest_token

Reason:

keep legacy compatibility while moving routing truth into camera_ingest_configs

Vendor decision:

Vendor is validated against controlled list:

berger&schröter

blazevideo

braun

bushnell

gardepro

hikmicro

maginon

minox

reconyx

reolink

seissiger

spypoint

xview

zeiss

other

Provisioning validation status:

Function tested successfully with real test provisioning flow.

Validated:

technical_name generation

correct per-organization sequence increment

organization assignment

optional revier assignment

correct FTP routing derivation

token synchronization across both token fields

Example result observed:

technical_name = test-cam-0005

ftp_username = test-cam-0005

ftp_inbox_path = /data/ftp-ingest/test-cam-0005/inbox

New practical provisioning rules (2026-03-12)

Manual cameras now become:

provisioning_status = 'ready'

immediately.

Reason:

manual cameras require no Hetzner-side runtime provisioning.

FTP cameras remain:

pending

until successful Hetzner provisioning has completed.

SMTP cameras are expected to become operational only when alias/config state is ready.

2️⃣4️⃣ Product Data Model Update
Organization

administrative / tenant / billing / ownership layer

Revier

operational wildlife management area

Camera

administratively belongs to organization
and may optionally be assigned to a revier

Important decision:

organizations and reviers are intentionally not merged.

Reason:

organization is the administrative and commercial scope

revier is the operational field scope

This means:

organizations
├── organization_members
├── cameras
└── reviers

Cameras no longer conceptually depend only on revier.

Current DB direction:

cameras.organization_id = administrative ownership

cameras.revier_id = optional operational assignment

2️⃣5️⃣ Authentication / Multitenancy MVP Layer

Supabase Auth is now integrated.

Current auth flow:

email/password login

protected app routes

logout route

authenticated navigation flow

Relevant frontend pieces:

/login

proxy.ts

src/lib/supabaseAuthServer.ts

src/lib/supabaseBrowser.ts

src/lib/auth.ts

Important implementation note:

Service-role DB access and session-based auth access are intentionally separated.

Use:

supabaseServer()
for service-role / admin DB access

Use:

supabaseAuthServer()
for cookie/session-bound user auth checks

Use:

supabaseBrowser()
for browser login/session handling

Important debugging lesson:

auth helper must normalize organizations relation consistently.

Observed issue:

organizations relation can resolve as object or array depending on runtime shape.

Fix:

normalize relation in src/lib/auth.ts before selecting active organization.

Current protected routes:

/

/cameras

/cameras/new

/events

/intelligence

/import

/ingest

Role model decision (MVP):

organization_members.role

allowed values:

owner

admin

member

viewer

Current MVP authorization decision:

camera creation allowed only for owner/admin

Active organization context decision:

For MVP, the first / only membership is treated as active organization context.
Full org switcher is still pending.

2️⃣6️⃣ Product UI Update

New camera creation route implemented:

/cameras/new

Purpose:

real product camera setup flow, not internal dev-only tooling

Current camera creation UI supports:

organization context

optional revier assignment

camera name

method

vendor

optional location name

optional latitude / longitude

optional direction

optional notes

Current API route:

POST /api/cameras/create

Uses:

create_camera_with_provisioning()

Current provisioning result UI now shows method-dependent setup output:

For SMTP:

camera id

technical name

ingest token

SMTP alias

For FTP:

camera id

technical name

ingest token

FTP host

FTP port

FTP username

FTP password

path

passive mode

For Manual:

camera id

technical name

ingest token

manual label

Important practical rule:

FTP password is shown once in UI and should be stored by the user immediately.

Navigation now includes logout directly.

This is the first real SaaS-style product loop:

login
→ protected navigation
→ create camera
→ receive provisioning data
→ configure real ingest channel
→ send first image

2️⃣7️⃣ Worker Operation & Debug Routine

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

sudo journalctl -u venaris-maildir-bridge -f

Queue counts:

find /home/venaris/Maildir/new -type f | wc -l
find /home/venaris/Maildir/processed -type f | wc -l
find /home/venaris/Maildir/error -type f | wc -l
find /home/venaris/Maildir/invalid -type f | wc -l

FTPDIR bridge

Status:

sudo systemctl status venaris-ftpdir-bridge --no-pager -l

Logs:

sudo journalctl -u venaris-ftpdir-bridge -f

FTP provisioner

Status:

sudo systemctl status venaris-ftp-provisioner --no-pager -l

Logs:

sudo journalctl -u venaris-ftp-provisioner -f

Postfix

Live logs:

sudo journalctl -u postfix -f

nginx

Status:

sudo systemctl status nginx --no-pager -l

2️⃣8️⃣ Known Risk Areas (Current)

hard backlog runs can take time

no dead-letter queue beyond Maildir error folder

LTE partial uploads

token leakage risk

copy UX in provisioning result still basic

model updates require versioning discipline

current event clustering is time-window based only

event clustering can over-group artificial test uploads from different species if imported too close together

Maildir worker currently scans directory sequentially (not yet parallelized)

FTPDIR bridge currently scans sequentially (not yet parallelized)

SMTP spam filtering is still basic and should be hardened later

Important nuance:

The over-grouping issue is mainly a test-data artifact, not a production blocker for real camera usage.

Multi-tenant specific current gaps:

active organization switcher not yet implemented

role checks not yet enforced in all API routes

camera/event/import lists not yet fully filtered by active organization everywhere

membership administration UI not yet implemented

2️⃣9️⃣ Important Production Truths

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

FTP camera routing truth also now lives in:

camera_ingest_configs

not in .env.

Provisioning truth now lives in database and no longer in manual naming conventions alone.

Public provisioning is HTTPS terminated at:

provisioner.venaris.io

Raw provisioning port 8787 is not externally exposed.

📦 Infrastructure Archiving

The full Hetzner worker runtime is archived into the repository:

infrastructure/hetzner-worker/

Included components:

ftp-worker.mjs (deprecated path)

ftpdir-bridge.mjs (current FTP path)

smtp-bridge.mjs (deprecated path)

maildir-bridge.mjs (current SMTP path)

ftp-provisioner.mjs

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

DB-driven FTP camera resolution

automated secure FTP provisioning

wildlife-only event scoring

asset-level wildlife summaries

event-level wildlife summaries

intelligence dashboard v1

realistic seed dataset for dashboard testing

database-driven camera provisioning

real login/logout flow

protected product routes

membership-based multitenancy foundation

manual import as first-class ready camera flow

real FTP camera end-to-end validation from UI provisioning to image ingest

This is enough to continue with:

tenant-aware UI hardening

active organization context UX

role enforcement

revier setup UI

dashboard refinement

wilddruck indicator

where & when refinement

field validation preparation

Honest Project Status (2026-03-12)

Green:

Ingestion

AI pipeline

Provisioning base

Secure FTP provisioning

Camera object model

Auth foundation

Navigation foundation

Manual import stabilization

Yellow:

true multi-tenant UI consolidation

active organization context UX

role enforcement across all relevant routes

tenant-aware camera / event / import filtering

revier setup UI

camera create result UX polish

Still open:

Wilddruck indicator

dashboard consolidation

go-live legal / branding / payment preparation