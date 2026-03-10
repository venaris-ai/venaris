# SQL3 - Views

```text
| table_name            | view_definition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| asset_species_summary |  SELECT asset_id,
    species,
    (count(DISTINCT (meta ->> 'md_idx'::text)))::integer AS animal_count,
    max(score) AS best_score
   FROM detections d
  WHERE ((label = 'animal'::text) AND (species IS NOT NULL))
  GROUP BY asset_id, species;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| event_species_summary |  SELECT ea.event_id,
    s.species,
    max(s.animal_count) AS event_species_count,
    max(s.best_score) AS best_score
   FROM (event_assets ea
     JOIN asset_species_summary s ON ((s.asset_id = ea.asset_id)))
  GROUP BY ea.event_id, s.species;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| event_feed            |  SELECT e.id,
    e.camera_id,
    e.start_at,
    e.end_at,
    e.top_label,
    e.top_species,
    e.top_count,
    e.relevance_score,
    e.created_at,
    (count(ea.asset_id))::integer AS asset_count
   FROM (events e
     LEFT JOIN event_assets ea ON ((ea.event_id = e.id)))
  GROUP BY e.id;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| camera_health         |  WITH defaults AS (
         SELECT 60 AS stale_after_minutes_default,
            1440 AS offline_after_minutes_default
        )
 SELECT c.id,
    c.name,
    c.import_method,
    c.last_seen_at,
    COALESCE(r.stale_after_minutes, d.stale_after_minutes_default) AS stale_after_minutes,
    COALESCE(r.offline_after_minutes, d.offline_after_minutes_default) AS offline_after_minutes,
        CASE
            WHEN (c.last_seen_at IS NULL) THEN 'unknown'::text
            WHEN ((now() - c.last_seen_at) < make_interval(mins => COALESCE(r.stale_after_minutes, d.stale_after_minutes_default))) THEN 'online'::text
            WHEN ((now() - c.last_seen_at) < make_interval(mins => COALESCE(r.offline_after_minutes, d.offline_after_minutes_default))) THEN 'stale'::text
            ELSE 'offline'::text
        END AS health_status
   FROM ((cameras c
     LEFT JOIN camera_health_rules r ON ((r.import_method = c.import_method)))
     CROSS JOIN defaults d); |
| assets_v              |  SELECT id,
    camera_id,
    captured_at,
    storage_path,
    file_hash,
    status,
    created_at,
    relevant,
    ingest_batch_id,
    attempts,
    processing_started_at,
    processed_at,
    last_error,
    worker_id,
    empty,
    empty_confidence,
    COALESCE(relevant, true) AS relevant_effective
   FROM assets a;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |