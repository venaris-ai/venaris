Venaris – Architecture (MVP)

Last updated: 2026-03-12

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

Images → Assets → Detections → Observations → Events → Patterns → Insights

Current MVP stage:

Images → Assets → AI Detections → Wildlife Summaries → Events → Visible Intelligence

🏗 System Overview

Venaris consists of five logical layers:

Ingestion Layer

Storage Layer

Intelligence Layer

Monitoring Layer

Application Layer

System State (MVP Status)

The Ingestion Layer is production-stable for:

SMTP (direct SMTP ingest via Hetzner)

FTP (X-View via Hetzner Gateway)

Manual Import (ZIP + multi-file)

All ingest channels normalize into a unified ingest pipeline.

Core logic:

src/lib/ingestCore.ts

Used by:

POST /api/ingest

POST /api/upload

This guarantees consistent processing across all ingest channels.

The end-to-end AI inference path is validated:

Ingest → Assets → MegaDetector → Species Classification → Event Clustering

The first Visible Intelligence layer is now operational via:

/events

/intelligence

A first real product setup layer is now also operational via:

/login

/cameras/new

This is an important shift:

Venaris is no longer only an internal intelligence tool.
It now has the first real SaaS-style product loop:

login
→ protected routes
→ create camera
→ receive provisioning data
→ configure ingest channel

1️⃣ Ingestion Layer

Purpose

Receive wildlife sensor data from multiple import methods
and normalize them into a unified ingest contract.

Unified Ingest Contract

Primary endpoint:

POST /api/ingest

Requirements

Header

x-ingest-token

Body

multipart/form-data

Fields

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

Capabilities

multi-file upload

ZIP upload

JSZip auto-extraction

metadata.source = "manual"

Guard rails

MAX_FILES

MAX_ZIP_BYTES

All files are forwarded to:

ingestCore

This creates ingest_batches with:

source = manual

Ingest Responsibilities (Unified)

Each ingest:

creates ingest_batch

performs per-camera SHA256 deduplication

stores image in Supabase Storage

inserts asset row

updates camera.last_seen_at

writes asset into async AI queue

Important update:

Event creation is no longer treated as an ingest concern.
Event clustering becomes meaningful only after wildlife-relevant detections exist.

Deduplication is per-camera and idempotent.

SMTP Ingestion (Direct SMTP Gateway)

Current architecture

Camera
↓
SMTP
↓
MX cams.venaris.io
↓
Hetzner Postfix
↓
Maildir queue
↓
maildir-bridge worker
↓
POST /api/ingest

This replaces the earlier IMAP polling architecture for production SMTP ingestion.

Properties

direct SMTP delivery to Venaris-controlled infrastructure

no external mailbox dependency

queue-based ingest

scalable for many cameras

camera resolution via DB lookup

robust error handling through Maildir state folders

Queue model

Incoming SMTP messages are written to:

/home/venaris/Maildir/new

Worker outcome folders:

/home/venaris/Maildir/processed
/home/venaris/Maildir/error
/home/venaris/Maildir/invalid

Meaning:

new → not processed yet

processed → ingest successful

error → ingest failed

invalid → unknown camera alias / unusable mail

This avoids reprocessing loops and provides operational transparency.

Camera routing

SMTP routing is no longer hard coded in .env.

The worker resolves cameras by querying:

camera_ingest_configs.smtp_alias

Example:

test-cam-0002@cams.venaris.io

The worker then loads:

camera_id

ingest_token

vendor

from database configuration.

Image handling

SMTP ingest supports:

classic file attachments

CID / inline images

image MIME filtering

Previous SMTP architecture (deprecated)

Previous path:

Camera
↓
external mailbox
↓
IMAP polling
↓
smtp-bridge.mjs
↓
POST /api/ingest

Status:

Deprecated / disabled

It remains archived for reference, but is no longer the target production path.

FTP Ingestion (Gateway Architecture)

Architecture

Wildlife Camera
→ Hetzner FTP Gateway
→ /data/ftp-ingest/<technical_name>/inbox
→ FTP Worker
→ POST /api/ingest

