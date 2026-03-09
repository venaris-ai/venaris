Venaris – Current State

Last updated: 2026-03-09 (Visible Intelligence Layer v1 + Seed Dashboard Data)

✅ System Status
Ingestion Layer

Unified ingest pipeline (FTP + SMTP + Manual) via shared ingestCore
SMTP/IMAP bridge stable (Reolink live)
FTP Gateway fully operational (X-View via Hetzner)
Worker → Production API (Vercel) confirmed
Vercel Deployment Protection bypass implemented
SHA256 per-camera dedup stable
File deletion after ingest confirmed
Vendor-aware SMTP processing implemented
Inline image handling (CID + attachment) implemented

Monitoring

Ingest batch monitoring implemented
Camera health engine (rule-based per import_method) implemented
Navigation updated (Import, Intelligence added)

Import

Import Adapter (ZIP + multi-file) implemented
Import Center UI implemented

Security

Security Advisor clean
(0 errors / 0 warnings / 0 suggestions)

🧠 AI Pipeline

Venaris runs a full computer vision pipeline.

Camera
↓
Ingest
↓
MegaDetector
(animal / human / vehicle)
↓
Empty Filter
↓
Species Classifier (CLIP)
↓
detections table
↓
Event clustering
↓
Visible Intelligence aggregation

MegaDetector Integration (v1)

Model:
md_v1000.0.0-redwood.pt

Runs on:
/opt/venaris-worker/detection-worker/md/runner.py

Output normalized to:

label → animal | human | vehicle

score → MD confidence

bbox → relative [x,y,w,h]

Detection rows inserted into:
detections

Meta stored:

meta.bbox

meta.model = "megadetector_v1000"

meta.md_idx

Empty Filter (System Decision)

Empty classification derived from MegaDetector:

best_animal_score < MD_ANIMAL_THRESHOLD → empty=true

Environment:

MD_ANIMAL_THRESHOLD=0.2

Assets updated with:

assets.empty

assets.empty_confidence

assets.relevant

Rules:

animal present → relevant=true

no animals → relevant=false

Species Classifier (CLIP)

Classifier:
CLIP ViT-B/32
openai/clip-vit-base-patch32

Runner:
/opt/venaris-worker/detection-worker/species/runner.py

Process:

MegaDetector animal bbox
↓
crop image region
↓
CLIP zero-shot classification
↓
taxonomy_species_v1

Taxonomy v1 (ENUM)

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

Decision:

species = other if sim < SPECIES_SIM_THRESHOLD

Environment:

SPECIES_SIM_THRESHOLD=0.22

SPECIES_BBOX_PAD=0.10

Result stored by updating the MegaDetector detection row:

detections.species

meta.species.sim

meta.species.model

Important implementation truth:

One wildlife object is tracked by meta.md_idx.
This is now the canonical basis for wildlife counting in MVP logic.

🧪 AI Pipeline Validation

The full AI pipeline has been validated end-to-end using controlled test images.

Validated species:

fox

badger

wolf

wild_boar

Observed examples:

fox → 0.973

badger → 0.963

wolf → 0.960

wild_boar → 0.969

Observation:

A night IR image of a red deer was classified as roe_deer.
This appears to be a natural ambiguity within deer classes under IR conditions
and not a system malfunction.

Conclusion:

The MegaDetector + CLIP pipeline is functioning correctly.

🧭 Visible Intelligence Layer (new)

Venaris now includes a first operational Visible Intelligence Layer.

Wildlife-Only Rule

For wildlife intelligence, only these detections are relevant:

label = 'animal'

species

Not part of wildlife intelligence:

human

vehicle

This rule now applies to:

event relevance

top species in events

intelligence dashboard queries

activity interpretation

seed dashboard data

Counting Model v1

Venaris now distinguishes between:

detection layer

asset observation layer

event observation layer

activity layer

Asset-Level Logic

An asset is the smallest biologically interpretable observation unit.

Current MVP count logic:

asset_species_count = count(distinct meta.md_idx) per asset + species

This means:

one image with 3 roe deer → count = 3

one image with 1 fox → count = 1

Event-Level Logic

An event is a time-clustered sequence of assets from the same camera.

Current MVP event count logic:

event_species_count = MAX(asset_species_count) per species within the event

This prevents blind overcounting across repeated frames.

