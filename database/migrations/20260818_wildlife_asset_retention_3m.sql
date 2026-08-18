-- Keep original wildlife images for three months after ingest, while preserving
-- the existing shorter retention rules for empty/irrelevant and security assets.
-- Structured asset/detection/event data is not deleted by this policy.

create or replace function public.apply_wildlife_asset_retention_3m()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.storage_deleted_at is null
     and new.status = 'processed'
     and coalesce(new.relevant_user, new.relevant, false) = true
     and new.storage_delete_after is null
  then
    -- Security images intentionally keep their shorter retention even if a later
    -- manual review marks them relevant. The application currently clears a
    -- pending delete schedule when relevance is corrected, so restore it here.
    if coalesce(old.storage_delete_reason, '') in (
      'security_detection',
      'security_detection_disabled'
    ) and old.storage_delete_after is not null
    then
      new.storage_delete_after := old.storage_delete_after;
      new.storage_delete_reason := old.storage_delete_reason;
      new.storage_delete_error := old.storage_delete_error;
    else
      new.storage_delete_after := new.created_at + interval '3 months';
      new.storage_delete_reason := 'wildlife_retention_3m';
      new.storage_delete_error := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assets_wildlife_retention_3m on public.assets;

create trigger trg_assets_wildlife_retention_3m
before update of status, relevant, relevant_user, storage_delete_after,
  storage_delete_reason, storage_deleted_at
on public.assets
for each row
execute function public.apply_wildlife_asset_retention_3m();

-- Backfill existing non-demo wildlife assets that do not yet have a deletion
-- schedule. Assets already older than three months receive a 30-day rollout
-- grace period instead of being deleted immediately when the policy goes live.
update public.assets as a
set
  storage_delete_after = case
    when a.created_at + interval '3 months' <= now()
      then now() + interval '30 days'
    else a.created_at + interval '3 months'
  end,
  storage_delete_reason = 'wildlife_retention_3m',
  storage_delete_error = null
from public.cameras as c
join public.organizations as o on o.id = c.organization_id
where c.id = a.camera_id
  and o.is_demo = false
  and a.status = 'processed'
  and coalesce(a.relevant_user, a.relevant, false) = true
  and a.storage_deleted_at is null
  and a.storage_delete_after is null;
