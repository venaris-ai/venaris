// src/lib/materializedEventFeed.ts #3
import { ACTIVE_EVENT_MATERIALIZER_VERSION } from "@/lib/eventMaterializer";

export const MATERIALIZED_EVENT_NORMAL_SELECT = [
  "id",
  "camera_id",
  "start_at",
  "end_at",
  "asset_count",
  "event_species_effective",
  "event_animal_count_effective",
  "event_species_score",
  "event_relevant_effective",
  "legacy_event_ids",
  "materializer_version",
  "materialized_at",
  "created_at",
].join(",");

export type MaterializedEventFeedRow = {
  id: string;
  camera_id: string;
  start_at: string | null;
  end_at: string | null;
  asset_count: number | null;
  event_species_effective: string | null;
  event_animal_count_effective: number | null;
  event_species_score: number | null;
  event_relevant_effective: boolean | null;
  legacy_event_ids: string[] | null;
  materializer_version: string | null;
  materialized_at: string | null;
  created_at: string | null;
};

type MaterializedEventFilterableQuery = {
  eq: (column: string, value: unknown) => MaterializedEventFilterableQuery;
  not: (
    column: string,
    operator: string,
    value: unknown
  ) => MaterializedEventFilterableQuery;
  neq: (column: string, value: unknown) => MaterializedEventFilterableQuery;
};

function asFilterableQuery<TQuery>(query: TQuery) {
  return query as unknown as MaterializedEventFilterableQuery;
}

export function applyReviewableMaterializedEventFilters<TQuery>(
  query: TQuery
): TQuery {
  return asFilterableQuery(query)
    .eq("materializer_version", ACTIVE_EVENT_MATERIALIZER_VERSION)
    .eq("event_relevant_effective", true)
    .not("event_species_effective", "is", null) as unknown as TQuery;
}

export function applyNormalMaterializedEventFilters<TQuery>(
  query: TQuery
): TQuery {
  return asFilterableQuery(applyReviewableMaterializedEventFilters(query))
    .neq("event_species_effective", "other") as unknown as TQuery;
}

export function getMaterializedEventDetailId(
  event: Pick<MaterializedEventFeedRow, "id" | "legacy_event_ids">
) {
  return event.legacy_event_ids?.[0] ?? event.id;
}
