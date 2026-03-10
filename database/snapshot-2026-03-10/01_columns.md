# SQL1 - Columns

```text
| table_name            | column_name           | data_type                |
| --------------------- | --------------------- | ------------------------ |
| asset_detections      | id                    | uuid                     |
| asset_detections      | asset_id              | uuid                     |
| asset_detections      | model                 | text                     |
| asset_detections      | model_version         | text                     |
| asset_detections      | created_at            | timestamp with time zone |
| asset_detections      | is_empty              | boolean                  |
| asset_detections      | has_animal            | boolean                  |
| asset_detections      | has_person            | boolean                  |
| asset_detections      | has_vehicle           | boolean                  |
| asset_detections      | best_animal_conf      | real                     |
| asset_detections      | best_person_conf      | real                     |
| asset_detections      | best_vehicle_conf     | real                     |
| asset_detections      | raw                   | jsonb                    |
| asset_species_summary | asset_id              | uuid                     |
| asset_species_summary | species               | USER-DEFINED             |
| asset_species_summary | animal_count          | integer                  |
| asset_species_summary | best_score            | real                     |
| assets                | id                    | uuid                     |
| assets                | camera_id             | uuid                     |
| assets                | captured_at           | timestamp with time zone |
| assets                | storage_path          | text                     |
| assets                | file_hash             | text                     |
| assets                | status                | text                     |
| assets                | created_at            | timestamp with time zone |
| assets                | relevant              | boolean                  |
| assets                | ingest_batch_id       | uuid                     |
| assets                | attempts              | integer                  |
| assets                | processing_started_at | timestamp with time zone |
| assets                | processed_at          | timestamp with time zone |
| assets                | last_error            | text                     |
| assets                | worker_id             | text                     |
| assets                | empty                 | boolean                  |
| assets                | empty_confidence      | real                     |
| assets_v              | id                    | uuid                     |
| assets_v              | camera_id             | uuid                     |
| assets_v              | captured_at           | timestamp with time zone |
| assets_v              | storage_path          | text                     |
| assets_v              | file_hash             | text                     |
| assets_v              | status                | text                     |
| assets_v              | created_at            | timestamp with time zone |
| assets_v              | relevant              | boolean                  |
| assets_v              | ingest_batch_id       | uuid                     |
| assets_v              | attempts              | integer                  |
| assets_v              | processing_started_at | timestamp with time zone |
| assets_v              | processed_at          | timestamp with time zone |
| assets_v              | last_error            | text                     |
| assets_v              | worker_id             | text                     |
| assets_v              | empty                 | boolean                  |
| assets_v              | empty_confidence      | real                     |
| assets_v              | relevant_effective    | boolean                  |
| camera_health         | id                    | uuid                     |
| camera_health         | name                  | text                     |
| camera_health         | import_method         | text                     |
| camera_health         | last_seen_at          | timestamp with time zone |
| camera_health         | stale_after_minutes   | integer                  |
| camera_health         | offline_after_minutes | integer                  |
| camera_health         | health_status         | text                     |
| camera_health_rules   | import_method         | text                     |
| camera_health_rules   | stale_after_minutes   | integer                  |
| camera_health_rules   | offline_after_minutes | integer                  |
| camera_health_rules   | created_at            | timestamp with time zone |
| cameras               | id                    | uuid                     |
| cameras               | revier_id             | uuid                     |
| cameras               | name                  | text                     |
| cameras               | location_name         | text                     |
| cameras               | import_method         | text                     |
| cameras               | ingest_token          | text                     |
| cameras               | created_at            | timestamp with time zone |
| cameras               | last_seen_at          | timestamp with time zone |
| detections            | id                    | uuid                     |
| detections            | asset_id              | uuid                     |
| detections            | label                 | text                     |
| detections            | species               | USER-DEFINED             |
| detections            | count                 | integer                  |
| detections            | score                 | real                     |
| detections            | meta                  | jsonb                    |
| detections            | created_at            | timestamp with time zone |
| event_assets          | event_id              | uuid                     |
| event_assets          | asset_id              | uuid                     |
| event_feed            | id                    | uuid                     |
| event_feed            | camera_id             | uuid                     |
| event_feed            | start_at              | timestamp with time zone |
| event_feed            | end_at                | timestamp with time zone |
| event_feed            | top_label             | text                     |
| event_feed            | top_species           | text                     |
| event_feed            | top_count             | integer                  |
| event_feed            | relevance_score       | real                     |
| event_feed            | created_at            | timestamp with time zone |
| event_feed            | asset_count           | integer                  |
| event_species_summary | event_id              | uuid                     |
| event_species_summary | species               | USER-DEFINED             |
| event_species_summary | event_species_count   | integer                  |
| event_species_summary | best_score            | real                     |
| events                | id                    | uuid                     |
| events                | camera_id             | uuid                     |
| events                | start_at              | timestamp with time zone |
| events                | end_at                | timestamp with time zone |
| events                | top_label             | text                     |
| events                | top_species           | text                     |
| events                | top_count             | integer                  |
