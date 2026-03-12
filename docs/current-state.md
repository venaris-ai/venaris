Venaris – Current State

Last updated: 2026-03-12

✅ System Status

Ingestion Layer

Unified ingest pipeline (FTP + SMTP + Manual) via shared ingestCore.

Current ingest sources:

FTP (X-View LTE cameras)

SMTP (Reolink and compatible cameras)

Manual upload (Import Center)

SMTP Ingest Architecture

The previous IMAP polling architecture has been replaced with a direct SMTP ingestion pipeline hosted on the Venaris infrastructure.

Current SMTP path:

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

Folder | Meaning
--- | ---
new | new incoming messages
processed | successful ingest
error | ingest API failure
invalid | unknown camera alias

This prevents reprocessing loops and provides a clear ingest audit trail.

SMTP Camera Routing

Camera lookup is performed via database:

camera_ingest_configs.smtp_alias

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

Ingest batch monitoring implemented.

Camera health engine (rule-based per import_method) implemented.

Navigation updated:

Home · Intelligence · Events · Cameras · Import · Ingest

Import

Import Adapter:

POST /api/upload

Capabilities:

multi-file upload

ZIP upload

drag & drop

Metadata:

metadata.source="manual"

Security

Security Advisor clean.

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

md_v1000.0.0-redwood.pt

Runner:

/opt/venaris-worker/detection-worker/md/runner.py

Outputs normalized to:

label → animal | human | vehicle

score → MD confidence

bbox → relative [x,y,w,h]

Rows inserted into:

detections

Meta stored:

meta.bbox

meta.model = "megadetector_v1000"

meta.md_idx

Empty Filter (System Decision)

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

Pipeline:

MegaDetector bbox

↓
crop

↓
CLIP classification

↓
taxonomy_species_v1

Environment:

SPECIES_SIM_THRESHOLD=0.22

SPECIES_BBOX_PAD=0.10

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

count(distinct meta.md_idx)

Event-level:

MAX(asset_species_count)

This avoids overcounting repeated frames.

Configurable Species Weights

Table:

species_weights

Purpose:

Wildlife management oriented relevance scoring.

Views

asset_species_summary

event_species_summary

camera_health

event_feed

Intelligence Dashboard

Route:

/intelligence

Current modules:

Species Overview

Where & When

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

Supabase Auth

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

SMTP Gateway

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

organizations

organization_members

reviers

cameras

assets

detections

events

event_assets

ingest_batches

camera_health_rules

species_weights

camera_ingest_configs

organization_camera_sequences

Database Architecture Update (NEW)

Venaris now distinguishes clearly between:

Organization
=
administrative / tenant / billing / ownership layer

Revier
=
operational wildlife management area

Camera
=
administratively assigned to organization
and optionally assigned to a revier

This replaces the earlier implicit assumption that cameras belong only via revier.

Current relationship model:

organizations
  ├── organization_members
  ├── reviers
  └── cameras

Important product decision:

organizations and reviers are not merged.

Reason:

organization is the administrative and commercial unit

revier is the operational field unit

Examples:

Organization: B&T GbR

Revier: Heubachwiesen

Members: Bruno, Torsten, Agnes, Miriam, Laurent

Cameras: Reolink, Zeiss, X-View

Camera Provisioning Architecture (NEW)

Venaris now includes a database-driven camera provisioning model.

Canonical camera provisioning key:

cameras.technical_name

Format:

<organization-slug>-cam-<4-digit-sequence>

Examples:

demo-cam-0001

test-cam-0004

heubachwiesen-cam-0001

Sequence logic:

sequence increments per organization

sequence range currently 0001–9999

numbers are never reused

camera deactivation is preferred over deletion

Current sequence state table:

organization_camera_sequences

Current provisioning logic:

create_camera_with_provisioning()

The provisioning function:

validates organization and optional revier assignment

allocates next sequence per organization

builds technical_name

generates secure ingest token

creates camera row

creates matching camera_ingest_configs row

returns technical provisioning data

Provisioning target rules:

SMTP alias:

<technical_name>@cams.venaris.io

FTP username:

<technical_name>

FTP inbox:

/data/ftp-ingest/<technical_name>/inbox

Manual label:

<technical_name>

Important compatibility decision:

cameras.id remains primary key

cameras.technical_name becomes canonical provisioning key

camera_ingest_configs becomes routing truth

cameras.ingest_token and cameras.import_method remain temporarily as legacy compatibility fields

Token generation (NEW)

Provisioning now generates a fresh secure ingest token.

The same generated token is written to both:

cameras.ingest_token

camera_ingest_configs.ingest_token

This keeps the current system backward-compatible while shifting routing truth into camera_ingest_configs.

Vendor validation (NEW)

Provisioning validates vendor against controlled list:

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

Provisioning Validation Status

The provisioning function was tested successfully with a real test camera flow.

Validated result included:

technical_name generation

correct per-organization sequence increment

organization assignment

optional revier assignment

FTP routing derivation

token synchronization between legacy and config fields

Example successful provisioning result:

technical_name = test-cam-0005

ftp_username = test-cam-0005

ftp_inbox_path = /data/ftp-ingest/test-cam-0005/inbox

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

POST /api/cameras/create

POST /api/auth/logout

Frontend / Product Layer Update (NEW)

Venaris now includes the first real product-oriented setup flow for cameras.

New route:

/cameras/new

Capabilities:

organization-aware camera creation

optional revier assignment

method selection

vendor selection

optional location metadata

optional position / direction inputs

returns provisioning result directly in UI

Provisioning result currently shows:

camera id

technical name

ingest token

SMTP alias or FTP routing values or manual label

Navigation now includes authenticated product flow:

Home

Intelligence

Events

