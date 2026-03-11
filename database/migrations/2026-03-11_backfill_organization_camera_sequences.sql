-- Backfill per-organization sequence state from existing cameras
-- Date: 2026-03-11

insert into public.organization_camera_sequences (
  organization_id,
  last_sequence,
  updated_at
)
select
  r.organization_id,
  coalesce(
    max(
      case
        when c.technical_name ~ '-cam-[0-9]{4}$'
          then right(c.technical_name, 4)::integer
        else 0
      end
    ),
    0
  ) as last_sequence,
  now()
from public.cameras c
join public.reviers r
  on r.id = c.revier_id
where r.organization_id is not null
group by r.organization_id
on conflict (organization_id) do update
set
  last_sequence = excluded.last_sequence,
  updated_at = now();