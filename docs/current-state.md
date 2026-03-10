Venaris – Current State



Last updated: 2026-03-10 (SMTP Ingest Migration + Maildir Worker Architecture)



✅ System Status

Ingestion Layer



Unified ingest pipeline (FTP + SMTP + Manual) via shared ingestCore



Current ingest sources:



FTP (X-View LTE cameras)



SMTP (Reolink and compatible cameras)



Manual upload (Import Center)



SMTP Ingest Architecture (new)



The previous IMAP polling architecture has been replaced with a direct SMTP ingestion pipeline hosted on the Venaris infrastructure.



New SMTP path:



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

↓

Supabase storage + pipeline



Key properties:



no external mailbox dependency



no IMAP polling



queue-based ingestion



horizontal worker scalability



transport fully controlled by Venaris infrastructure



Maildir Queue



Incoming emails are written by Postfix into:



/home/venaris/Maildir/new



The worker processes them and moves messages into:



Maildir/processed

Maildir/error

Maildir/invalid



Meaning:



Folder	Meaning

new	new incoming messages

processed	successful ingest

error	ingest API failure

invalid	unknown camera alias



This prevents reprocessing loops and provides a clear ingest audit trail.



SMTP Camera Routing



Camera lookup is performed via database:



camera\_ingest\_configs.smtp\_alias



Example:



test-cam-0002@cams.venaris.io



Worker behavior:



extract recipient address



lookup camera config in DB



load ingest token



send multipart request to /api/ingest



Invalid camera addresses are automatically routed to:



Maildir/invalid

SMTP Worker



Service:



venaris-maildir-bridge.service



Worker location:



/opt/venaris-worker/maildir-bridge.mjs



Repository copy:



infrastructure/hetzner-worker/maildir-bridge.mjs



Worker responsibilities:



scan Maildir queue



parse MIME emails



support attachments and CID images



filter image attachments



compute SHA256



send multipart FormData to ingest API



move message to appropriate Maildir state



Supported image formats:



jpg

jpeg

png

webp

gif



CID inline images from camera emails are supported.



Previous SMTP Bridge (deprecated)



Previous architecture:



Camera

↓

SMTP

↓

external mailbox

↓

IMAP polling

↓

smtp-bridge worker

↓

/api/ingest



Service:



venaris-smtp-bridge.service



Status:



DISABLED



Reason:



The IMAP polling architecture was replaced by the direct SMTP ingestion pipeline.



Monitoring



Ingest batch monitoring implemented



Camera health engine (rule-based per import\_method) implemented



Navigation updated:



Home · Intelligence · Events · Cameras · Import · Ingest

Import



Import Adapter:



POST /api/upload



Capabilities:



multi-file upload



ZIP upload



drag \& drop



Metadata:



metadata.source="manual"

Security



Security Advisor clean



0 errors

0 warnings

0 suggestions

🧠 AI Pipeline



Venaris runs a full computer vision pipeline.



Camera

↓

Ingest

↓

MegaDetector

↓

Empty Filter

↓

Species Classifier (CLIP)

↓

detections

↓

Event clustering

↓

Visible Intelligence

MegaDetector Integration (v1)



Model:



md\_v1000.0.0-redwood.pt



Runner:



/opt/venaris-worker/detection-worker/md/runner.py



Outputs normalized to:



label → animal | human | vehicle

score → MD confidence

bbox → relative \[x,y,w,h]



Rows inserted into:



detections



Meta stored:



meta.bbox

meta.model = "megadetector\_v1000"

meta.md\_idx

Empty Filter (System Decision)

best\_animal\_score < MD\_ANIMAL\_THRESHOLD → empty=true



Environment:



MD\_ANIMAL\_THRESHOLD=0.2



Assets updated with:



assets.empty

assets.empty\_confidence

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



Pipeline:



MegaDetector bbox

↓

crop

↓

CLIP classification

↓

taxonomy\_species\_v1



Environment:



SPECIES\_SIM\_THRESHOLD=0.22

SPECIES\_BBOX\_PAD=0.10



Species stored in:



detections.species

Visible Intelligence Layer



Venaris now contains a first operational wildlife intelligence layer.



Wildlife-only rule:



label = animal

species != null



Excluded:



human

vehicle

Counting Model (MVP)



Asset-level:



count(distinct meta.md\_idx)



Event-level:



MAX(asset\_species\_count)



This avoids overcounting repeated frames.



Configurable Species Weights



Table:



species\_weights



Purpose:



Wildlife management oriented relevance scoring.



Views

asset\_species\_summary

event\_species\_summary

camera\_health

event\_feed

Intelligence Dashboard



Route:



/intelligence



Current modules:



Species Overview



Where \& When



Activity



Supported periods:



30d

90d

365d

Seed Dashboard Dataset



Script:



scripts/seed-intelligence.mjs



Seed scope:



~1300 events



~3500 assets



~6000 detections



Purpose:



Dashboard development and validation.



Seed intentionally bypasses:



worker runtime



MegaDetector



CLIP



storage previews



1️⃣ Infrastructure



Repository



GitHub: venaris-ai/venaris

Branch: main



Daily commits active.



Secrets never committed.



Tech Stack

Next.js (App Router)

Supabase (Postgres + Storage)

Tailwind CSS

Node.js workers

Python AI pipeline

Servers

Vercel → frontend + API

Hetzner VPS → FTP gateway

Hetzner VPS → SMTP gateway

Hetzner VPS → AI worker

Production Gateways

FTP Gateway



Server:



Hetzner CX23

Ubuntu 24.04



Service:



vsftpd



Directory:



/data/ftp-ingest/<user>/inbox



Worker deletes files after ingest.



SMTP Gateway (new)



Server:



Hetzner VPS



Service:



Postfix



Domain:



cams.venaris.io



MX points directly to Venaris infrastructure.



Postfix delivers messages into:



Maildir queue



Worker processes queue asynchronously.



Storage



Bucket:



camera-assets



Naming scheme:



{cameraId}/{timestamp}-{hash}.ext



Signed URLs:



20 min expiry



Supabase is the only persistent storage.



Hetzner stores no wildlife data.



Database (Active Tables)

reviers

cameras

assets

detections

events

event\_assets

ingest\_batches

camera\_health\_rules

species\_weights

camera\_ingest\_configs

API Routes

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

Architecture Maturity



Venaris now includes:



multi-source ingestion



FTP camera gateway



SMTP camera gateway (native infrastructure)



queue-based ingestion



MegaDetector pipeline



species classification



wildlife intelligence layer



event clustering



configurable species weights



dashboard intelligence



seed dataset for analytics testing



The system now provides:



camera ingest

AI detection

wildlife intelligence

dashboard analytics



Infrastructure is production-capable and horizontally scalable.



Infrastructure Archiving



Worker runtime is archived in repository:



infrastructure/hetzner-worker/



Contains:



ftp-worker.mjs

maildir-bridge.mjs

systemd service definitions

AI runners

masked env templates



Purpose:



Ensure full ingestion infrastructure is reproducible from Git.



Next Development Phase



Continue Phase 3 – Visible Intelligence Layer



Upcoming focus:



refine dashboard intelligence



add first Wilddruck indicator



improve where \& when logic



integrate intelligence blocks into home dashboard



Seed dataset will remain active for rapid UI iteration.



Operational Notes



SMTP:



direct MX delivery

queue based processing



FTP:



isolated users

chroot



Workers:



delete files only after successful ingest



Deduplication:



per-camera SHA256



Source of truth:



Supabase



Hetzner role:



transport + worker runtime



Workers require:



Vercel bypass token if deployment protection active



Rotate if leaked.