Interpretation:

3 images of the same roe deer in one event should not automatically count as 3 animals

1 image with 3 roe deer should still count as 3

Configurable Species Weights

New table introduced:

species_weights

Purpose:

Configurable wildmanagement-oriented weighting of species for event relevance scoring.

Current weights are seeded and editable in DB.
Weights are no longer hardcoded in application code.

New Views
asset_species_summary

Aggregates wildlife observations per asset:

asset_id

species

animal_count

best_score

event_species_summary

Aggregates wildlife observations per event:

event_id

species

event_species_count

best_score

This is now the basis for event-level wildlife interpretation.

Event Aggregation Refactor

update_event_aggregation() no longer works from raw detection row counts.

It now uses:

event_species_summary

species_weights

Outputs:

events.top_label

events.top_species

events.top_count

events.relevance_score

Current behavior:

top_species = strongest species signal in event

top_count = event-level count using MAX(asset_species_count)

relevance_score = wildlife-only, species-weighted, asset-aware

Event Feed Upgrade

/events now shows:

prioritized event ranking by relevance

top species

top count

asset count

camera label

score

This is the first visible operational intelligence feed in the UI.

Intelligence Dashboard v1

New route:

/intelligence

Current scope:

seed cameras only

dashboard test scope for wildlife intelligence

Current modules:

Species Overview

Where & When

Activity

Current capabilities:

species overview by event observations

observed animals per species

average animals per event

top camera by species

where & when hint:

best camera + time-window combination

top cameras

top time windows

overall wildlife activity by hour

camera activity table

latest wildlife events

Periods currently supported:

30d

90d

365d

Technical note:

Large-period intelligence loading now uses chunked fetching of event_species_summary to avoid request-size issues.

🌱 Seed Dashboard Dataset (new)

A new intelligence seed script exists to simulate realistic wildlife data for dashboard and statistics testing.

Script:
scripts/seed-intelligence.mjs

Seed Scope

The seed writes directly to DB and does not use:

worker runtime

image download

MegaDetector

CLIP

Supabase Storage previews

This is intentional.
The seed is for intelligence/dashboard testing, not for inference testing.

Seed Dataset

Current seed includes:

1 seed revier

5 seed cameras

~1300 seed events

~3500 assets total in DB after run

~6000 detections total in DB after run

Current seed cameras:

Seed Camera 1 – Kirrung Wald

Seed Camera 2 – Waldkante Wechsel

Seed Camera 3 – Feldrand

Seed Camera 4 – Dichter Wald

Seed Camera 5 – Offenfläche / Störung

Seed Logic

Seed follows:

taxonomy restricted to ENUM values

DJV-inspired quantity ratios, camera-normalized

species-specific time windows

camera-specific habitat profiles

event-based data generation

per-asset multi-animal counts via md_idx

Seed Result Quality

Current validation indicates:

plausible species distributions

plausible camera-specific wildlife profiles

plausible time-of-day distributions

plausible multi-animal event counts

usable dashboard test data for:

species overview

where & when

activity

1️⃣ Infrastructure
Repository

GitHub:
venaris-ai/venaris

Branch:
main

Secrets:
never committed

Daily commits active.

Tech Stack

Next.js (App Router)

Supabase (Postgres + Storage)

Tailwind CSS

Node.js workers

JSZip (Import Adapter)

Python (MegaDetector + CLIP)

Servers

Vercel (API + frontend)

Hetzner VPS (FTP gateway)

Hetzner VPS (AI worker)

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

Permission model:

/data → 755 root:root

/data/ftp-ingest → 755 root:root

/data/ftp-ingest/xview01 → 2770 xview01:ftp-ingest

/data/.../inbox → 2770 xview01:ftp-ingest

Key elements:

shared group: ftp-ingest

setgid enabled

vsftpd: local_umask=007

files created as 660

Worker can delete successfully.

Confirmed:
File delete after ingest works.

3️⃣ FTP Worker

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

send multipart FormData

delete file after success

Metadata:

metadata.source="ftp"

4️⃣ SMTP Bridge

Service:
venaris-smtp-bridge

Environment:
/opt/venaris-worker/.env.smtp

Behavior:

IMAP UNSEEN

UID dedup

vendor-aware parsing

inline image support

Metadata:

metadata.source="smtp"