Gateway Characteristics

Hetzner VPS

vsftpd passive mode

per-camera FTP user

chroot isolation

UFW firewall

SSH key authentication only

root login disabled

Directory Model

/data/ftp-ingest/
   └── <technical_name>/
        └── inbox/

Permissions

Owner: FTP user

Group: ftp-ingest

Mode: 2770 (setgid)

local_umask=007

Worker can:

read

delete

Cameras remain isolated.

Operational rule:

Workers must target the active production endpoint.
Deployment-specific Vercel URLs must not be treated as stable infrastructure endpoints.

Provisioning Alignment (NEW)

FTP and SMTP naming are now aligned with the canonical provisioning model.

Derived routing rules:

SMTP alias:
<technical_name>@cams.venaris.io

FTP username:
<technical_name>

FTP inbox path:
/data/ftp-ingest/<technical_name>/inbox

Manual label:
<technical_name>

This means ingest routing is now derived from a stable product-facing technical camera identity instead of ad hoc naming.

2️⃣ Storage Layer

Supabase Storage

Bucket:

camera-assets

Naming scheme:

{cameraId}/{timestamp}-{hash12}.ext

Access:

signed URLs

20 min expiry

server-generated

FTP gateway and SMTP gateway hold no persistent wildlife data.
Supabase is the single source of truth.

Multi-Tenant Structure (updated)

Venaris now distinguishes between:

organizations
├── organization_members
├── reviers
└── cameras

Important architectural clarification (NEW)

organizations and reviers are intentionally not merged.

Reason:

organization = administrative / commercial / tenant boundary

revier = operational wildlife management area

A camera belongs administratively to an organization
and may optionally be assigned to a revier.

This replaces the earlier simplified model where cameras were treated as belonging only via revier.

This enables:

demo tenant

internal test tenant

future live customer tenant

clean customer separation

billing / ownership / role boundary on organization layer

operational field logic on revier layer

Example real-world mapping:

Organization: B&T GbR

Revier: Heubachwiesen

Members: Bruno, Torsten, Agnes, Miriam, Laurent

Cameras: Reolink, Zeiss, X-View

Database Core Tables

organizations

Tenant / administrative / commercial layer.

Fields:

id

name

slug

kind

status

owner_user_id

created_at

notes

Current role:

tenant boundary

membership scope

future billing / payment scope

organization_members

Maps users to organizations.

Fields:

organization_id

user_id

role

created_at

Current role values:

owner

admin

member

viewer

Current MVP permission direction:

owner/admin may create cameras

member may operate but not structurally provision

viewer is read-only

reviers

Wildlife management areas.

Fields:

id

name

area_ha

region

country

organization_id

created_at

boundary_geojson

notes

Current role:

operational / field unit

may carry boundaries, habitat, regional metadata

cameras

Wildlife sensors.

Current fields include:

id

organization_id

revier_id

name

technical_name

location_name

import_method

ingest_token

brand

model

latitude

longitude

direction_deg

is_active

installed_at

notes

created_at

last_seen_at

Important architecture decisions (NEW):

cameras.id remains primary key

cameras.technical_name is the canonical provisioning key

organization_id is the administrative owner link

revier_id is the optional operational assignment

import_method and ingest_token remain temporarily as legacy compatibility fields

camera_ingest_configs

Technical ingest routing configuration per camera.

Purpose:

Decouple ingest routing from .env and worker hardcoding.

Current fields:

id

camera_id

method

is_active

smtp_alias

ftp_username

ftp_inbox_path

manual_label

ingest_token

vendor

external_key

notes

created_at

This is now the routing truth for ingest provisioning.

Important architectural update (NEW)

camera_ingest_configs is the new routing truth.

Legacy compatibility remains temporarily in cameras:

cameras.import_method

cameras.ingest_token

These fields stay for compatibility until the rest of the application / workers / pages are fully migrated.

organization_camera_sequences (NEW)

Technical sequence state per organization.

Purpose:

Allocate next camera number atomically per organization.

Fields:

organization_id

last_sequence

updated_at

This enables race-safe technical name generation.

