Venaris – Current State

Last updated: 2026-03-05 (Day 5 – AI Pipeline Operational)

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

Navigation updated (Import added)

Import

Import Adapter (ZIP + multi-file) implemented

Import Center UI implemented

Security

Security Advisor clean
(0 errors / 0 warnings / 0 suggestions)

🧠 AI Pipeline (NEW)

Venaris now runs a full computer vision pipeline.

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
MegaDetector Integration (v1)

Model:

md_v1000.0.0-redwood.pt

Runs on:

/opt/venaris-worker/detection-worker/md/runner.py

Output normalized to:

label   → animal | human | vehicle
score   → MD confidence
bbox    → relative [x,y,w,h]

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

Taxonomy v1 (ENUM):

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

This ensures:

1 bounding box = 1 detection row

(no duplication).

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

Servers:

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

/data                     755 root:root
/data/ftp-ingest          755 root:root
/data/ftp-ingest/xview01  2770 xview01:ftp-ingest
/data/.../inbox           2770 xview01:ftp-ingest

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
6️⃣ Import Adapter

Route:

POST /api/upload

Capabilities:

multi-file upload
ZIP upload
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

Home · Cameras · Import · Ingest · Events
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

9️⃣ Database (Active Tables)
reviers
cameras
assets
detections
events
event_assets
ingest_batches
camera_health_rules
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
ZIP import adapter
batch monitoring
camera health engine
secure RLS API
signed URL previews

Infrastructure is AI-capable and production-structurable.

🔜 Immediate Next Step
Detection Review UI

Goal:

User must be able to verify AI output.

Example UI:

Image
↓
animal detected
↓
species = roe_deer
confidence = 0.31

User can confirm / correct.

Data Expansion

Current dataset:

very few wildlife images

Next step:

collect larger dataset
evaluate species accuracy
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