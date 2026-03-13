Venaris – Dev Notes

Last updated: 2026-03-12

Scope of this document

This document contains the practical runtime and operations knowledge for Venaris.

It documents:

local development setup

worker/runtime paths

service names

infrastructure file locations

environment variables

operational failure modes

debugging routines

real-world implementation constraints

It does not define:

long-term architecture

product vision

roadmap planning

duplicated domain model explanations

1️⃣ Local Development Setup (Windows)

Project root:

C:\dev\venaris

Run app:

npm run dev

Local URL:

http://localhost:3000

Primary local environment file:

.env.local

Common required entries:

NEXT_PUBLIC_SUPABASE_URL

NEXT_PUBLIC_SUPABASE_ANON_KEY

SUPABASE_SERVICE_ROLE_KEY

For local camera provisioning tests, .env.local also needs:

FTP_PUBLIC_HOST

FTP_PUBLIC_PORT

HETZNER_PROVISIONER_URL

HETZNER_PROVISIONER_TOKEN

Important:

never commit real .env files

repository may contain masked env templates only

Reference location for masked templates:

infrastructure/hetzner-worker/env/

2️⃣ Core Ingest Runtime

Core ingest logic lives in:

src/lib/ingestCore.ts

Used by:

src/app/api/ingest/route.ts

src/app/api/upload/route.ts

Operational consequence:

same dedup logic across SMTP / FTP / Manual

same ingest batch handling

no duplicated ingest behavior across channels

Important practical rule:

Keep ingest fast and focused on asset creation and queueing.
Do not move intelligence logic into ingest.

3️⃣ Ingest API Contract

Primary ingest route:

src/app/api/ingest/route.ts

Requirements:

Headers

x-ingest-token

Body

multipart/form-data

Fields

file or files

metadata as JSON string

optional capturedAt

Example metadata:

{
  "source": "ftp",
  "ftp_user": "test-cam-0003",
  "filename": "IMG_1234.JPG"
}

Important:

metadata.source determines ingest_batches.source.

4️⃣ Manual Import

Manual import route:

src/app/api/upload/route.ts

Manual UI:

/import

Capabilities:

multi-file upload

ZIP upload via JSZip

drag & drop

enforced metadata.source="manual"

Safety guards:

MAX_FILES

MAX_ZIP_BYTES

Current manual camera rule:

Import UI lists only cameras where:

camera_ingest_configs.method = 'manual'

camera_ingest_configs.is_active = true

camera_ingest_configs.provisioning_status = 'ready'

Important practical note:

Manual cameras become ready immediately at provisioning time.

Existing manual cameras required backfill to provisioning_status='ready'.

Validated result:

manual camera creation
→ camera visible in /import
→ upload works
→ ingest batch visible in UI

5️⃣ SMTP Runtime
Current SMTP production path

Camera
→ SMTP
→ MX cams.venaris.io
→ Hetzner Postfix
→ Maildir
→ maildir-bridge.mjs
→ /api/ingest

Maildir queue location

/home/venaris/Maildir

Relevant folders:

new

processed

invalid

error

Meaning:

new → unprocessed messages

processed → ingest successful

invalid → unknown alias / unusable mail

error → ingest/API failure

SMTP worker

Location:

/opt/venaris-worker/maildir-bridge.mjs

Repository copy:

infrastructure/hetzner-worker/maildir-bridge.mjs

Service:

venaris-maildir-bridge.service

Environment:

/opt/venaris-worker/.env.maildir

Common required entries:

NEXT_PUBLIC_SUPABASE_URL

SUPABASE_SERVICE_ROLE_KEY

VENARIS_INGEST_URL

VERCEL_BYPASS_TOKEN

Behavior:

scan Maildir queue

parse mail with mailparser

extract recipient

resolve camera via DB

filter image attachments

send multipart request to /api/ingest

move mail into processed / invalid / error

run retention cleanup

Recipient resolution order:

X-Original-To

To

Current lookup rule:

select *
from camera_ingest_configs
where smtp_alias = <recipient>
  and is_active = true
  and provisioning_status = 'ready'
limit 1

Resolved runtime values:

camera_id

vendor

ingest_token

SMTP retention

Current retention policy:

processed → 7 days