Canonical Technical Name (NEW)

Canonical provisioning key:

technical_name

Format:

<organization-slug>-cam-<4-digit-sequence>

Examples:

demo-cam-0001

test-cam-0005

heubachwiesen-cam-0001

Sequence logic:

per organization

increments monotonically

numbers are never reused

preferred camera lifecycle is deactivate, not delete

Current intended numeric scope:

0001–9999

assets

Captured observations.

Fields:

id

camera_id

captured_at

storage_path

file_hash

status

created_at

relevant

ingest_batch_id

attempts

processing_started_at

processed_at

last_error

worker_id

empty

empty_confidence

detections

AI detection results.

Fields:

id

asset_id

label

species

count

score

meta

created_at

Important implementation truth:

label = animal | human | vehicle

species populated only for animal classification

meta.bbox stores bounding box

meta.md_idx identifies one MegaDetector object candidate inside the image

events

Aggregated wildlife activity units.

Fields:

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

Join table between events and assets.

Fields:

event_id

asset_id

ingest_batches

Logical delivery groups.

Fields:

id

camera_id

received_at

source

file_count

status

error_summary

meta

species_weights

Config table for configurable wildmanagement-oriented relevance scoring.

Fields:

species

weight

active

notes

updated_at

Provisioning Function (NEW)

Venaris now includes a database-driven camera provisioning function:

create_camera_with_provisioning()

Responsibilities:

validate organization

validate optional revier assignment

allocate next organization sequence

build technical_name

generate secure ingest token

create camera row

create active ingest config row

return provisioning result

Important token decision:

Provisioning generates a fresh secure token.

The same token is written into both:

cameras.ingest_token

camera_ingest_configs.ingest_token

Reason:

keep the current system backward-compatible while shifting routing truth into camera_ingest_configs

Vendor validation is now enforced against a controlled list.

3️⃣ Intelligence Layer

The Intelligence Layer converts images → ecological signals.

Detection Pipeline

asset
↓
MegaDetector
↓
empty filtering
↓
species classifier
↓
detections
↓
asset wildlife summary
↓
event clustering
↓
event wildlife summary
↓
event ranking / intelligence

MegaDetector

Purpose

Detect:

animal

human

vehicle

Model

md_v1000.0.0-redwood.pt

Output

label

score

bbox

Important:

Each detected wildlife object receives meta.md_idx, which is now the canonical counting key in MVP logic.

Empty Filter

System decision derived from MegaDetector.

Rule:

best animal score < threshold → empty

Environment:

MD_ANIMAL_THRESHOLD=0.2

Asset updated with:

empty

empty_confidence

relevant

Species Classification

Model

CLIP ViT-B/32

Runner

species/runner.py

Process

MegaDetector bbox
↓
image crop
↓
CLIP zero-shot classification
↓
taxonomy_species_v1

Taxonomy v1

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

Classification threshold

SPECIES_SIM_THRESHOLD=0.22

Bounding box padding

SPECIES_BBOX_PAD=0.10

Validated examples:

fox

badger

wolf

wild_boar

Observed ambiguity:

red_deer vs roe_deer can remain difficult under IR night imagery.

Wildlife-Only Intelligence Scope

For wildlife intelligence, only these detections are relevant:

label = 'animal'

species

Not relevant for wildlife analytics:

human

vehicle

This applies to:

event relevance

event top species

species overview

hourly activity

future wild pressure

future status logic

Counting Model v1

This is a foundational intelligence decision.

Venaris distinguishes between:

A. Detection Layer

Technical model output.

A detection row is not yet biological truth.

B. Asset Observation Layer

An asset is the smallest biologically interpretable unit.

Current MVP rule:

asset species count = count(distinct meta.md_idx) per asset + species

This means:

one image with 3 roe deer → count = 3

one image with 1 fox → count = 1

C. Event Observation Layer

An event is a time-clustered sequence of assets from the same camera.

Current MVP rule:

event species count = MAX(asset_species_count) per species within an event

This prevents blind overcounting across repeated frames.

D. Activity Layer

Activity is treated separately from count.

