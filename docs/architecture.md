Venaris – Architecture (MVP)

Last updated: 2026-03-12

Scope of this document

This document defines the durable architecture of Venaris.

It describes:

product and system structure

core domain model

ingest architecture

intelligence architecture

security boundaries

durable architectural decisions

It does not document:

daily operational incidents

runtime commands

systemd service handling

temporary debugging steps

roadmap planning

transient implementation experiments

🎯 Vision

Venaris is a wildlife data platform.

Cameras are sensors — not the product.
The product is structured wildlife intelligence.

The long-term goal is to transform unstructured wildlife observations:

images

time-series signals

environmental metadata

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

The architectural direction is:

multi-source ingest

unified asset pipeline

asynchronous intelligence processing

event-based wildlife interpretation

tenant-aware product access

infrastructure-aware camera provisioning

1️⃣ Ingestion Layer
Purpose

Receive wildlife sensor data from multiple import methods and normalize them into a unified ingest contract.

Supported ingest channels

SMTP

FTP

Manual import

All ingest channels converge into the same unified ingestion pipeline.

Unified Ingest Contract

Primary endpoint:

POST /api/ingest

Requirements:

header: x-ingest-token

body: multipart/form-data

fields:

file or files

metadata (JSON)

optional capturedAt

Example metadata:

{
  "source": "ftp",
  "ftp_user": "test-cam-0003",
  "filename": "IMG_1234.JPG"
}
Unified ingest responsibilities

Each ingest:

creates ingest_batch

performs per-camera SHA256 deduplication

stores image in Supabase Storage

inserts asset

updates camera.last_seen_at

queues asset for asynchronous AI processing

Important architectural decision:

Event creation is not an ingest concern.
Ingest remains focused on reliable asset creation and queueing.

Manual Import Adapter

Manual import uses:

POST /api/upload

Capabilities:

multi-file upload

ZIP upload

drag & drop

enforced metadata.source = "manual"

Manual import is not a special-case bypass anymore.
It is a first-class ingest channel that still feeds the same core pipeline.

SMTP Ingestion

Durable SMTP path:

Camera
→ SMTP
→ MX cams.venaris.io
→ Postfix
→ Maildir queue
→ maildir-bridge
→ /api/ingest

Architectural properties:

no external mailbox dependency

queue-based transport

direct Venaris-owned ingress

camera resolution via DB config

robust failure isolation via queue state folders

SMTP routing is resolved through:

camera_ingest_configs.smtp_alias

FTP Ingestion

Durable FTP path:

Camera
→ FTP
→ Hetzner FTP gateway
→ /data/ftp-ingest/<technical_name>/inbox
→ ftpdir-bridge
→ /api/ingest

Architectural properties:

per-camera FTP user

chroot isolation

passive FTP

DB-driven routing

file stability check before ingest

no static token mapping

FTP routing is resolved through:

camera_ingest_configs.ftp_username

camera_ingest_configs.ftp_inbox_path

camera_ingest_configs.ingest_token

Provisioning Readiness Gate

A camera ingest config is operationally processable only when:

is_active = true

provisioning_status = 'ready'

This is now a real runtime architecture concept, not metadata decoration.

2️⃣ Storage Layer
Persistent storage model

Supabase is the single persistent source of truth.

Wildlife data persistence does not depend on Hetzner runtime survival.

Asset storage

Supabase Storage bucket:

camera-assets

Naming scheme:

{cameraId}/{timestamp}-{hash12}.ext

Access model:

signed URLs

server-generated

short-lived

Multi-tenant domain structure

Venaris distinguishes between:

organizations = administrative / commercial tenant scope

reviers = operational wildlife management areas

cameras = wildlife sensors belonging administratively to organizations and optionally to reviers

This is a durable architecture decision.

Organizations and reviers are intentionally not merged.

Reason:

organization = billing / ownership / user scope

revier = operational field scope

Core database entities
organizations

Administrative tenant boundary.

Responsibilities:

ownership scope

membership scope

future billing scope

organization_members

Maps users to organizations.

Role model:

owner

admin

member

viewer

reviers

Operational wildlife management units.

Can later hold:

area metadata

habitat metadata

boundaries