invalid → 14 days

error → 14 days

new → never auto-cleaned

Purpose:

prevent disk growth

keep useful debug window

keep Hetzner as runtime/transport layer, not archive

Deprecated SMTP path

Deprecated worker:

venaris-smtp-bridge

Deprecated file:

smtp-bridge.mjs

This remains archived but is no longer the production target.

6️⃣ SMTP Gateway (Hetzner / Postfix)

Purpose:

Provide Venaris-owned SMTP entry point for camera ingest.

Domain model:

mail.cams.venaris.io → mail host

cams.venaris.io → camera namespace / MX domain

DNS setup:

mail.cams.venaris.io → Hetzner IP

cams.venaris.io → MX → mail.cams.venaris.io

Important Postfix config includes:

myhostname = mail.cams.venaris.io

mydestination = mail.cams.venaris.io, localhost

home_mailbox = Maildir/

inet_interfaces = all

inet_protocols = ipv4

virtual_alias_domains = cams.venaris.io

virtual_alias_maps = regexp:/etc/postfix/virtual_cams

Catch-all map file:

/etc/postfix/virtual_cams

Rule:

/^.+@cams\.venaris\.io$/ venaris

Meaning:

all mail to *@cams.venaris.io lands locally for user venaris.

Firewall requirement:

open TCP 25.

TLS note:

HTTPS certificate for cams.venaris.io is active via nginx + certbot.
This is not SMTP transport itself, but keeps Hetzner subdomain handling clean and hardened.

7️⃣ FTP Runtime
FTP gateway purpose

Handle FTP-native wildlife cameras.

Server characteristics

Hetzner VPS

Ubuntu 24.04

vsftpd

passive mode

UFW enabled

root login disabled

SSH key admin access

vsftpd config file

/etc/vsftpd.conf

Important lines include:

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

Important:

local_umask=007 is critical so files remain group-writable for worker actions.

FTP directory lifecycle

Per camera:

/data/ftp-ingest/<technical_name>/

contains:

inbox/

processed/

invalid/

error/

This is now the expected runtime structure.

Current FTP worker

Current production service:

venaris-ftpdir-bridge.service

Worker:

/opt/venaris-worker/ftpdir-bridge.mjs

Repository copy:

infrastructure/hetzner-worker/ftpdir-bridge.mjs

Environment:

/opt/venaris-worker/.env.ftpdir

Behavior:

load active FTP configs from DB

filter:

method='ftp'

is_active=true

provisioning_status='ready'

scan provisioned inboxes only

ensure file size is stable

compute SHA256

send multipart request to /api/ingest

move files to processed / invalid / error

run retention cleanup

delete only after successful ingest

FTP retention

Current retention policy:

processed → 7 days

invalid → 14 days

error → 14 days

Deprecated FTP path

Deprecated service:

venaris-ftp-worker

Deprecated file:

ftp-worker.mjs

Old model depended on hardcoded .env token mapping and static scanning.

It is retired.

8️⃣ FTP Provisioner Runtime

Purpose:

Automate Linux-side provisioning for real FTP camera onboarding.

Service:

venaris-ftp-provisioner.service

Worker:

/opt/venaris-worker/ftp-provisioner.mjs

Environment:

/opt/venaris-worker/.env.provisioner

Internal bind:

127.0.0.1:8787

Public URL:

https://provisioner.venaris.io

Security model:

raw port 8787 not exposed publicly

nginx reverse proxy

HTTPS via Let’s Encrypt

bearer token required

UFW blocks direct 8787 access

Responsibilities:

create Linux FTP user

assign ftp-ingest group

set camera FTP password

create full directory tree

set ownership + SGID permissions

support future reset / disable / deprovision actions

Important practical outcome:

FTP onboarding is now part of product flow, not external sysadmin setup.

FTP password policy

Original generated passwords were too long for many wildlife cameras.

Current practical rule:

FTP password length = 8 characters

random

shown once in UI

not retrievable later via UI

9️⃣ Detection Worker Runtime

Service:

venaris-detection-worker

Purpose:

process queued assets asynchronously.

Pipeline:

claim queued assets
→ download image from Supabase Storage
→ MegaDetector
→ species classification (if animal)
→ update detections
→ empty filter
→ event clustering RPC

