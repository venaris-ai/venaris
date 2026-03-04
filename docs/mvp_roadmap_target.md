Venaris – MVP Roadmap Target (Version 1.0)

Target Delivery: 31.03.2026 (EOD)
Goal: Visible Wildlife Intelligence + Operational Stability

Workdays only (Mon–Fri).
Weekends are intentionally excluded.

🎯 MVP Definition (Version 1.0)

Venaris delivers:

Automatic image classification (empty / animal)

Species recognition (taxonomy v1)

Event clustering

System relevance scoring + manual relevance override (if enabled)

Camera monitoring (health)

Activity intelligence (basic)

Wilddruck indicator (basic)

LTE / Email ingestion (FTP + SMTP + Import)

Operational dashboard

NOT included:

Population model

Individual animal ID

Behavioral prediction

Version 1.0 = work simplification + visible intelligence.

🧱 Layer Completion Targets

Ingestion Layer → 100% stable

Storage Layer → structured lifecycle

Processing Layer → worker orchestration

Intelligence Layer → Detection v1 (MegaDetector + species classifier)

Monitoring Layer → health + KPIs

Application Layer → dashboard + insight views

📆 Execution Plan (Workdays Only)

Start: 04.03.2026
End: 31.03.2026

✅ Phase 1 – Processing Foundation (DONE)

(Asset Lifecycle + Worker Architecture)

📅 04.03 (Wed) – DONE

Asset Status System – Design

lifecycle: queued → processing → processed / failed

assets schema update

remove any detection from ingest

delivery: ingest pipeline writes status only

📅 05.03 (Thu) – DONE

Asset Status System – Implementation

/api/ingest creates assets with status=queued

ingest remains fast & idempotent

delivery: pure ingest → queue model

📅 06.03 (Fri) – DONE

Detection Worker Skeleton – Architecture

runtime decided: Node worker

poll strategy: RPC claim_queued_assets

concurrency + retries concept

delivery: worker design locked

📅 09.03 (Mon) – DONE

Detection Worker Skeleton – Implementation

systemd service on Hetzner

claims queued assets

processing → processed (mock)

errors → failed with retry logic

captured_at fallback fix integrated

delivery: async processing loop running

🟢 Phase 2 – Detection v1 (Core Intelligence)

Chosen Stack (Option A):

Camera → Ingest → MegaDetector → Empty Filter → Species Classifier → Event Clustering → Intelligence

Taxonomy v1: 15 classes (incl. wolf)

📅 10.03 (Tue)

MegaDetector Integration – v1

integrate MegaDetector (animal/human/vehicle)

store detection outputs (bboxes + confidence) in detections / asset_detections

delivery: MegaDetector runs automatically on queued assets

📅 11.03 (Wed)

Empty Filter – v1 (System Decision)

derive empty/non-empty from MegaDetector output

write to assets.empty + assets.empty_confidence

set system relevance automatically:

if empty=true → relevant=false

delivery: automatic empty filtering works reliably

📅 12.03 (Thu)

Species Mapping – Taxonomy v1 + Schema

finalize taxonomy v1 (15 classes):

roe_deer, wild_boar, red_deer, fallow_deer, mouflon,

fox, wolf, badger,

raccoon, raccoon_dog,

hare, rabbit,

pheasant, crow,

other

define minimal detections schema usage:

species/label, confidence, count, bbox

delivery: detection data model finalized

📅 13.03 (Fri)

Species Classifier – Integration

run classifier only if MegaDetector sees animal

store species detections in DB

confidence thresholding v1

delivery: automatic species detection working end-to-end

🟡 Phase 3 – Visible Intelligence Layer
📅 16.03 (Mon)

Event Relevance Scoring v1

score based on:

detection density

species weights (wolf high)

confidence

store in events:

relevance_score_system

delivery: events become ranked

📅 17.03 (Tue)

Event Feed Upgrade

show:

top species + count

confidence hint

sort by relevance_score_system

delivery: feed feels “intelligent”

📅 18.03 (Wed)

Relevance Model Finalization (System vs User)

decision point:

keep only assets.relevant (simple MVP)

OR add assets.relevant_user as override (clean separation)

if override enabled:

effective logic = COALESCE(relevant_user, relevant, true)

delivery: relevance model locked + UI consistent

📅 19.03 (Thu)

Activity Diagram (Per Camera)

hourly activity histogram

split by:

all detections

relevant detections

delivery: first activity visualization

📅 20.03 (Fri)

Species Frequency View (7 / 30 Days)

aggregated species counts

trends (simple deltas)

delivery: species intelligence visible

🔴 Phase 4 – Wilddruck & Dashboard
📅 23.03 (Mon)

Wilddruck Indicator v1

normalized activity index

per camera + aggregated

delivery: basic wilddruck metric

📅 24.03 (Tue)

Dashboard MVP

Includes:

camera health

events (last 7 days)

top species (7/30)

activity graph

wilddruck indicator

Delivery: full operational overview.

📅 25.03 (Wed)

Load & Stability Test

300–500 images batch

worker throughput + retry behavior

DB query load sanity

delivery: system stress-tested

📅 26.03 (Thu)

Query Optimization

index review

event_feed optimization

detection joins tuning

delivery: performance hardened

📅 27.03 (Fri)

Detection Taxonomy Cleanup

label normalization

confidence tuning

“other” policy

delivery: clean detection output

🟣 Finalization Phase
📅 30.03 (Mon)

Field Validation Day

real workflow test on terrace cameras (Reolink/X-View/ZEISS)

motion latency sanity tests (single shot vs burst)

relevance override test

delivery: real-world validated

📅 31.03 (Tue)

Version 1.0 Freeze

feature lock

docs pass (current-state + architecture + dev-notes)

define v2 scope

delivery: Venaris v1.0 complete

🧩 Cross-Cutting (UI Consistency Block)

(we do this in parallel whenever UI causes friction)

single navigation model

remove duplicate Home buttons

consistent back navigation (Events → Event → Back)

unify “Relevant” UI: one concept, one label, one toggle

avoid “debug-like” terms in UI (override/effective) unless in a debug view

📊 MVP Success Criteria (31.03)

By end of month:

MegaDetector runs automatically

Empty images auto-filtered

Species detection functional (taxonomy v1)

Event clustering active

Relevance scoring operational

Dashboard usable

Wilddruck indicator visible

Monitoring stable

Real hardware validated

🚀 After Version 1.0

Version 2.0:

population index

trend comparison

seasonal analysis

reporting layer

Version 3.0:

individual animal ID

movement clustering

prediction layer

wildlife intelligence moat

🧠 Strategic Note

Infra is stable.

From 04.03 onward, Venaris shifts from:

Transport reliability → Visible intelligence

Detection is now the critical path.