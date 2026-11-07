-- READ ONLY: Phase 8B private screenshot storage inventory.
-- Run on staging/production only after the 8B Storage bucket and metadata exist.
-- Returns aggregate counts and byte totals, not source paths, hashes or user IDs.
-- Unlinked Storage objects may remain after failed attachments; this does not delete them.
with stored as (
  select o.name, o.created_at, coalesce((o.metadata->>'size')::bigint,0) as bytes
  from storage.objects o
  where o.bucket_id = 'tournament-sources'
), linked as (
  select s.name, s.created_at, s.bytes, a.id is not null as has_metadata
  from stored s left join public.screenshot_assets a on a.object_path = s.name
)
select
  count(*) as stored_objects,
  count(*) filter (where has_metadata) as linked_objects,
  count(*) filter (where not has_metadata) as unlinked_objects,
  coalesce(sum(bytes),0) as estimated_stored_bytes,
  coalesce(sum(bytes) filter (where not has_metadata),0) as estimated_unlinked_bytes,
  count(*) filter (where not has_metadata and created_at < now() - interval '24 hours') as unlinked_older_than_24h
from linked;
