Venaris – Architecture (MVP)

Last updated: 2026-03-06 (AI Detection Pipeline Validated)

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

Images → Assets → Detections → Events → Patterns → Insights

Current MVP stage:

Images → Assets → AI Detections → Events

🏗 System Overview

Venaris consists of five logical layers:

Ingestion Layer  
Storage Layer  
Intelligence Layer  
Monitoring Layer  
Application Layer

System State (MVP Status)

The Ingestion Layer is production-stable for:

SMTP (Reolink)  
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

Ingest → Assets → MegaDetector → Species Classification → Events

---

1️⃣ Ingestion Layer

Purpose

Receive wildlife sensor data from multiple import methods
and normalize them into a unified ingest contract.

Unified Ingest Contract

Primary endpoint:

POST /api/ingest

Requirements:

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

Capabilities:

multi-file upload  
ZIP upload  
JSZip auto-extraction  
metadata.source="manual"

Guard rails:

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
triggers event clustering RPC  
asset enters AI detection queue

Deduplication is per-camera and idempotent.

SMTP Ingestion (Vendor-Aware Bridge)

Architecture:

Mailbox (IMAP)  
→ smtp-bridge.mjs  
→ POST /api/ingest

Features:

attachment extraction  
inline image support (CID)  
vendor flag (reolink)  
UID deduplication  
UNSEEN-only processing

Poll interval:

60 seconds

FTP Ingestion (Gateway Architecture)

Architecture:

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

Permissions:

Owner: ftp user  
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

---

2️⃣ Storage Layer

Supabase Storage bucket:

camera-assets

Naming scheme:

{cameraId}/{timestamp}-{hash12}.ext

Access:

signed URLs  
20 min expiry  
server-generated

FTP gateway holds no persistent data.  
Supabase is the single source of truth.

Database Core Tables

reviers

Wildlife management areas.

cameras

Wildlife sensors.

Fields:

id  
revier_id  
name  
location_name  
import_method  
ingest_token  
last_seen_at  
created_at

assets

Captured observations.

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
empty  
empty_confidence

detections

AI detection results.

Fields:

asset_id  
label          (animal | human | vehicle)  
species        (taxonomy_species_v1 enum)  
score          (MegaDetector confidence)  
species_sim    (CLIP similarity)  
count  
meta

Bounding boxes stored in:

meta.bbox

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

---

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
detections table  
↓  
event clustering

MegaDetector

Purpose:

Detect animal / human / vehicle.

Model:

md_v1000.0.0-redwood.pt

Output:

label  
score  
bbox

Empty Filter

System decision derived from MegaDetector.

Rule:

best animal score < threshold  
→ empty

Environment:

MD_ANIMAL_THRESHOLD=0.2

Asset updated with:

empty  
empty_confidence  
relevant

Species Classification

Model:

CLIP ViT-B/32

Runner:

species/runner.py

Process:

MegaDetector bbox  
↓  
image crop  
↓  
CLIP zero-shot classification  
↓  
taxonomy_species_v1

Taxonomy v1:

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

Classification threshold:

SPECIES_SIM_THRESHOLD=0.22

Bounding box padding:

SPECIES_BBOX_PAD=0.10

Validated examples:

fox  
badger  
wolf  
wild_boar

Observed ambiguity:

red_deer vs roe_deer can remain difficult under IR night imagery.

Events

Events represent aggregated wildlife activity.

Logic:

Assets within time window  
→ grouped  
→ aggregated

Current implementation:

time-window clustering RPC

Future:

species-aware clustering  
detection density scoring  
movement modeling  
cross-camera correlation

---

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

---

5️⃣ Application Layer

Home (/)

Internal asset debug view.

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

Ingest (/ingest)

Technical monitoring.

Displays:

ingest batches  
source transparency  
errors

Events (/events)

Wildlife activity feed.

Includes:

Event view  
Asset grid  
relevance toggle

🧠 Relevance Model

Current:

boolean relevant

Derived from:

empty detection

Future:

relevance_score  
user_override  
event_relevance_score

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

📦 Runtime Documentation

The Hetzner worker runtime is archived in the repository under:

infrastructure/hetzner-worker/

This includes:

FTP worker  
SMTP bridge  
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
monitoring layer  
validated inference path

Next phase:

visible intelligence layer  
detection review UI  
species validation  
event scoring  
cross-camera pattern analysis  
predictive wildlife modeling