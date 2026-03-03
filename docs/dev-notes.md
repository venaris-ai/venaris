Venaris – Dev Notes

Last updated: 2026-03-03 (Day 3 – FTP Ingest Production Stable)

This file documents operational setup, real-world behavior,
and important implementation details that are not purely architectural.

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

IMAP credentials (SMTP bridge)

INGEST_TOKEN (test cameras)

⚠️ Never commit .env files.

2️⃣ Ingest API Contract (CRITICAL)

Route:

src/app/api/ingest/route.ts

Requirements:

Header: x-ingest-token

Body: multipart/form-data

File field: "file"

metadata must be JSON string

metadata.source determines ingest_batches.source

Example metadata:

{
  "source": "ftp",
  "ftp_user": "xview01",
  "filename": "IMG_1234.JPG"
}
Common Failure Modes (Already Encountered)
❌ Sending raw binary (application/octet-stream)

→ 500 Failed to parse body as FormData

Fix:
Always use multipart/form-data.

❌ Missing metadata

→ ingest_batches.source becomes incorrect

Fix:
Always append metadata in FormData.

❌ Wrong ingest URL (localhost instead of production)

Worker must always target production API.

❌ Vercel Deployment Protection

Initial failure:

401 + HTML authentication page
Worker received SSO redirect page.

Cause:
Vercel Deployment Protection active.

Fix:
Append:

?x-vercel-protection-bypass=<token>

to VENARIS_INGEST_URL.

Bypass token stored in:

/opt/venaris-worker/.env

Never commit token.

❌ 307 Redirect from Vercel

Observed:

HTTP/2 307 Redirecting...

Reason:
Missing bypass cookie.

Resolved by:
Using bypass query parameter consistently in worker URL.

3️⃣ SMTP Bridge (Reolink)

Flow:

IMAP mailbox
→ smtp-bridge.mjs
→ /api/ingest

Characteristics:

Processes UNSEEN mails only

Dedup by IMAP UID

Supports inline images (CID)

Vendor flag via SMTP_VENDOR env

Mailbox example:

reolink@venaris.io

Known behavior:

Duplicate mail attachments → skippedDuplicates++

captured_at can be backfilled

SMTP is stable for MVP.

4️⃣ FTP Gateway (Hetzner)

Purpose:
Handle FTP-native cameras (X-View and future devices).

Server:
Hetzner VPS (Ubuntu 24.04)

Security Setup

SSH key only

Root login disabled

UFW enabled

Ports open:

22 (SSH)

21 (FTP control)

40000–40100 (Passive FTP)

vsftpd Configuration

File:

/etc/vsftpd.conf

Important lines:

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

Ensures:

Files uploaded as 660

Directories as 770

Worker (group member) can delete files

FTP Directory Permissions (Final Model)

Structure:

/data/ftp-ingest/
  └── xview01/
        └── inbox/

Permissions:

/data                     755 root:root
/data/ftp-ingest          755 root:root
/data/ftp-ingest/xview01  2770 xview01:ftp-ingest
/data/.../inbox           2770 xview01:ftp-ingest

Key concepts:

ftp-ingest group shared between ftp users and venaris worker

setgid (2) ensures new files inherit group

Worker deletes only after successful ingest

FTP Login Issue (Lesson Learned)

Problem:
vsftpd rejects login when shell is:

/usr/sbin/nologin

Fix:

sudo usermod -s /bin/bash xview01

Reason:
vsftpd validates login shell.

Security note:
SSH still key-only → FTP users cannot SSH.

5️⃣ FTP Worker (Production)

Location:

/opt/venaris-worker

Service:

venaris-ftp-worker

Environment:

/opt/venaris-worker/.env

Variables:

VENARIS_INGEST_URL=https://<prod>/api/ingest?x-vercel-protection-bypass=<token>
POLL_SECONDS=5
CAMERA_TOKEN_XVIEW01=cam-view-1
Worker Behavior

Loop:

Scan inbox

Ensure file size stable (prevents partial LTE uploads)

Compute SHA256 (logging only)

Send multipart FormData

metadata.source="ftp"

If success → delete file

If error → keep file for retry

Dedup Behavior

If file already ingested:

accepted=0 skippedDup=1

Worker still deletes file after successful API response.

Inbox remains clean.

6️⃣ Camera Config (X-View LTE)

Resolution: 5M

Send size: Groß

PIR: 6

Multi-shot: 1

Daily report: OFF

Passive FTP

24h time format

LTE SIM active

FTP user:

xview01

Ingest token:

cam-view-1
7️⃣ Known Risk Areas

Worker infinite retry loop (no quarantine yet)

LTE unstable upload → partial file (mitigated via size check)

Token leakage

Vercel protection expiration (token rotation required)

Future multi-camera scaling requires dynamic CAMERA_MAP

8️⃣ Operational Routine

SSH:

ssh venaris@<server-ip>

Check worker:

sudo systemctl status venaris-ftp-worker --no-pager -l

Live logs:

sudo journalctl -u venaris-ftp-worker -f

Check inbox:

ls -la /data/ftp-ingest/xview01/inbox

Check Supabase:

ingest_batches

assets

cameras.last_seen_at

9️⃣ Important Production Truths

Hetzner is a Gateway.
It must remain stateless.

Supabase is the single source of truth.

The Worker is a transport layer only.

If Hetzner is destroyed,
no wildlife data is lost.