Status:
Stable

5️⃣ Detection Worker (AI)

Service:
venaris-detection-worker

Location:
/opt/venaris-worker/detection-worker

Pipeline:

download asset
↓
MegaDetector
↓
insert detections
↓
species classifier (if animal)
↓
update detections
↓
empty decision
↓
event clustering

Average runtime:

MegaDetector ≈ 3–4s

CLIP species ≈ 2–3s

Total ≈ 5–6s / image

Important confirmed behavior from real worker code:

worker inserts detections

worker updates species on existing rows

worker sets assets.empty, assets.relevant

worker then calls upsert_event_for_asset(...)

event aggregation remains DB-centric

6️⃣ Import Adapter

Route:
POST /api/upload

Capabilities:

multi-file upload

ZIP upload

Metadata:

metadata.source="manual"

Guards:

MAX_FILES

MAX_ZIP_BYTES

All files forwarded to:
ingestCore

7️⃣ Import Center (UI)

Route:
/import

Capabilities:

camera selection

multi-file upload

ZIP support

drag & drop

batch result feedback

Navigation:
Home · Intelligence · Events · Cameras · Import · Ingest

8️⃣ Storage

Bucket:
camera-assets

Naming scheme:

{cameraId}/{timestamp}-{hash12}.ext

Signed URLs:

20 min expiry

server generated

Supabase is the only persistent storage.
Hetzner holds no wildlife data.

Seed dataset intentionally does not create real storage objects.

9️⃣ Database (Active Tables)

reviers

cameras

assets

detections

events

event_assets

ingest_batches

camera_health_rules

species_weights

🔟 Views
camera_health

Rule-based camera monitoring.

States:

online

stale

offline

unknown

event_feed

Used by:
/events

Security:
security_invoker enabled

asset_species_summary

Wildlife summary per asset.

event_species_summary

Wildlife summary per event.

1️⃣1️⃣ API Routes

POST /api/upload

POST /api/ingest

GET /api/assets

GET /api/asset-url

POST /api/asset-relevant

GET /api/ingest-batches

GET /api/camera-health

GET /api/camera-token

POST /api/camera-token

GET /api/intelligence/species-activity

GET /api/intelligence/activity-by-hour

1️⃣2️⃣ Architecture Maturity

Venaris now includes:

multi-source ingestion

vendor-aware SMTP bridge

FTP gateway

AI detection worker

MegaDetector integration

automatic empty filtering

species classifier

taxonomy ENUM

event clustering

event relevance scoring

wildlife-only intelligence filtering

configurable species weights

asset-level wildlife summary

event-level wildlife summary

ZIP import adapter

batch monitoring

camera health engine

secure RLS API

signed URL previews

intelligence dashboard v1

realistic seed dataset for dashboard testing

Infrastructure is AI-capable and production-structurable.
The system now also has a first usable wildlife-intelligence layer.

📦 Infrastructure Archiving

The Hetzner worker runtime has been archived in the repository under:

infrastructure/hetzner-worker/

Included components:

ftp-worker.mjs

smtp-bridge.mjs

MegaDetector runner

CLIP species runner

systemd service definitions

masked worker environment files

Purpose:

Ensure the full ingestion and AI pipeline runtime is reproducible and documented in Git.

🔜 Immediate Next Step

Continue Phase 3 – Visible Intelligence Layer and start Phase 4 transition.

Planned next product-facing steps:

refine intelligence dashboard blocks

add first Wilddruck indicator

improve “where & when” logic incrementally

prepare dashboard/home integration

keep seed scope available for fast UI/statistics validation

Immediate working principle:

Use seed cameras for intelligence/dashboard logic until real field data volume is sufficient.

🔒 Operational Notes

SMTP:

process UNSEEN only

FTP:

users isolated via chroot

Workers:

delete files only after successful ingest

Deduplication:

per-camera SHA256

Source of truth:

Supabase

Hetzner:

transport layer only

Workers require:

Vercel bypass token if deployment protection active

Rotate token if leaked.

Intelligence-specific notes

Wildlife intelligence excludes human and vehicle

detections.count is currently not used as biological truth

counting logic currently uses distinct meta.md_idx

event count logic currently uses MAX(asset_species_count)

seed assets intentionally have no real previews

dashboard testing currently relies on seed cameras only