Important practical note:

Hard runs can process large backlog if many assets remain queued.

Worker itself does not perform event aggregation logic directly.
It triggers DB-side event logic such as upsert_event_for_asset(...).

🔟 Taxonomy / Intelligence Implementation Notes

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

Current operational counting truth:

Use:

count(distinct meta.md_idx)

Do not rely on detections.count as biological truth.

Event-level count rule:

Use MAX(asset_species_count) per species within one event.

1️⃣1️⃣ Failure Modes Already Seen
Raw binary upload instead of multipart

Result:

Failed to parse body as FormData

Fix:

Always send multipart/form-data.

Missing metadata

Result:

wrong or missing ingest_batches.source

Fix:

Always attach JSON metadata.

Wrong ingest URL

Workers accidentally targeting localhost or stale deployment.

Fix:

Workers must always target active production API.

Vercel Deployment Protection

Observed:

401 / HTML login / redirects

Fix:

append ?x-vercel-protection-bypass=<token> to ingest URL.

Redirect handling

Observed 307/308.

Fix:

worker must tolerate redirects, but still use correct base URL.

Invalid ingest token

Observed in SMTP and FTP migrations.

Typical result:

401 {"error":"invalid ingest token"}

Fix:

align camera_ingest_configs.ingest_token with real token.

Unknown SMTP alias

Fix:

move mail into Maildir/invalid.

Maildir loop on unknown camera

Root cause:

message remained in new.

Fix:

move to invalid / error / processed depending on outcome.

FTP inbox exists but worker does not ingest

Common causes:

folder not created yet

wrong ownership

wrong group

camera still points to old FTP user

config token mismatch

Local /cameras/new fails with missing provisioner env

Root cause:

missing local .env.local entries for provisioner URL/token.

Fix:

add them and restart dev server.

gen_random_bytes not found inside provisioning SQL function

Root cause:

SET search_path TO '' requires schema-qualified extension call.

Fix:

use:

extensions.gen_random_bytes(...)

Real incident: outdated Vercel deployment target

Symptom:

worker code and production code drifted out of sync.

Fix:

workers must target current stable production endpoint.

Long-term rule:

prefer stable domain, not ephemeral Vercel deployment URL, wherever possible.

1️⃣2️⃣ Worker Operation & Debug Routine
SSH

ssh venaris@<server-ip>

Detection worker

Status:

sudo systemctl status venaris-detection-worker --no-pager -l

Logs:

sudo journalctl -u venaris-detection-worker -f

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

Logs:

sudo journalctl -u postfix -f

nginx

Status:

sudo systemctl status nginx --no-pager -l

1️⃣3️⃣ Important Production Truths

Supabase is the single source of truth.

Hetzner is replaceable runtime / transport infrastructure.

If Hetzner is lost, persistent wildlife data is not lost.

SMTP routing truth lives in camera_ingest_configs, not .env.

FTP routing truth lives in camera_ingest_configs, not .env.

Public provisioning terminates at provisioner.venaris.io.

Raw provisioning port 8787 is not externally exposed.

Wildlife intelligence excludes human and vehicle from biological/event interpretation.

1️⃣4️⃣ Runtime Archive in Repository

Repository runtime archive:

infrastructure/hetzner-worker/

Included components:

ftp-worker.mjs (deprecated)

ftpdir-bridge.mjs (current FTP)

smtp-bridge.mjs (deprecated)

maildir-bridge.mjs (current SMTP)

ftp-provisioner.mjs

AI runners

systemd service definitions

masked environment templates

Purpose:

keep runtime layer reproducible and inspectable from Git.

1️⃣5️⃣ Current Practical Risk Areas

backlog runs can take time

no dead-letter queue beyond current error folders

LTE partial uploads remain a real runtime concern

token leakage remains sensitive

provisioning result copy UX is still basic

event clustering is still time-window based only

Maildir worker is currently sequential

FTPDIR bridge is currently sequential

SMTP spam filtering is still basic

organization switcher not yet implemented

role checks not yet enforced everywhere

tenant filtering not yet consistent everywhere

Important nuance:

over-grouping of different species in test uploads is mainly a test artifact, not a typical real camera blocker.