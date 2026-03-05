Venaris – MVP Roadmap Target (Version 1.0)

Target Delivery: 31.03.2026 (EOD)
Goal: Visible Wildlife Intelligence + Operational Stability
Workdays only (Mon–Fri). Weekends excluded.

🎯 MVP Definition (Version 1.0)

Venaris delivers:

Automatic image classification (empty / non-empty)

Species recognition (taxonomy v1)

Event clustering

System relevance scoring (system) + manual relevance override (UI)

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

Start: 04.03.2026 (Wed)
End: 31.03.2026 (Tue)

✅ Phase 1 – Processing Foundation (DONE)
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

📅 06.03 (Fri) – DONE (as designed earlier; implementation already live)

Detection Worker Skeleton – Architecture

runtime decided: Node worker

poll strategy: RPC claim_queued_assets

retries concept

delivery: worker design locked

📅 09.03 (Mon) – DONE (system running + verified)

Detection Worker Skeleton – Implementation

systemd service on Hetzner

claims queued assets

processing → processed (real pipeline now; no longer mock)

errors → failed with retry logic

captured_at fallback + EXIF backfill strategy integrated

delivery: async processing loop running

🟢 Phase 2 – Detection v1 (Core Intelligence)

Chosen Stack (Option A):
Camera → Ingest → MegaDetector → Empty Filter → Species Classifier → Event Clustering → Intelligence

Taxonomy v1: 15 classes (incl. wolf)

📅 10.03 (Tue) – DONE (completed early on 05.03)

MegaDetector Integration – v1

integrate MegaDetector (animal/human/vehicle)

store detection outputs (bboxes + confidence) in detections

delivery: MegaDetector runs automatically on queued assets ✅

Notes from production run (05.03):

worker processed large backlog (hundreds of assets)

MD thresholds managed via env: MD_MIN_CONF, MD_MAX_DETECTIONS

📅 11.03 (Wed) – DONE (completed early on 05.03)

Empty Filter – v1 (System Decision)

derive empty/non-empty from MegaDetector output

write to assets.empty + assets.empty_confidence

set system relevance automatically: empty=true → relevant=false

delivery: automatic empty filtering works ✅

📅 12.03 (Thu) – DONE (completed early on 05.03)

Species Mapping – Taxonomy v1 + Schema

taxonomy v1 finalized (15 classes):

roe_deer, wild_boar, red_deer, fallow_deer, mouflon

fox, wolf, badger

raccoon, raccoon_dog

hare, rabbit

pheasant, crow

other

DB schema aligned:

detections.species converted to ENUM taxonomy_species_v1

delivery: detection data model finalized ✅

📅 13.03 (Fri) – DONE (integration completed early on 05.03; accuracy validation pending)

Species Classifier – Integration (Option A / CLIP)

run classifier only if MegaDetector sees animal

store species in DB (detections.species)

store similarity score (e.g. species_sim) for debugging/QA

thresholding v1:

SPECIES_SIM_THRESHOLD

bbox padding via SPECIES_BBOX_PAD

SPECIES_SPECIES_SOFTMAX=0 (score = sim, consistent)

delivery: automatic species detection working end-to-end ✅

Open validation (planned for 06–10.03):

quantify misclassifications (e.g. grill→vehicle, boar→roe_deer)

add UI for human verification

🟡 Phase 3 – Visible Intelligence Layer
📅 16.03 (Mon)

Event Relevance Scoring v1

score based on:

detection density

species weights (wolf high)

confidence

store in events: relevance_score_system

delivery: events become ranked

📅 17.03 (Tue)

Event Feed Upgrade

show:

top species + count

confidence hint

sort by relevance_score_system

delivery: feed feels intelligent

📅 18.03 (Wed)

Relevance Model Finalization (System vs User)
Decision point:

keep only assets.relevant (simple MVP)
OR

add assets.relevant_user override (clean separation)

If override enabled:

effective logic = COALESCE(relevant_user, relevant, true)

Delivery: relevance model locked + UI consistent

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
Delivery: full operational overview

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

docs pass (current-state + architecture + dev-notes + roadmap)

define v2 scope
delivery: Venaris v1.0 complete

🧩 Cross-Cutting (UI Consistency Block)

Do in parallel whenever UI causes friction:

single navigation model

consistent back navigation (Events → Event → Back)

unify “Relevant” UI: one concept, one label, one toggle

avoid “debug-like” terms in UI unless in debug view

📊 MVP Success Criteria (31.03)

By end of month:

MegaDetector runs automatically ✅

Empty images auto-filtered ✅

Species detection functional (taxonomy v1) ✅ (accuracy validation pending)

Event clustering active ✅

Relevance scoring operational (event-level) ⏳

Dashboard usable ⏳

Wilddruck indicator visible ⏳

Monitoring stable ✅

Real hardware validated ⏳

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