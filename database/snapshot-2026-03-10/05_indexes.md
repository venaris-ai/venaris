# SQL5 - Indexes

```text
| indexname                     | indexdef                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| species_weights_pkey          | CREATE UNIQUE INDEX species_weights_pkey ON public.species_weights USING btree (species)                    |
| reviers_pkey                  | CREATE UNIQUE INDEX reviers_pkey ON public.reviers USING btree (id)                                         |
| cameras_pkey                  | CREATE UNIQUE INDEX cameras_pkey ON public.cameras USING btree (id)                                         |
| detections_pkey               | CREATE UNIQUE INDEX detections_pkey ON public.detections USING btree (id)                                   |
| detections_asset_id_idx       | CREATE INDEX detections_asset_id_idx ON public.detections USING btree (asset_id)                            |
| detections_species_idx        | CREATE INDEX detections_species_idx ON public.detections USING btree (species)                              |
| events_pkey                   | CREATE UNIQUE INDEX events_pkey ON public.events USING btree (id)                                           |
| events_camera_end_idx         | CREATE INDEX events_camera_end_idx ON public.events USING btree (camera_id, end_at DESC)                    |
| event_assets_pkey             | CREATE UNIQUE INDEX event_assets_pkey ON public.event_assets USING btree (event_id, asset_id)               |
| event_assets_unique           | CREATE UNIQUE INDEX event_assets_unique ON public.event_assets USING btree (event_id, asset_id)             |
| ingest_batches_pkey           | CREATE UNIQUE INDEX ingest_batches_pkey ON public.ingest_batches USING btree (id)                           |
| idx_batches_camera_received   | CREATE INDEX idx_batches_camera_received ON public.ingest_batches USING btree (camera_id, received_at DESC) |
| idx_ingest_batches_meta       | CREATE INDEX idx_ingest_batches_meta ON public.ingest_batches USING gin (meta)                              |
| camera_health_rules_pkey      | CREATE UNIQUE INDEX camera_health_rules_pkey ON public.camera_health_rules USING btree (import_method)      |
| assets_pkey                   | CREATE UNIQUE INDEX assets_pkey ON public.assets USING btree (id)                                           |
| idx_assets_camera_created     | CREATE INDEX idx_assets_camera_created ON public.assets USING btree (camera_id, created_at DESC)            |
| assets_camera_created_idx     | CREATE INDEX assets_camera_created_idx ON public.assets USING btree (camera_id, created_at DESC)            |
| idx_assets_status_created     | CREATE INDEX idx_assets_status_created ON public.assets USING btree (status, created_at)                    |
| idx_assets_processing_started | CREATE INDEX idx_assets_processing_started ON public.assets USING btree (status, processing_started_at)     |
| asset_detections_pkey         | CREATE UNIQUE INDEX asset_detections_pkey ON public.asset_detections USING btree (id)                       |
| asset_detections_asset_id_idx | CREATE INDEX asset_detections_asset_id_idx ON public.asset_detections USING btree (asset_id)                |