This means:

repeated frames may increase activity signal

but not necessarily wildlife count

This distinction is critical for future:

wild pressure

activity histograms

management insights

New Wildlife Summary Views

asset_species_summary

Purpose:

Summarize wildlife observations per asset.

Current fields:

asset_id

species

animal_count

best_score

event_species_summary

Purpose:

Summarize wildlife observations per event.

Current fields:

event_id

species

event_species_count

best_score

These two views are now the core bridge between raw detections and visible intelligence.

Events

Events represent aggregated wildlife activity.

Current event clustering logic:

same camera

time-window based

most recent event considered

asset linked into event if still inside configured window

Current implementation:

upsert_event_for_asset(...)

Current event aggregation logic:

update_event_aggregation(...)

Important update:

Event aggregation is no longer based on raw detection row counts.
It is based on wildlife summaries plus species weights.

Current output semantics:

top_species = strongest wildlife species signal in event

top_count = event species count from summary logic

relevance_score = wildlife-only, species-weighted, asset-aware signal

Future options:

species-aware clustering

movement-aware clustering

cross-camera correlation

richer species mix in event cards

But not required for MVP 1.0.

4️⃣ Monitoring Layer

Venaris monitors sensor reliability and ingest health.

camera_health_rules

Defines thresholds per import method.

camera_health (view)

States:

online

stale

offline

unknown

Calculated from:

last_seen_at

Ingest Monitoring

Tracks:

file_count

skipped_duplicates

source

error_summary

Sources:

ftp

smtp

manual

Important legacy note

camera_health currently still depends on cameras.import_method.

This is acceptable for MVP, but longer-term monitoring logic should derive from the active ingest configuration rather than legacy import_method fields.

5️⃣ Application Layer

Home (/)

Currently still a more technical overview / earlier operational entry point.

Long-term role:

compact operational dashboard.

Intelligence (/intelligence)

Current purpose:

Seed-based wildlife intelligence dashboard v1.

Current modules:

Species Overview

Where & When

Activity

Current scope:

Seed cameras only.

This route is now the primary visible intelligence surface.

Import (/import)

Human ingestion interface.

Features:

camera selection

multi-file upload

ZIP import

drag & drop

batch feedback

Cameras (/cameras)

Camera overview.

Features:

health status

token management

asset preview

ingest monitoring

Future role:

tenant-aware camera setup

technical routing visibility

provisioning support

Cameras New (/cameras/new) (NEW)

Current purpose:

real product camera setup flow

Capabilities:

protected route (authenticated)

organization-context camera creation

optional revier assignment

method selection

vendor selection

optional location metadata

optional position / direction metadata

direct provisioning result in UI

Provisioning result currently exposes:

camera id

technical name

ingest token

SMTP alias or FTP routing values or manual label

This is the first true product-facing setup flow in the application.

Ingest (/ingest)

Technical monitoring.

Displays:

ingest batches

source transparency

errors

Events (/events)

Wildlife activity feed.

Includes:

relevance-ranked event view

top species

top count

camera context

event detail

asset grid

relevance toggle

Authentication Layer (NEW)

Supabase Auth email/password login is now part of the MVP architecture.

Current routes / components:

/login

proxy.ts

server-side auth helper

browser-side auth helper

logout API route

logout integrated into main navigation

Protected route model:

unauthenticated user → redirect to /login

authenticated user → protected product area

MVP role decision:

camera creation allowed only for owner/admin

Current organization context decision:

for MVP, the first / only membership is used as active organization context

full org switcher remains future work

This means the Application Layer is now no longer only “server routes + dashboards.”
It now contains the first real authenticated SaaS product mechanics.

🧠 Relevance Model

Current

assets.relevant = system relevance signal from empty filtering

events.relevance_score = wildlife relevance ranking

species weights configurable via species_weights

Current architectural direction

Keep MVP simple:

one clear relevant concept on asset level

one ranked relevance score on event level

Possible future extension:

relevant_user override separation

user vs system relevance split

species-specific relevance models

But not required for MVP 1.0.

🌱 Seed Intelligence Dataset