Cameras

Import

Ingest

Logout

Authentication Layer (NEW)

Supabase Auth email/password login is now integrated.

Login page:

/login

Protected routes:

/

 /cameras

 /cameras/new

 /events

 /intelligence

 /import

 /ingest

Protected route behavior:

unauthenticated user → redirect to /login

authenticated user → app access

logout route clears session

Role Model (MVP Decision)

Organization memberships now use active role model:

owner

admin

member

viewer

Current MVP permission decision:

camera creation allowed only for owner/admin

organization context is the administrative product scope

memberships are now intended to be active product data, not just future schema

Current organization context behavior:

single membership / first membership is used as active organization context for MVP

full organization switcher is not yet implemented

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

database-driven camera provisioning

real login/logout flow

protected product routes

membership-based multitenancy foundation

The system now provides:

camera ingest

AI detection

wildlife intelligence

dashboard analytics

camera provisioning

authenticated SaaS-style product foundation

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

Transition from internal tooling to early SaaS product operation.

Immediate upcoming focus:

make active organization visible in UI

filter camera views by active organization

enforce role checks in relevant API routes

build revier setup / management UI

continue dashboard refinement

add first Wilddruck indicator

improve where & when logic

integrate intelligence blocks into home dashboard

Seed dataset will remain active for rapid UI iteration.

Operational Notes

SMTP:

direct MX delivery

queue based processing

canonical alias routing now aligned with technical_name

FTP:

isolated users

chroot

canonical FTP usernames now aligned with technical_name

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

Current Honest Project Status

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

role enforcement across all routes

tenant-aware camera / event / import filtering

revier setup UI

Still open:

Wilddruck indicator

dashboard consolidation

go-live legal / branding / payment preparation



---

## Infrastructure Security Hardening (NEW – 2026-03-12)

Venaris infrastructure security model was significantly hardened.

### FTP Provisioner Runtime

New service:

venaris-ftp-provisioner.service

Worker:

/opt/venaris-worker/ftp-provisioner.mjs

Responsibilities:

- create isolated Linux FTP user per camera
- assign user to ftp-ingest group
- generate random FTP password
- create full directory lifecycle tree

Directory structure per camera:

/data/ftp-ingest/<technical_name>/
  inbox/
  processed/
  invalid/
  error/

Permissions:

- user owned
- group ftp-ingest
- SGID enforced
- chroot isolation via vsftpd

### Provisioner Network Hardening

Provisioner runtime no longer exposed publicly on raw port.

Internal runtime port:

127.0.0.1:8787

Public endpoint:

https://provisioner.venaris.io

Reverse proxy:

nginx

Firewall:

Port 8787 CLOSED externally via UFW.

Only ports open:

21 (FTP)
25 (SMTP)
80 (HTTP)
443 (HTTPS)

### TLS Enablement (NEW)

Let's Encrypt certificates successfully issued and deployed for:

provisioner.venaris.io  
cams.venaris.io  

Certbot auto-renew enabled via system timer.

---

## FTP Password Policy Update (NEW – 2026-03-12)

Original provisioning generated long crypto passwords.

Real-world wildlife camera testing showed:

many LTE cameras cannot accept long credentials.

New policy:

FTP password length = 8 characters.

Password properties:

random
mixed case + digits
shown only once in provisioning UI

Passwords are not retrievable afterwards.

---

## FTP Worker Lifecycle Retention (NEW)

FTP ingest worker now includes automatic lifecycle cleanup.

Retention rules:

processed → delete after 7 days  
error → delete after 14 days  
invalid → delete after 14 days  

Purpose:

prevent disk growth  
maintain operational debugging window  
keep Hetzner runtime storage lightweight  

---

## SMTP Worker Retention (NEW)

Maildir bridge now includes lifecycle cleanup logic.

Retention rules:

processed → delete after 7 days  
error → delete after 14 days  
invalid → delete after 14 days  

Queue folder "new" is never cleaned automatically.

---

## End-to-End Secure FTP Provisioning Validation (NEW)

Full SaaS provisioning flow validated:

1. User creates FTP camera via UI (/cameras/new)
2. API calls create_camera_with_provisioning()
3. Provisioner runtime creates Linux user + folders
4. UI shows FTP configuration once
5. Camera configured with credentials
6. Image sent via FTP
7. ftpdir-bridge processes image
8. Asset appears in Supabase + Home dashboard

This confirms:

database provisioning  
infrastructure provisioning  
worker ingest routing  
UI provisioning result display  
real camera ingestion  

All layers validated successfully.

---

## Manual Import Stabilization (NEW)

Manual cameras now automatically receive:

camera_ingest_configs.manual_label

Import UI now filters for method=manual cameras only.

Manual ingest validated:

ZIP upload  
multi-file upload  
batch creation  
dashboard visibility  

---

## Provisioning Runtime Topology (NEW)

Current worker services on Hetzner:

venaris-maildir-bridge.service  
venaris-ftpdir-bridge.service  
venaris-ftp-provisioner.service  
venaris-detection-worker.service  

Deprecated:

venaris-smtp-bridge.service  
venaris-ftp-worker.service  

This reflects migration to:

directory scanning ingestion  
native SMTP MX ingest  
database-driven provisioning  

---

## MVP Readiness Status Update (2026-03-12)

Green:

secure FTP provisioning  
native SMTP ingest  
manual import flow  
AI detection pipeline  
database provisioning architecture  
TLS hardened infrastructure  
retention lifecycle  
real camera E2E validation  

Yellow:

camera create UI polish (copy UX)  
active organization UX clarity  
tenant filtering consistency  
dashboard consolidation  

Open:

Wilddruck indicator  
revier management UI  
billing / go-live preparation  

---







