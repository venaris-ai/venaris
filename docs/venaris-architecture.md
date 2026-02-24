\# Venaris – Architecture (MVP)



\## 🎯 Vision



Venaris is a wildlife data platform.

Cameras are sensors — not the product.

The product is structured wildlife intelligence.



---



\## 🏗 System Overview



\### Storage

\- Supabase Storage bucket: `camera-assets`



\### Database Tables



\#### reviers

Hunting areas.



\#### cameras

\- id

\- revier\_id

\- name

\- location\_name

\- ingest\_token

\- last\_seen\_at



\#### assets

\- id

\- camera\_id

\- storage\_path

\- file\_hash

\- status

\- relevant

\- created\_at

\- ingest\_batch\_id (recommended)



\#### detections

\- asset\_id

\- label

\- species

\- count

\- score

\- meta



\#### events

Aggregated wildlife events per camera.



\#### event\_assets

Join table between events and assets.



---



\## 🔌 API Routes



\### POST /api/upload

\- multipart: file, cameraId

\- stores file in storage

\- inserts row in `assets`

\- updates camera `last\_seen\_at`



\### GET /api/asset-url

\- returns signed preview URL



\### POST /api/asset-relevant

\- updates `assets.relevant`



---



\## 🧠 Relevance Model



Current:

\- Boolean `relevant`



Planned:

\- `relevance\_score` (system)

\- `user\_relevant` (manual override)



---



\## 🔜 Next Planned Steps



1\. Ingest batches

2\. Token-based ingestion

3\. Camera onboarding UI

4\. Event clustering logic