regional context

cameras

Wildlife sensors.

Durable architecture decisions:

cameras.id remains primary key

cameras.technical_name is canonical provisioning key

organization_id is administrative owner link

revier_id is optional operational assignment

Legacy compatibility fields still exist temporarily:

import_method

ingest_token

camera_ingest_configs

This is the routing truth for camera ingest.

Purpose:

decouple routing from .env

make workers DB-driven

support multiple ingest methods cleanly

support provisioning state

Key concepts:

method

is_active

provisioning_status

smtp_alias

ftp_username

ftp_inbox_path

manual_label

ingest_token

vendor

organization_camera_sequences

Allocates next camera number atomically per organization.

This enables race-safe technical name generation.

Canonical technical name

Canonical provisioning key:

technical_name

Format:

<organization-slug>-cam-<4-digit-sequence>

Examples:

demo-cam-0001

test-cam-0005

heubachwiesen-cam-0001

Rules:

per organization

increments monotonically

numbers are never reused

preferred lifecycle is deactivate, not delete

Provisioning function

Durable provisioning function:

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

Important architectural decision:

The same generated token is currently written into both:

cameras.ingest_token

camera_ingest_configs.ingest_token

Reason:

preserve compatibility while shifting routing truth to camera_ingest_configs.

Provisioning-derived routing values

Routing is derived from technical_name:

SMTP alias:

<technical_name>@cams.venaris.io

FTP username:

<technical_name>

FTP inbox path:

/data/ftp-ingest/<technical_name>/inbox

Manual label:

<technical_name>

Provisioning status semantics

pending = product object exists, runtime not fully ready

ready = camera may be used by workers and UI flows

failed = provisioning failed or runtime incomplete

Manual cameras become ready immediately because they require no infrastructure-side provisioning.

3️⃣ Intelligence Layer
Purpose

Convert assets into ecological signals.

Detection pipeline

Asset
→ MegaDetector
→ Empty filtering
→ Species classification
→ Wildlife summaries
→ Event clustering
→ Event ranking / intelligence

MegaDetector

Purpose:

detect:

animal

human

vehicle

Output:

label

score

bbox

Durable interpretation:

meta.md_idx is the canonical object key for counting within one image.

Empty filter

System rule:

best animal score below threshold → empty

This drives:

assets.empty

assets.empty_confidence

assets.relevant

Species classification

Runs only when MegaDetector detects animal candidates.

Uses CLIP zero-shot classification over taxonomy v1.

Taxonomy v1

Current MVP taxonomy:

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

Wildlife-only intelligence scope

Wildlife intelligence excludes:

human

vehicle

This applies to:

event relevance

top species

species overview

activity patterns

future pressure models

Counting model

This is a core durable architecture choice.

Asset-level counting

Per asset:

count(distinct meta.md_idx) per species

Meaning:

one image with 3 roe deer → count = 3

Event-level counting

Per event:

MAX(asset_species_count) per species within the event

Meaning:

repeated frames do not automatically imply repeated animals.

Wildlife summary views
asset_species_summary

Bridge from detections to asset-level ecological interpretation.

event_species_summary

Bridge from asset summaries to event-level ecological interpretation.

These views are central to visible intelligence.

Events

Events represent aggregated wildlife activity.

Current clustering basis:

same camera

time-window logic

Event aggregation is based on:

wildlife summaries

species weights

not on raw detection row counts.

Current event semantics:

top_species = strongest wildlife species signal

top_count = event-level wildlife count

relevance_score = wildlife-only relevance signal

4️⃣ Monitoring Layer
Purpose

Monitor sensor reliability and ingest health.

camera_health_rules

Defines health thresholds per import method.

camera_health

Determines:

online

stale

offline

unknown

based primarily on last_seen_at.

Important long-term direction:

Monitoring should ultimately derive from active ingest configuration rather than legacy cameras.import_method.

Ingest monitoring

Tracks:

file_count

skipped_duplicates

source

error_summary

for ingest sources:

ftp

smtp

manual

5️⃣ Application Layer
Purpose

Expose intelligence and provisioning through product-facing surfaces.

Home

Current role:

operational overview / transitional dashboard surface

Long-term role:

