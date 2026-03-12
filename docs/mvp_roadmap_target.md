Venaris – MVP Roadmap Target (Version 1.0)

Last updated: 2026-03-12 (Real Camera Provisioning Validation + Direct FTP Flow Confirmed)




Target Delivery: 31.03.2026 (EOD)

Goal: Visible Wildlife Intelligence + Operational Stability + First Real SaaS Product Loop



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



Database-driven camera provisioning



Login / protected product access



Organization-based multitenancy foundation



NOT included:



Population model



Individual animal ID



Behavioral prediction



Self-service billing



Invite / self-service signup flow



Fine-grained permission matrix beyond MVP roles



Version 1.0 = work simplification + visible intelligence + first real product operation



🧱 Layer Completion Targets



Layer | Target

--- | ---

Ingestion Layer | 100% stable

Storage Layer | structured lifecycle + product-ready camera model

Processing Layer | worker orchestration

Intelligence Layer | Detection v1 (MegaDetector + species classifier)

Monitoring Layer | health + KPIs

Application Layer | dashboard + insight views + authenticated product setup



📆 Execution Plan (Workdays Only)



Start: 04.03.2026  

End: 31.03.2026



✅ Phase 1 – Processing Foundation (DONE)



04.03 – DONE



Asset Status System – Design



Lifecycle:



queued → processing → processed / failed



assets schema update



remove detection from ingest



delivery:



ingest pipeline writes status only



05.03 – DONE



Asset Status System – Implementation



/api/ingest creates assets with:



status = queued



Ingest remains:



fast



idempotent



delivery:



pure ingest → queue model



06.03 – DONE



Detection Worker Skeleton – Architecture



Runtime decided:



Node worker



Poll strategy:



claim\_queued\_assets



Retry concept implemented.



delivery:



worker architecture locked.



09.03 – DONE



Detection Worker Skeleton – Implementation



systemd service on Hetzner



Worker now runs real AI pipeline.



Processing loop:



queued → processing → processed



Errors:



failed + retry



delivery:



async AI processing loop running.



🟢 Phase 2 – Detection v1 (Core Intelligence)



Pipeline:



Camera

→ Ingest

→ MegaDetector

→ Empty Filter

→ Species Classifier

→ Event Clustering

→ Intelligence



Taxonomy v1:



15 species



MegaDetector Integration – DONE



Completed earlier (05.03)



MegaDetector detects:



animal



human



vehicle



detections written to DB.



Environment control:



MD\_MIN\_CONF  

MD\_MAX\_DETECTIONS



delivery:



MegaDetector running in production worker.



Empty Filter – DONE



Automatic empty detection:



animal present → relevant=true  

no animals → relevant=false



delivery:



automatic empty filtering working.



Species Mapping – DONE



Taxonomy v1 finalized:



roe\_deer  

wild\_boar  

red\_deer  

fallow\_deer  

mouflon  

fox  

wolf  

badger  

raccoon  

raccoon\_dog  

hare  

rabbit  

pheasant  

crow  

other



detections.species converted to ENUM.



delivery:



detection data model finalized.



Species Classifier – DONE



CLIP classifier integrated.



Logic:



run classifier only if label = animal



Stores:



detections.species



species similarity score



Threshold control:



SPECIES\_SIM\_THRESHOLD  

SPECIES\_BBOX\_PAD



delivery:



species classification working end-to-end.



Accuracy validation ongoing.



🟢 Phase 2.5 – Ingestion Infrastructure Hardening (DONE)



This phase emerged during real hardware integration.



Goal:



Ensure ingestion works reliably with real cameras and field infrastructure.



FTP Gateway – DONE



Hetzner VPS gateway implemented.



Architecture:



Camera

→ FTP

→ Hetzner gateway

→ FTP worker

→ /api/ingest



Features:



per-camera FTP users



chroot isolation



passive FTP



worker polling



automatic delete after ingest



delivery:



stable ingest path for X-View LTE cameras.



Direct SMTP Ingest – DONE



SMTP ingest migrated to direct infrastructure routing.



Architecture:



Camera

→ SMTP

→ MX cams.venaris.io

→ Hetzner Postfix

→ Maildir queue

→ maildir-bridge worker

→ /api/ingest



This replaced the earlier IMAP mailbox polling model.



Advantages:



no external mailbox dependency



infrastructure-controlled ingest



queue-based processing



scalable to many cameras



reliable retry model



Maildir states:



new  

processed  

invalid  

error



delivery:



stable SMTP ingest for camera email delivery.



🟢 Phase 2.6 – Product Model \& Provisioning Foundation (DONE)



This phase was pulled forward because productization became the critical next step.



Goal:



Stabilize Venaris camera setup as a real product object model.



Decisions completed:



organizations = administrative / commercial tenant layer



reviers = operational wildlife management areas



cameras belong administratively to organizations



cameras may optionally be assigned to reviers



cameras.id remains PK



cameras.technical\_name becomes canonical provisioning key



camera\_ingest\_configs becomes routing truth



legacy cameras.ingest\_token and cameras.import\_method remain temporarily for compatibility



technical\_name – DONE



Canonical format introduced:



<organization-slug>-cam-<4-digit-sequence>



Examples:



demo-cam-0001  

test-cam-0005  

heubachwiesen-cam-0001



delivery:



stable technical identity for provisioning and routing.



Per-Organization Sequence Model – DONE



Sequence now increments per organization.



Rules:



numbers never reused



deactivate instead of delete



4-digit sequence as current intended range



delivery:



stable camera naming logic.



Provisioning Function – DONE



Function implemented:



create\_camera\_with\_provisioning()



Responsibilities:



validate organization / optional revier assignment



allocate next sequence



build technical\_name



generate secure token



create camera row



create active ingest config



return provisioning data



delivery:



camera provisioning now works end-to-end via DB function.



Provisioning Validation – DONE



Validated with real test flow.



Confirmed:



technical\_name generation



per-organization sequence increment



organization assignment



optional revier assignment



FTP routing derivation



token synchronization between legacy and config field



delivery:



provisioning architecture operational.



🟢 Phase 2.7 – Auth \& Multi-Tenant Product Foundation (DONE)



This phase was also pulled forward because camera setup should no longer remain in internal-admin mode.



Goal:



Create first real SaaS-style product access model.



Login Layer – DONE



Supabase Auth email/password integrated.



Routes:



/login  

logout route



Behavior:



protected app routes redirect unauthenticated users to login



delivery:



authenticated product access working.



Protected App Shell – DONE



Protected product areas:



/



&nbsp;/cameras



&nbsp;/cameras/new



&nbsp;/events



&nbsp;/intelligence



&nbsp;/import



&nbsp;/ingest



delivery:



application no longer behaves as public/internal-only tool.



Membership Model – DONE (foundation)



organization\_members role model activated.



MVP roles:



owner  

admin  

member  

viewer



Current MVP permission decision:



camera creation only for owner/admin



delivery:



tenant role model defined and usable.



Camera Setup UI – DONE (foundation)



New route:



/cameras/new



Capabilities:



organization-context camera creation



optional revier assignment



method selection



vendor selection



optional location / position / direction / notes



direct provisioning result in UI



delivery:



first real product setup flow operational.



🟢 Phase 2.8 – Real Camera Provisioning Validation (DONE)

This phase validated the full real-world camera setup loop.

Goal:

Confirm that database-driven provisioning works end-to-end with real hardware.

Validated Flow:

User
→ Login
→ Create Camera (/cameras/new)
→ Receive technical provisioning data
→ Configure real camera (FTP / SMTP)
→ Trigger capture
→ Image arrives in ingest pipeline
→ Asset visible in Home + Ingest + Events

Validation Results:

✔ technical_name provisioning works

✔ per-organization sequence increments correctly

✔ FTP routing derived automatically from technical_name

✔ ingest token synchronization between legacy and routing config confirmed

✔ real FTP camera upload successfully processed

✔ ingest batch visible in UI

✔ asset created correctly

✔ detection pipeline triggered

✔ event clustering working

✔ camera health updated

Important product insight:

Camera provisioning is now no longer theoretical or seed-based.
It has been validated with a real hardware ingest cycle.

Delivery:

Real product loop (camera setup → wildlife ingest) confirmed operational.







🟡 Phase 3 – Visible Intelligence Layer



Phase 3 focuses on exposing intelligence to the user interface.



Large parts were implemented earlier during architecture validation.



Event Relevance Scoring – DONE



Event scoring implemented.



Score factors:



species weight



animal count



confidence



detection density



stored in:



events.relevance\_score



delivery:



events ranked by relevance.



Event Feed Upgrade – DONE



/events page upgraded.



Shows:



top species



top count



asset count



camera



relevance score



Events sorted by relevance.



delivery:



event feed feels intelligent.



Intelligence Dashboard v1 – DONE



Route:



/intelligence



Modules implemented:



Species Overview



Where \& When



Activity



Capabilities:



species overview



observed animals



top cameras



top time windows



activity histogram



camera activity



latest wildlife events



