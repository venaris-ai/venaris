# SQL6 - Policies

```text
| schemaname | tablename           | policyname                 | permissive | roles                | cmd    | qual  | with_check |
| ---------- | ------------------- | -------------------------- | ---------- | -------------------- | ------ | ----- | ---------- |
| public     | reviers             | deny all (anon/auth)       | PERMISSIVE | {anon,authenticated} | ALL    | false | false      |
| public     | cameras             | deny all (anon/auth)       | PERMISSIVE | {anon,authenticated} | ALL    | false | false      |
| public     | detections          | deny all (anon/auth)       | PERMISSIVE | {anon,authenticated} | ALL    | false | false      |
| public     | events              | deny all (anon/auth)       | PERMISSIVE | {anon,authenticated} | ALL    | false | false      |
| public     | event_assets        | deny all (anon/auth)       | PERMISSIVE | {anon,authenticated} | ALL    | false | false      |
| public     | ingest_batches      | deny all (anon/auth)       | PERMISSIVE | {anon,authenticated} | ALL    | false | false      |
| public     | camera_health_rules | read rules (authenticated) | PERMISSIVE | {authenticated}      | SELECT | true  | null       |
| public     | assets              | deny all (anon/auth)       | PERMISSIVE | {anon,authenticated} | ALL    | false | false      |
| public     | asset_detections    | deny all                   | PERMISSIVE | {anon,authenticated} | ALL    | false | false      |