compact product home dashboard

Intelligence

Primary visible intelligence surface.

Current modules:

Species Overview

Where & When

Activity

Import

Human ingest interface for manual cameras.

Current role:

manual asset onboarding into unified pipeline.

Cameras

Camera overview and setup visibility.

Long-term role:

tenant-aware camera operations and provisioning management.

Cameras New

Route:

/cameras/new

This is the first real product-facing provisioning surface.

Capabilities:

authenticated access

organization-aware camera creation

optional revier assignment

method selection

vendor selection

optional location / position / direction metadata

method-dependent provisioning result

Method-dependent setup outcomes
FTP

Provisioning result includes:

host

port

username

password

path

passive mode

SMTP

Provisioning result includes:

smtp alias

Manual

Provisioning result includes:

manual label

immediate readiness for /import

Authentication layer

Supabase Auth email/password is part of the product architecture.

Protected route model:

unauthenticated user
→ redirect to /login

authenticated user
→ protected product area

MVP authorization rule:

camera creation allowed only for owner/admin

Current organization context rule:

first / only membership acts as active organization context.

🔒 Security Architecture
Data access model

RLS enabled

no client-side direct table access

server routes as controlled access layer

service role only server-side

token-based ingest authentication

Gateway security

FTP gateway principles:

per-camera user isolation

chroot

passive port restriction

firewall enforcement

SMTP gateway principles:

direct MX routing

queue-based processing

alias resolution only through known DB config

invalid aliases isolated from valid ingest flow

Auth / multitenancy split

Supabase Auth provides identity.
organization_members provides tenant membership.

Important separation:

session-bound auth checks use auth client

admin / provisioning / DB operations use service-role server client

This separation is intentional and durable.

TLS boundary model

TLS terminates where the service actually runs.

Current architectural rule:

venaris.io → Vercel TLS

Hetzner-hosted service subdomains → Hetzner TLS

This avoids mixing service boundaries.

Provisioner security boundary

Provisioning runtime is conceptually separate from ingest workers.

It is a privileged infrastructure action and therefore must remain behind:

authenticated API access

HTTPS boundary

internal runtime separation

🌱 Seed Dataset Role

Seed data is part of the architecture as a UI/intelligence acceleration tool.

Purpose:

realistic dashboard data

visible intelligence validation

decoupling dashboard work from AI runtime throughput

It is explicitly not an inference path.

🚀 Strategic Direction

Venaris is evolving from:

a camera ingestion system

into:

a wildlife intelligence platform with real product onboarding.

Current architectural phase:

multi-channel ingest

asynchronous AI processing

wildlife summaries

event-based intelligence

product-facing provisioning

authenticated multitenant foundation

Next durable architectural direction:

stronger tenant-aware product coherence

richer organization context handling

revier-aware product surfaces

pressure indicators

more operationally useful home/dashboard synthesis

Honest Architecture Maturity Status
Green

unified ingest contract

direct SMTP ingest

database-driven camera provisioning

secure FTP provisioning model

manual import as first-class ingest channel

wildlife counting model

event relevance model

authenticated product foundation

Yellow

organization context UX

monitoring migration away from legacy import_method

stronger role protection across all product actions

richer tenant-aware filtering

dashboard consolidation

Still open

Wilddruck indicator

richer home dashboard

billing / legal / go-live layer

long-term large-scale worker parallelization strategy

Summary Architecture Statement

Venaris now operates on these durable chains:

Intelligence chain

Images
→ Assets
→ Detections
→ Asset Wildlife Summary
→ Event Wildlife Summary
→ Ranked Events
→ Visible Intelligence

SMTP ingest chain

Camera
→ SMTP
→ Postfix
→ Maildir Queue
→ maildir-bridge
→ /api/ingest
→ Assets

FTP ingest chain

Camera
→ FTP
→ FTP gateway
→ DB-driven FTP routing
→ ftpdir-bridge
→ /api/ingest
→ Assets

Product provisioning chain

User
→ Login
→ Active Organization Context
→ Create Camera
→ technical_name + token + routing config
→ optional runtime provisioning
→ operational ingest-ready camera

Together these form the current architectural backbone for MVP 1.0.