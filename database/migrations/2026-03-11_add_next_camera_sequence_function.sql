-- Atomically reserve next camera number per organization
-- Date: 2026-03-11

create or replace function public.next_camera_sequence(p_organization_id uuid)
returns integer
language plpgsql
as $$
declare
  v_next integer;
begin
  insert into public.organization_camera_sequences (organization_id, last_sequence, updated_at)
  values (p_organization_id, 0, now())
  on conflict (organization_id) do nothing;

  update public.organization_camera_sequences
  set
    last_sequence = last_sequence + 1,
    updated_at = now()
  where organization_id = p_organization_id
  returning last_sequence into v_next;

  if v_next is null then
    raise exception 'Could not allocate camera sequence for organization %', p_organization_id;
  end if;

  return v_next;
end;
$$;