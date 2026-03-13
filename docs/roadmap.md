Venaris – Roadmap (Version 1.0)

Last updated: 2026-03-12

Scope of this document

This document tracks the MVP delivery plan for Venaris.

It defines: MVP scope, Milestones, Phase Status, done vs open work, next priorities, success criteria

It does not document: runtime file paths, service configs, operational commands, debugging procedures, deep architecture prose



Target Delivery

31.03.2026 (EOD)

Goal

Visible Wildlife Intelligence + Operational Stability + First Real SaaS Product Loop

Workdays only (Mon–Fri). Weekends excluded.

🎯 MVP Definition (Version 1.0)
Venaris delivers

Automatic image classification (empty / non-empty)

Species recognition (taxonomy v1)

Event clustering

System relevance scoring + manual relevance override (UI)

Camera monitoring (health)

Activity intelligence (basic)

Wilddruck indicator (basic)

LTE / Email ingestion (FTP + SMTP + Import)

Operational dashboard

Database-driven camera provisioning

Login / protected product access

Organization-based multitenancy foundation

Secure FTP provisioning validated with real camera flow



Not included

Population model

Individual animal ID

Behavioral prediction

Self-service billing

Invite / self-service signup flow

Fine-grained permission matrix beyond MVP roles



MVP statement

Version 1.0 = work simplification + visible intelligence + first real product operation

🧱 Layer Completion Targets
Layer	Target
Ingestion Layer	100% stable
Storage Layer	structured lifecycle + product-ready camera model
Processing Layer	worker orchestration
Intelligence Layer	Detection v1 (MegaDetector + species classifier)
Monitoring Layer	health + KPIs
Application Layer	dashboard + insight views + authenticated product setup


📆 Execution Window

Start: 04.03.2026
End: 31.03.2026

✅ Phase 1 – Processing Foundation (DONE)
04.03 – Asset Status System – Design

Done:

asset lifecycle defined

detection removed from ingest responsibility

queue model clarified

Delivery:

ingest writes assets into processing lifecycle only

05.03 – Asset Status System – Implementation

Done:

/api/ingest creates queued assets

ingest remains fast and idempotent

Delivery:

pure ingest → queue model operational

06.03 – Detection Worker Skeleton – Architecture

Done:

Node worker selected

polling + retry concept defined

Delivery:

worker architecture locked

09.03 – Detection Worker Skeleton – Implementation

Done:

worker service running

async AI loop active

queue transition works

Delivery:

asynchronous AI processing operational

🟢 Phase 2 – Detection v1 (Core Intelligence) (DONE)

Pipeline:

Camera
→ Ingest
→ MegaDetector
→ Empty Filter
→ Species Classifier
→ Event Clustering
→ Intelligence

MegaDetector Integration – DONE

animal / human / vehicle detection active

detections written to DB

Empty Filter – DONE

automatic empty / non-empty decision works

Species Mapping – DONE

taxonomy v1 finalized

detections.species moved to enum-backed model

Species Classifier – DONE

CLIP integrated

classification works end-to-end

accuracy refinement remains ongoing, but MVP-level functionality is achieved

Delivery:

Detection v1 functional in production worker

🟢 Phase 2.5 – Ingestion Infrastructure Hardening (DONE)

Goal:
Ensure ingest works reliably with real cameras and field infrastructure.

FTP Gateway – DONE

first stable FTP ingest path established

field ingest from LTE camera class works

Direct SMTP Ingest – DONE

direct SMTP infrastructure path operational

previous IMAP model no longer target production path

Delivery:

SMTP and FTP ingest are both infrastructure-controlled and stable

🟢 Phase 2.6 – Product Model \& Provisioning Foundation (DONE)

Goal:
Turn cameras into a real product object with provisioning identity and routing.

Completed decisions:

organizations = tenant / administrative scope

reviers = operational wildlife management scope

cameras belong administratively to organizations

cameras may optionally belong to reviers

cameras.id remains PK

cameras.technical\_name becomes canonical provisioning key

camera\_ingest\_configs becomes routing truth

legacy camera ingest fields remain temporarily for compatibility

technical\_name model – DONE

canonical format established

product-facing technical identity stable

per-organization sequence model – DONE

sequence increments per organization

numbers are not reused

provisioning function – DONE

DB-driven provisioning works end-to-end

provisioning validation – DONE

sequence / routing / token sync confirmed

Delivery:

camera provisioning architecture operational

🟢 Phase 2.7 – Auth \& Multi-Tenant Product Foundation (DONE)

Goal:
Create first real SaaS-style product access model.

Login Layer – DONE

email/password auth active

protected product access works

Protected App Shell – DONE

Protected product areas now require authentication.

Membership Model – DONE (foundation)

organization\_members role model active

MVP roles defined

owner/admin camera setup rule established

Camera Setup UI – DONE (foundation)

/cameras/new exists

organization-context camera creation works

method/vendor/location metadata supported

provisioning result shown directly in UI

Delivery:

first real authenticated product loop operational

🟢 Phase 2.8 – Real Camera Provisioning Validation (DONE)

