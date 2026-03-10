# SQL8 - Constraints

```text
| table_name          | constraint_name                | constraint_type | column_name     | foreign_table_name  | foreign_column_name |
| ------------------- | ------------------------------ | --------------- | --------------- | ------------------- | ------------------- |
| asset_detections    | 2200_30025_1_not_null          | CHECK           | null            | null                | null                |
| asset_detections    | 2200_30025_2_not_null          | CHECK           | null            | null                | null                |
| asset_detections    | 2200_30025_3_not_null          | CHECK           | null            | null                | null                |
| asset_detections    | 2200_30025_5_not_null          | CHECK           | null            | null                | null                |
| asset_detections    | 2200_30025_6_not_null          | CHECK           | null            | null                | null                |
| asset_detections    | 2200_30025_7_not_null          | CHECK           | null            | null                | null                |
| asset_detections    | 2200_30025_8_not_null          | CHECK           | null            | null                | null                |
| asset_detections    | 2200_30025_9_not_null          | CHECK           | null            | null                | null                |
| asset_detections    | asset_detections_asset_id_fkey | FOREIGN KEY     | asset_id        | assets              | id                  |
| asset_detections    | asset_detections_pkey          | PRIMARY KEY     | id              | asset_detections    | id                  |
| assets              | 2200_17477_11_not_null         | CHECK           | null            | null                | null                |
| assets              | 2200_17477_1_not_null          | CHECK           | null            | null                | null                |
| assets              | 2200_17477_2_not_null          | CHECK           | null            | null                | null                |
| assets              | 2200_17477_4_not_null          | CHECK           | null            | null                | null                |
| assets              | 2200_17477_6_not_null          | CHECK           | null            | null                | null                |
| assets              | 2200_17477_7_not_null          | CHECK           | null            | null                | null                |
| assets              | 2200_17477_9_not_null          | CHECK           | null            | null                | null                |
| assets              | assets_status_check            | CHECK           | null            | assets              | status              |
| assets              | assets_camera_id_fkey          | FOREIGN KEY     | camera_id       | cameras             | id                  |
| assets              | assets_ingest_batch_id_fkey    | FOREIGN KEY     | ingest_batch_id | ingest_batches      | id                  |
| assets              | assets_pkey                    | PRIMARY KEY     | id              | assets              | id                  |
| camera_health_rules | 2200_24386_1_not_null          | CHECK           | null            | null                | null                |
| camera_health_rules | 2200_24386_2_not_null          | CHECK           | null            | null                | null                |
| camera_health_rules | 2200_24386_3_not_null          | CHECK           | null            | null                | null                |
| camera_health_rules | 2200_24386_4_not_null          | CHECK           | null            | null                | null                |
| camera_health_rules | camera_health_rules_pkey       | PRIMARY KEY     | import_method   | camera_health_rules | import_method       |
| cameras             | 2200_17462_1_not_null          | CHECK           | null            | null                | null                |
| cameras             | 2200_17462_2_not_null          | CHECK           | null            | null                | null                |
| cameras             | 2200_17462_3_not_null          | CHECK           | null            | null                | null                |
| cameras             | 2200_17462_5_not_null          | CHECK           | null            | null                | null                |
| cameras             | 2200_17462_6_not_null          | CHECK           | null            | null                | null                |
| cameras             | 2200_17462_7_not_null          | CHECK           | null            | null                | null                |
| cameras             | cameras_revier_id_fkey         | FOREIGN KEY     | revier_id       | reviers             | id                  |
| cameras             | cameras_pkey                   | PRIMARY KEY     | id              | cameras             | id                  |
| detections          | 2200_17492_1_not_null          | CHECK           | null            | null                | null                |
| detections          | 2200_17492_2_not_null          | CHECK           | null            | null                | null                |
| detections          | 2200_17492_3_not_null          | CHECK           | null            | null                | null                |
| detections          | 2200_17492_8_not_null          | CHECK           | null            | null                | null                |
| detections          | detections_asset_id_fkey       | FOREIGN KEY     | asset_id        | assets              | id                  |
| detections          | detections_pkey                | PRIMARY KEY     | id              | detections          | id                  |
| event_assets        | 2200_17521_1_not_null          | CHECK           | null            | null                | null                |
| event_assets        | 2200_17521_2_not_null          | CHECK           | null            | null                | null                |
| event_assets        | event_assets_asset_id_fkey     | FOREIGN KEY     | asset_id        | assets              | id                  |
| event_assets        | event_assets_event_id_fkey     | FOREIGN KEY     | event_id        | events              | id                  |
| event_assets        | event_assets_pkey              | PRIMARY KEY     | event_id        | event_assets        | event_id            |
| event_assets        | event_assets_pkey              | PRIMARY KEY     | asset_id        | event_assets        | asset_id            |
| event_assets        | event_assets_pkey              | PRIMARY KEY     | asset_id        | event_assets        | event_id            |
| event_assets        | event_assets_pkey              | PRIMARY KEY     | event_id        | event_assets        | asset_id            |
| events              | 2200_17506_1_not_null          | CHECK           | null            | null                | null                |
| events              | 2200_17506_2_not_null          | CHECK           | null            | null                | null                |
| events              | 2200_17506_3_not_null          | CHECK           | null            | null                | null                |
| events              | 2200_17506_4_not_null          | CHECK           | null            | null                | null                |
| events              | 2200_17506_8_not_null          | CHECK           | null            | null                | null                |
| events              | 2200_17506_9_not_null          | CHECK           | null            | null                | null                |
| events              | events_camera_id_fkey          | FOREIGN KEY     | camera_id       | cameras             | id                  |
| events              | events_pkey                    | PRIMARY KEY     | id              | events              | id                  |
| ingest_batches      | 2200_21998_1_not_null          | CHECK           | null            | null                | null                |
| ingest_batches      | ingest_batches_camera_id_fkey  | FOREIGN KEY     | camera_id       | cameras             | id                  |
| ingest_batches      | ingest_batches_pkey            | PRIMARY KEY     | id              | ingest_batches      | id                  |
| reviers             | 2200_17453_1_not_null          | CHECK           | null            | null                | null                |
| reviers             | 2200_17453_2_not_null          | CHECK           | null            | null                | null                |
| reviers             | 2200_17453_5_not_null          | CHECK           | null            | null                | null                |
| reviers             | reviers_pkey                   | PRIMARY KEY     | id              | reviers             | id                  |
| species_weights     | 2200_35724_1_not_null          | CHECK           | null            | null                | null                |
| species_weights     | 2200_35724_2_not_null          | CHECK           | null            | null                | null                |
| species_weights     | 2200_35724_3_not_null          | CHECK           | null            | null                | null                |
| species_weights     | 2200_35724_5_not_null          | CHECK           | null            | null                | null                |
| species_weights     | species_weights_pkey           | PRIMARY KEY     | species         | species_weights     | species             |