Dashboard currently uses seed cameras only.



delivery:



first operational wildlife intelligence dashboard.



Seed Intelligence Dataset – DONE



Script:



scripts/seed-intelligence.mjs



Purpose:



generate realistic wildlife data



test dashboard statistics



enable UI development without AI workers



Dataset includes:



5 seed cameras



~1300 events



realistic species distributions



realistic time-of-day patterns



multi-animal detection simulation



Seed data bypasses AI pipeline intentionally.



delivery:



stable dataset for dashboard development.



🟡 Remaining Phase 3 Tasks



18.03 – Relevance Model Finalization



Decision:



simple MVP model:



assets.relevant



optional future:



assets.relevant\_user override



goal:



clean relevance concept in UI.



19.03 – Activity Diagram (Per Camera)



camera-level activity histogram



split:



all wildlife events



relevant events



delivery:



camera activity insight.



20.03 – Species Frequency View



time windows:



7 days  

30 days



delivery:



simple wildlife trend indicators.



21.03 – Tenant-Aware Product Views



Goal:



Turn the current auth/provisioning foundation into a coherent tenant-aware product surface.



Includes:



active organization context visible in UI



camera views filtered by active organization



relevant event / import / setup views aligned with organization context



delivery:



first cohesive multi-tenant user experience.

Additional requirement identified:

Ensure camera lists, ingest views and event feeds are filtered by active organization context consistently.



22.03 – Role Enforcement Pass



Goal:



Ensure critical product actions are role-protected consistently.



Scope:



camera creation



future camera editing / deactivation hooks



relevant API route protection



delivery:



owner/admin-only setup actions consistently enforced.



🔴 Phase 4 – Wilddruck \& Dashboard



23.03 – Wilddruck Indicator v1



Basic wildlife pressure indicator.



Inputs:



activity density



species weight



time distribution



Output:



normalized activity index per camera.



24.03 – Dashboard MVP



Final dashboard includes:



camera health



events (recent)



top species



activity graphs



wilddruck indicator



delivery:



complete operational dashboard.



25.03 – Load \& Stability Test



Simulate:



300–500 images



Verify:



worker throughput



retry behavior



DB query load



delivery:



system stress-tested.



26.03 – Query Optimization



Review:



DB indexes



event\_feed queries



detection joins



goal:



performance hardening.



27.03 – Detection Taxonomy Cleanup



Final cleanup:



label normalization



confidence tuning



“other” classification policy



delivery:



clean detection output.



🟣 Finalization Phase



30.03 – Field Validation Day



Real camera validation.



Hardware:



Reolink



X-View



ZEISS



Tests:



motion trigger latency



burst vs single-shot



relevance override



camera setup / provisioning flow



role-protected camera creation flow



delivery:



real-world validation complete.



31.03 – Version 1.0 Freeze



Tasks:



feature lock



documentation pass



define v2 scope



delivery:



Venaris v1.0 complete.



🧩 Cross-Cutting (UI Consistency Block)



Do continuously:



unified navigation



consistent back navigation



unified relevance concept



avoid debug language in UI



make active organization context visible



keep camera setup flow product-facing, not internal-admin-like



📊 MVP Success Criteria (31.03)



By end of month:



Feature | Status

--- | ---

MegaDetector runs automatically | ✅

Empty images auto-filtered | ✅

Species detection functional | ✅

Event clustering active | ✅

Event relevance scoring operational | ✅

Dashboard usable | ⏳

Wilddruck indicator visible | ⏳

Monitoring stable | ✅

Real hardware validated | ⏳

Database-driven camera provisioning working | ✅

Login / protected routes working | ✅

Organization-based multitenancy foundation active | ✅

Role-protected camera setup working | ⏳

Tenant-aware UI coherent enough for MVP | ⏳

Real camera provisioning loop validated | ✅



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



Version 3.0



individual animal ID



movement clustering



prediction layer



wildlife intelligence moat



🧠 Strategic Note



Infrastructure is now stable.



Venaris has transitioned from:



transport reliability

→ wildlife intelligence

→ early SaaS product foundation



The platform now provides:



multi-source camera ingestion



automated AI wildlife detection



event-based wildlife interpretation



visible ecological intelligence



database-driven camera provisioning



authenticated tenant-aware product access



Next focus:



turning wildlife observations into actionable ecological insights

while making the product operationally usable for real organizations.


Real-world ingest validation has reduced the main remaining risks
from infrastructure uncertainty to product UX and tenant coherence.

The next stability gains will come from:

organization-context visibility
role enforcement completeness
tenant-aware filtering
dashboard consolidation