A seed dataset is now part of the architecture for dashboard testing.

Script:

scripts/seed-intelligence.mjs

Purpose:

simulate realistic wildlife observations

build dashboard test data without running AI workers

validate visible intelligence logic at meaningful scale

Current seed scope:

1 seed revier

5 seed cameras

~1300 seed events

realistic species distributions

realistic time-of-day patterns

multi-animal assets

habitat-specific camera profiles

Important:

Seed writes directly into DB and intentionally bypasses:

image storage previews

worker runtime

MegaDetector

CLIP

This is a dashboard/intelligence testing tool, not an inference tool.

🔒 Security Model

RLS enabled

no client-side direct table access

server routes only

service role server-side only

token-based ingest authentication

Gateway Security

SSH key login only

root login disabled

chroot FTP users

restricted passive port range

firewall enforced

SMTP Gateway Security

direct MX routing for cams.venaris.io

queue-based processing

camera resolution only via known DB aliases

invalid aliases routed to Maildir invalid state

no mailbox-per-camera dependency

MVP Auth / Multitenancy Security Model (NEW)

Supabase Auth provides user identity.

organization_members defines tenant membership.

MVP roles:

owner

admin

member

viewer

Current authorization decision:

camera creation only for owner/admin

Important implementation split:

session-bound auth checks use SSR auth client

admin / DB / provisioning operations use service role server client

This separation is intentional and must remain clear.

📦 Runtime Documentation

The Hetzner worker runtime is archived in the repository under:

infrastructure/hetzner-worker/

This includes:

FTP worker

Maildir bridge

AI runners

systemd service definitions

masked environment templates

This ensures the non-Vercel runtime layer is documented and reproducible.

🚀 Strategic Direction

Venaris is evolving from a:

camera ingestion system

into a:

wildlife intelligence platform

Current phase:

multi-channel ingest

AI detection pipeline

species classification

event clustering

event ranking

asset-level wildlife summary

event-level wildlife summary

visible intelligence dashboard

seed-based dashboard validation

database-driven camera provisioning

authenticated multi-tenant product foundation

Next phase:

active organization context UX

tenant-aware camera / event / import filtering

role enforcement across relevant API routes

revier setup UI

wild pressure indicator

dashboard consolidation

species-aware insights

camera-level wildlife intelligence

field validation

later predictive wildlife modeling

Honest Architecture Maturity Status

Green:

Ingestion

AI pipeline

Provisioning base

Camera object model

Auth foundation

Navigation foundation

Yellow:

true multi-tenant UI consolidation

active organization context UX

role enforcement across all relevant routes

tenant-aware camera / event / import filtering

revier setup UI

Still open:

Wilddruck indicator

dashboard consolidation

go-live legal / branding / payment preparation

Summary Architecture Statement

Venaris now operates on this core intelligence chain:

Images → Assets → Detections → Asset Wildlife Summary → Event Wildlife Summary → Ranked Events → Visible Intelligence

And on this core infrastructure chain for SMTP ingest:

Camera → SMTP → Postfix → Maildir Queue → maildir-bridge → /api/ingest → Assets

And on this new core product setup chain:

User → Login → Active Organization Context → Create Camera → technical_name + ingest_token + routing config → operational ingest-ready camera

Together these now form the architectural backbone for MVP 1.0.



---

## 2026-03-12 Architecture Extension – Secure FTP Provisioning + Retention + Manual Import Stabilization

This section extends the architecture as of 2026-03-12.
It is additive and does not invalidate earlier sections.

### Secure FTP Provisioning Architecture (NEW)

Venaris now supports fully automated FTP camera provisioning.

The earlier FTP gateway architecture has evolved from:

Camera
→ FTP upload
→ pre-created Linux user / static folder
→ FTP worker
→ /api/ingest

to:

User
→ /cameras/new
→ POST /api/cameras/create
→ create_camera_with_provisioning()
→ HTTPS call to Hetzner FTP Provisioner
→ Linux user + password + directory lifecycle creation
→ provisioning_status = ready
→ camera configured by user
→ FTP upload
→ ftpdir-bridge
→ /api/ingest

