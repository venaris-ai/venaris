# SQL13 - Species Weights Columns

```text
| table_name      | column_name | data_type                | is_nullable | column_default |
| --------------- | ----------- | ------------------------ | ----------- | -------------- |
| species_weights | species     | USER-DEFINED             | NO          | null           |
| species_weights | weight      | real                     | NO          | null           |
| species_weights | active      | boolean                  | NO          | true           |
| species_weights | notes       | text                     | YES         | null           |
| species_weights | updated_at  | timestamp with time zone | NO          | now()          |
