Venaris – Architecture (MVP)

Last updated: 2026-03-10 (Direct SMTP Ingest + Maildir Queue + Organizations Layer)

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
→ /data/ftp-ingest/<user>/inbox
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
   └── xview01/
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

Multi-Tenant Structure (new)

Venaris now distinguishes between:

organizations
↓
reviers
↓
cameras
organizations

Represents the tenant/customer boundary.

organization_members

Maps authenticated users into organizations.

reviers

Belong to one organization.

cameras

Belong to one revier.

This enables:

demo tenant

internal test tenant

future live customer tenant

clean customer separation

Database Core Tables
organizations

Tenant/customer layer.

Fields:

id

name

slug

kind

status

owner_user_id

created_at

notes

organization_members

Maps users to organizations.

Fields:

organization_id

user_id

role

created_at

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

cameras

Wildlife sensors.

Fields:

id

revier_id

name

location_name

import_method

ingest_token

created_at

last_seen_at

Additional product-facing fields may evolve here over time.

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

This is the key bridge between customer-facing camera objects and infrastructure-level routing.

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

Next phase:

wild pressure indicator

dashboard consolidation

species-aware insights

camera-level wildlife intelligence

field validation

later predictive wildlife modeling

Summary Architecture Statement

Venaris now operates on this core intelligence chain:

Images → Assets → Detections → Asset Wildlife Summary → Event Wildlife Summary → Ranked Events → Visible Intelligence

And on this core infrastructure chain for SMTP ingest:

Camera → SMTP → Postfix → Maildir Queue → maildir-bridge → /api/ingest → Assets

Together these now form the architectural backbone for MVP 1.0.