This means FTP onboarding is now part of the real product flow,
not an infrastructure-only admin task.

### FTP Provisioner Runtime (NEW)

A dedicated Hetzner provisioning runtime now exists.

Service:

venaris-ftp-provisioner.service

Worker:

/opt/venaris-worker/ftp-provisioner.mjs

Responsibilities:

- create Linux FTP user
- assign ftp-ingest group
- set camera-specific FTP password
- create full directory lifecycle tree
- enforce ownership and permissions
- support password reset / disable / deprovision actions

This runtime is intentionally separate from ingest workers.

Reason:

Provisioning is an administrative infrastructure action,
not an ingestion action.

### Provisioner Security Boundary (NEW)

The FTP Provisioner is not publicly exposed on its raw worker port anymore.

Internal runtime bind:

127.0.0.1:8787

Public endpoint:

https://provisioner.venaris.io

Protection model:

- nginx reverse proxy
- HTTPS via Let's Encrypt
- bearer token authorization
- UFW blocks raw port 8787 externally

This creates a proper separation between:

public TLS ingress
and
internal privileged provisioning runtime.

### FTP Password Policy (UPDATED)

Real-world camera validation showed that long generated passwords are not practical for many LTE wildlife cameras.

Current MVP decision:

FTP password length is reduced to 8 characters.

Password properties:

- random
- camera-typable
- shown once in UI
- not stored for later retrieval in product UI

This is an explicit usability-over-max-entropy MVP decision.

### FTP Directory Lifecycle Model (NEW)

The FTP gateway directory model now includes explicit lifecycle folders.

Per camera:

/data/ftp-ingest/<technical_name>/
   inbox/
   processed/
   invalid/
   error/

Semantics:

inbox
=
new uploaded files waiting for ingest

processed
=
successful ingest archive (retention managed)

invalid
=
non-image or structurally invalid files

error
=
ingest failure / retry investigation bucket

This moves FTP closer to the same operational lifecycle clarity already used by Maildir SMTP ingest.

### FTP Worker Architecture Update (NEW)

The old FTP worker architecture was based on a hardcoded map from ftp-user to ingest token.

That model is now deprecated.

Previous model:

.env
→ static ftp user
→ static ingest token
→ ftp-worker.mjs

Current model:

camera_ingest_configs
→ method='ftp'
→ is_active=true
→ provisioning_status='ready'
→ ftp_username / ftp_inbox_path / ingest_token
→ ftpdir-bridge.mjs

This means FTP ingest routing is now fully database-driven.

### FTP Worker Service (NEW)

Current service:

venaris-ftpdir-bridge.service

Worker:

/opt/venaris-worker/ftpdir-bridge.mjs

Repository copy:

infrastructure/hetzner-worker/ftpdir-bridge.mjs

Responsibilities:

- load active FTP configs from DB
- scan only ready FTP cameras
- ensure file stability before ingest
- compute SHA256
- send multipart request to /api/ingest
- move files into processed / invalid / error
- run retention cleanup

This aligns FTP ingestion operationally with the Maildir SMTP model.

### Retention Lifecycle (NEW)

Both SMTP and FTP workers now include retention cleanup.

Reason:

Hetzner is transport/runtime infrastructure, not long-term archive.

Current retention intent:

processed
→ short operational window only

invalid / error
→ longer debugging window, but still temporary

Architectural principle:

Supabase remains the single persistent source of truth.
Hetzner remains replaceable transport/runtime infrastructure.

### SMTP Worker Architecture Update (NEW)

Maildir SMTP worker now matches the quality level of the new FTP worker more closely.

Enhancements now included:

- Vercel protection bypass support
- better redirect handling
- retention cleanup
- stricter config lookup discipline
- readiness gating via provisioning_status

This reduces the gap between SMTP and FTP operational maturity.

### Provisioning Status as Runtime Gate (NEW)

camera_ingest_configs.provisioning_status is now an important architectural control field.

Meaning:

pending
=
camera exists in product model, but runtime setup not yet completed