Goal:
Confirm that product provisioning works end-to-end with real hardware.

Validated flow:

User
→ Login
→ Create Camera
→ Receive provisioning data
→ Configure real camera
→ Trigger capture
→ Image reaches ingest pipeline
→ Asset visible in product surfaces

Validated results:

technical\_name provisioning works

per-organization sequence increments correctly

FTP routing derived automatically from technical\_name

token synchronization confirmed

real FTP camera upload processed successfully

ingest batch visible in UI

asset created correctly

detection pipeline triggered

event clustering triggered

camera health updated

Delivery:

real product loop confirmed operational



🟡 Phase 3 – Visible Intelligence Layer

Phase 3 focuses on exposing intelligence coherently in the product UI.

Event Relevance Scoring – DONE

relevance score active

events ranked meaningfully

Event Feed Upgrade – DONE

/events feels intelligence-aware

Intelligence Dashboard v1 – DONE

dashboard surface exists

main intelligence modules live

currently uses seed dataset

Seed Intelligence Dataset – DONE

realistic dashboard development dataset available

🟡 Remaining Phase 3 Tasks
18.03 – Relevance Model Finalization

Goal:

keep clear MVP relevance concept

decide how much override complexity is needed now

Delivery target:

clean relevance semantics in UI

19.03 – Activity Diagram (Per Camera)

Goal:

camera-level activity visibility

Delivery target:

camera activity insight

20.03 – Species Frequency View

Goal:

simple short-term wildlife trend indication

Delivery target:

lightweight frequency / trend surface

21.03 – Tenant-Aware Product Views

Goal:
Turn auth/provisioning foundation into coherent tenant-aware product surface.

Includes:

visible active organization context

camera views filtered by active organization

event / import / setup views aligned with organization context

Additional requirement:

filtering must be consistent across camera lists, ingest views and event feeds

Delivery target:

first cohesive tenant-aware experience

22.03 – Role Enforcement Pass

Goal:
Ensure critical product actions are consistently role-protected.

Scope:

camera creation

future camera edit/deactivate hooks

relevant API route protection

Delivery target:

owner/admin-only structural actions consistently enforced



🔴 Phase 4 – Wilddruck \& Dashboard
23.03 – Wilddruck Indicator v1

Goal:

basic wildlife pressure indicator

Delivery target:

normalized activity / pressure index per camera

24.03 – Dashboard MVP

Goal:

combine operations + intelligence into usable dashboard

Delivery target:

complete MVP dashboard surface

25.03 – Load \& Stability Test

Goal:

test ingest + worker throughput under meaningful volume

Delivery target:

stress-tested system behavior

26.03 – Query Optimization

Goal:

harden performance for MVP usage

Delivery target:

improved DB/query stability

27.03 – Detection Taxonomy Cleanup

Goal:

final cleanup of output normalization / confidence tuning / “other” policy

Delivery target:

clean detection output for MVP freeze



🟣 Finalization Phase
30.03 – Field Validation Day

Goal:

real camera validation across representative devices

verify provisioning + ingest + product usability

Delivery target:

real-world validation complete

31.03 – Version 1.0 Freeze

Goal:

feature lock

documentation pass

define v2 scope

Delivery target:

Venaris v1.0 complete



🧩 Cross-Cutting Focus

Do continuously:

unified navigation

consistent back navigation

unified relevance concept

no debug language in UI

visible active organization context

keep setup flow product-facing

improve setup result UX without reopening provisioning architecture



📊 MVP Success Criteria (31.03)
Feature	Status
MegaDetector runs automatically	✅
Empty images auto-filtered	✅
Species detection functional	✅
Event clustering active	✅
Event relevance scoring operational	✅
Dashboard usable	⏳
Wilddruck indicator visible	⏳
Monitoring stable	✅
Real hardware validated	⏳
Database-driven camera provisioning working	✅
Login / protected routes working	✅
Organization-based multitenancy foundation active	✅
Role-protected camera setup working	⏳
Tenant-aware UI coherent enough for MVP	⏳
Real camera provisioning loop validated	✅


🚀 After Version 1.0
Version 2.0

population index

trend comparison

seasonal analysis

reporting layer

organization switcher / richer tenant UX

member administration UI

invite flow

cleanup of legacy camera ingest fields

deprovision / disable workflows

Version 3.0

individual animal ID

movement clustering

prediction layer

stronger wildlife intelligence moat



🧠 Strategic Note

Infrastructure is now stable.

Venaris has transitioned from:

transport reliability
→ wildlife intelligence
→ early SaaS product foundation
→ infrastructure-aware camera onboarding

The platform now provides:

multi-source camera ingestion

automated AI wildlife detection

event-based wildlife interpretation

visible ecological intelligence

database-driven camera provisioning

authenticated tenant-aware product access



The main remaining risks are now less about infrastructure uncertainty and more about:

product UX coherence

tenant-aware filtering

dashboard composition

role enforcement completeness



Next focus

Turn wildlife observations into actionable ecological insight
while making the product coherent and operationally usable for real organizations.

