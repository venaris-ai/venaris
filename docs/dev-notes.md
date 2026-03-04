Venaris – Dev Notes

Last updated: 2026-03-04 (Day 4 – Detection Architecture Locked)

This file documents operational setup, real-world behavior,
and important implementation details that are not purely architectural.

It is intentionally practical.

1️⃣ Local Development Setup (Windows)

Project root

C:\dev\venaris

Run app

npm run dev

Local URL

http://localhost:3000

Environment file

.env.local

Contains

NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

Optional

local test ingest tokens

⚠️ Never commit .env files.

2️⃣ Unified Ingest Pipeline (CRITICAL)

Core logic lives in

src/lib/ingestCore.ts

Used by

src/app/api/ingest/route.ts
src/app/api/upload/route.ts

This guarantees

Same dedup logic

Same batch handling

Same event clustering

Same detection integration

Same camera health updates

No duplicate ingest logic.

3️⃣ Ingest API Contract (Workers → Production)

Route

src/app/api/ingest/route.ts

Requirements

Header

x-ingest-token

Body

multipart/form-data

File field

file OR files

metadata must be JSON string.

Example metadata

{
  "source": "ftp",
  "ftp_user": "xview01",
  "filename": "IMG_1234.JPG"
}

metadata.source determines

ingest_batches.source
4️⃣ Common Failure Modes (Already Encountered)
❌ Raw binary upload
application/octet-stream

Result

500 Failed to parse body as FormData

Fix

Always send multipart/form-data.

❌ Missing metadata

Result

ingest_batches.source incorrect

Fix

Always attach metadata JSON.

❌ Wrong ingest URL

Workers accidentally targeting

localhost:3000

instead of production.

Workers must always target production API.

❌ Vercel Deployment Protection

Observed

401 + HTML SSO page

Worker received login redirect.

Fix

Append

?x-vercel-protection-bypass=<token>

to

VENARIS_INGEST_URL

Token stored in

/opt/venaris-worker/.env

⚠️ Never commit token.

❌ 307 Redirect

Observed

HTTP/2 307 Redirecting...

Reason

Missing bypass cookie.

Fix

Always use bypass query parameter.

5️⃣ Import Adapter (Manual Channel)

Route

src/app/api/upload/route.ts

Capabilities

Multi-file upload

ZIP upload (via JSZip)

metadata.source="manual"

Channels

upload
import

Safety guards

MAX_FILES
MAX_ZIP_BYTES

All files forwarded to ingestCore.

Result

ingest_batches created
source = manual
dedup identical to FTP/SMTP

Import UI

/import

Human ingestion entrypoint.

6️⃣ SMTP Bridge (Reolink)

Flow

IMAP mailbox
↓
smtp-bridge.mjs
↓
/api/ingest

Characteristics

Processes UNSEEN mails only

Dedup via IMAP UID

Supports inline images (CID)

metadata.source="smtp"

Poll interval

60 seconds

Duplicate attachments

skippedDuplicates++

captured_at may be backfilled later.

SMTP stable for MVP.

7️⃣ FTP Gateway (Hetzner)

Purpose

Handle FTP-native cameras.

Server

Hetzner VPS
Ubuntu 24.04

Security

SSH key only

Root login disabled

UFW enabled

Ports

22
21
40000–40100
vsftpd Configuration

File

/etc/vsftpd.conf

Important lines

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

⚠️ local_umask=007 is critical.

Ensures

files = 660
dirs  = 770

Worker can delete files.

8️⃣ FTP Worker (Production)

Location

/opt/venaris-worker

Service

venaris-ftp-worker

Environment

/opt/venaris-worker/.env

Variables

VENARIS_INGEST_URL=https://<prod>/api/ingest?x-vercel-protection-bypass=<token>
POLL_SECONDS=15
CAMERA_TOKEN_XVIEW01=cam-view-1
Worker Behavior

Loop

scan inbox
ensure file size stable
compute SHA256
send multipart FormData
metadata.source="ftp"

Success

delete file

Error

keep file for retry

Dedup example

accepted=0 skippedDup=1

Inbox remains clean.

9️⃣ Detection Architecture (New)

Detection is asynchronous.

Assets enter pipeline with

status = queued

Detection worker processes them.

Pipeline

Camera
↓
Ingest
↓
MegaDetector
↓
Empty Filter
↓
Species Classifier
↓
Event Clustering
↓
Wildlife Intelligence
🔟 MegaDetector (Stage 1)

Purpose

Detect presence of

animal
human
vehicle

Output

bounding boxes
confidence

Main role

empty vs non-empty filtering

Advantages

Large pretrained model

Millions of camera trap images

Very high recall for wildlife.

1️⃣1️⃣ Species Classifier (Stage 2)

Runs only when

MegaDetector → animal detected

Classifies species into Venaris taxonomy.

This reduces compute cost significantly.

1️⃣2️⃣ Venaris Wildlife Taxonomy v1

Based on DJV hunting statistics.

Classes

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

Total

15 classes

Wolf included due to high management relevance.

1️⃣3️⃣ Asset Detection Fields

New fields in assets

empty
empty_confidence

Detection tables

asset_detections
detections

Example detection record

asset_id
species
confidence
count
bbox
1️⃣4️⃣ Relevance Model

User override always wins.

Logic

if relevant != null
   → use override

else if empty = true
   → irrelevant

else
   → relevant
1️⃣5️⃣ Known Risk Areas

Worker infinite retry loop (no quarantine)

LTE unstable upload → partial files

Token leakage

Vercel protection expiration

No dead-letter queue

Multi-camera scaling still env-based

Detection model updates require versioning

1️⃣6️⃣ Operational Routine

SSH

ssh venaris@<server-ip>

Check workers

sudo systemctl status venaris-ftp-worker --no-pager -l
sudo systemctl status venaris-smtp-bridge --no-pager -l

Logs

sudo journalctl -u venaris-ftp-worker -f
sudo journalctl -u venaris-smtp-bridge -f

Inbox

ls -la /data/ftp-ingest/xview01/inbox

Supabase checks

ingest_batches
assets
cameras.last_seen_at
1️⃣7️⃣ Important Production Truths

Hetzner is a gateway.

It must remain stateless.

Supabase is the single source of truth.

Workers are transport layers only.

If Hetzner is destroyed

no wildlife data is lost

All state lives in Supabase.