ready
=
camera is operational and may be processed by workers / UI flows

failed
=
provisioning failed, runtime not ready

For MVP:

- FTP cameras become ready only after successful Hetzner provisioning
- SMTP cameras may become ready after alias/config activation
- Manual cameras are now marked ready immediately because they require no infrastructure-side provisioning

This field is now part of the real runtime architecture,
not just metadata.

### Manual Import Architecture Update (NEW)

Manual import is no longer just a generic upload utility.

It is now tied to the provisioning model.

Current rules:

- manual cameras get manual_label derived from technical_name
- manual cameras are immediately provisioning_status='ready'
- Import UI lists only ready manual cameras
- upload route still requires cameraId
- metadata.source='manual' enforced server-side

This means manual import now behaves like a first-class ingest channel,
not as a separate dev-only workaround.

### Camera Create Flow Architecture Update (NEW)

The /cameras/new product flow now has method-specific operational outcomes.

For FTP:

- creates DB object
- provisions Hetzner runtime
- returns host / port / username / password / path / passive mode

For SMTP:

- creates DB object
- returns smtp alias

For Manual:

- creates DB object
- returns manual label
- camera is immediately ready for /import

This means the camera setup flow is no longer only a metadata entry screen.
It is now a real infrastructure-aware product provisioning surface.

### UI Architecture Consequence (NEW)

The product now contains a method-dependent setup result layer.

The provisioning result UI is responsible for showing:

FTP:
- server
- port
- username
- password
- path
- passive mode
- one-time password warning

SMTP:
- smtp alias

Manual:
- manual label / import readiness

This is the first place where the product visibly exposes different ingest channel setup semantics.

### TLS Boundary Model (NEW)

Hetzner-hosted subdomains now intentionally terminate TLS on Hetzner itself.

Current model:

venaris.io
→ Vercel TLS

provisioner.venaris.io
→ Hetzner TLS

cams.venaris.io
→ Hetzner TLS

This follows the architectural rule:

TLS terminates where the service actually runs.

This avoids mixing Vercel-facing and Hetzner-facing security boundaries.

### Runtime Topology Update (NEW)

Current intended active Hetzner runtime services:

venaris-detection-worker.service
venaris-maildir-bridge.service
venaris-ftpdir-bridge.service
venaris-ftp-provisioner.service

Deprecated / retired:

venaris-smtp-bridge.service
venaris-ftp-worker.service

This reflects the migration from:
hardcoded bridge utilities
to
database-driven product runtime services.

### Architecture Maturity Reassessment (UPDATED 2026-03-12)

Green:

- unified ingest contract
- direct SMTP ingest
- database-driven camera provisioning
- secure FTP provisioning
- manual import as first-class ingest channel
- worker/runtime retention lifecycle
- TLS hardened Hetzner service boundary
- real end-to-end provisioning validation with physical camera

Yellow:

- deprovision / disable UX
- camera setup UX polish
- richer organization context handling
- monitoring convergence from legacy import_method to active ingest config
- stronger role enforcement in all provisioning-relevant routes

Still open:

- Wilddruck indicator
- richer home dashboard consolidation
- billing / legal / go-live layer
- long-term worker parallelization strategy at very large camera counts

### Updated Summary Architecture Statement

Venaris now operates on this product + infrastructure chain:

User
→ Login
→ Active Organization Context
→ Create Camera
→ technical_name + ingest_token + routing config
→ optional infrastructure provisioning
→ operational ingest-ready camera

And on this FTP provisioning chain:

User
→ /cameras/new
→ /api/cameras/create
→ create_camera_with_provisioning()
→ HTTPS Hetzner Provisioner
→ Linux FTP user + folders + password
→ camera configured in field
→ ftpdir-bridge
→ /api/ingest
→ Assets

And on this SMTP chain:

Camera
→ SMTP
→ Postfix
→ Maildir Queue
→ maildir-bridge
→ /api/ingest
→ Assets

And on this manual chain:

User
→ /import
→ ready manual camera selection
→ /api/upload
→ ingestCore
→ Assets

Together these now form the current MVP 1.0 backbone.
