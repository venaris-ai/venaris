Venaris – Current State

Last updated: 2026-03-12



✅ System Status

Venaris currently operates as a functional early SaaS wildlife intelligence platform with real camera ingestion and authenticated tenant access.

The platform provides:

multi-source camera ingestion

asynchronous AI wildlife detection

event-based wildlife interpretation

visible intelligence dashboard (seed-driven)

database-driven camera provisioning

authenticated product setup flow

organization-based multitenancy foundation

Infrastructure and core intelligence pipeline are operational.



📡 Ingestion Layer

Unified ingest pipeline is stable across all channels.

Active ingest sources:

FTP cameras (LTE field devices)

SMTP cameras (direct MX ingest)

Manual import (ZIP + multi-file)

All channels normalize into the same ingest contract and create queued assets for asynchronous processing.

Transport infrastructure is fully controlled by Venaris.

Queue-based ingest ensures:

idempotency

horizontal scalability

retry safety

transport/runtime replaceability

Supabase remains the single persistent storage layer.



🤖 AI Processing Layer

The asynchronous detection worker pipeline is operational.

Processing chain:

Asset
→ MegaDetector
→ Empty filtering
→ Species classification
→ Wildlife summaries
→ Event clustering
→ Event relevance scoring

System automatically determines:

empty vs wildlife asset

detected species (taxonomy v1)

wildlife count signal per asset

aggregated wildlife signal per event

Event feed is ranked by ecological relevance.

Detection pipeline is production-validated with real hardware ingest.



🧠 Visible Intelligence Layer

First operational wildlife intelligence UI is live.

Available surfaces:

relevance-ranked event feed

intelligence dashboard (species overview, activity, time patterns)

Dashboard currently runs on seed dataset to allow fast UI iteration independent of AI runtime.

Wildlife intelligence scope excludes:

human detections

vehicle detections

Counting model prevents blind overcounting across repeated frames.

Configurable species weights influence event relevance scoring.



📷 Camera Product Model

Venaris now includes a database-driven provisioning architecture.

Camera identity is defined by:

canonical technical\_name

per-organization sequence

secure ingest token

active ingest configuration

Provisioning produces ingest-ready routing:

SMTP alias

FTP user + inbox

manual import label

Camera lifecycle principle:

sequences never reused

cameras preferably deactivated, not deleted

Real end-to-end provisioning validation with physical camera ingest has been confirmed.



🔐 Authentication \& Multitenancy

Supabase Auth email/password login is active.

Protected product routes require authentication.

Organization membership model is active with MVP roles:

owner

admin

member

viewer

Current MVP permission decision:

camera provisioning allowed for owner/admin

Active organization context currently derived from first membership.

Full organization switcher not yet implemented.



🖥 Product Setup Flow

Camera creation UI is operational at:

/cameras/new

Capabilities:

organization-aware camera provisioning

optional revier assignment

ingest method selection

vendor validation

direct provisioning result display

Provisioning flow is now infrastructure-aware, not only metadata entry.

Manual cameras become ingest-ready immediately.

FTP cameras become ready after runtime provisioning.

SMTP cameras become ready after alias activation.



🏗 Infrastructure Topology

Production runtime components:

Vercel → frontend + API

Supabase → database + storage

Hetzner → ingest gateways + workers

Hetzner responsibilities:

SMTP ingress

FTP ingress

provisioning runtime

AI processing worker

Wildlife data persistence lives exclusively in Supabase.

Transport/runtime infrastructure is intentionally replaceable.

TLS boundaries terminate at the service host.



🟢 Current Green Areas

Unified ingestion across SMTP / FTP / Manual

Direct SMTP MX ingest

Database-driven camera provisioning

Secure automated FTP provisioning

Asynchronous AI detection pipeline

Wildlife event clustering

Event relevance scoring

Seed-based intelligence dashboard

Authenticated product access

Membership-based multitenancy foundation

Real camera ingest loop validated



🟡 Current Yellow Areas

Active organization context visibility in UI

Tenant-aware filtering consistency (cameras / events / import)

Full role enforcement across all API routes

Camera setup result UX polish

Dashboard consolidation into operational home surface

Monitoring migration from legacy import\_method to ingest config logic

Revier management UI



🔴 Still Open for MVP 1.0

Wilddruck indicator

Final dashboard composition

Organization switcher

Member administration UI

Billing / legal / go-live preparation



🎯 Immediate Development Focus

coherent tenant-aware product surface

consistent role-protected actions

intelligence UI refinement

first wildlife pressure signal

field validation readiness

