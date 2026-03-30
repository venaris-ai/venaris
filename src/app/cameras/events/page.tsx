// src/app/cameras/events/page.tsx #4
export const runtime = "nodejs";

import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { requirePathAccess } from "@/lib/authz";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";

type SearchParams = {
  revier?: string;
};

type RevierRow = {
  id: string;
  name: string;
};

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("de-DE");
}

function prettySpecies(value: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ");
}

function scoreBadge(score: number | null) {
  if (typeof score !== "number") return "—";
  if (score >= 0.9) return "very high";
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

export default async function CameraEventsPage(props: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const ctx = await requirePathAccess("/cameras/events");
  const activeOrganization = ctx.activeMembership?.organizations;
  const searchParams = props?.searchParams
    ? await Promise.resolve(props.searchParams)
    : undefined;
  const rawRevier = searchParams?.revier;

  if (!activeOrganization) {
    return (
      <main className="space-y-6">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Events
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">Events</h1>
          <p className="mt-2 text-sm text-white/68">
            Priorisierte Event-Zusammenfassungen
          </p>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          Active organization not found.
        </div>
      </main>
    );
  }

  const supabase = supabaseServer();

  const { data: reviersData, error: reviersError } = await supabase
    .from("reviers")
    .select("id,name")
    .eq("organization_id", activeOrganization.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (reviersError) {
    return (
      <main className="space-y-6">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Events
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">Events</h1>
          <p className="mt-2 text-sm text-white/68">
            Priorisierte Event-Zusammenfassungen
          </p>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          Fehler: {reviersError.message}
        </div>
      </main>
    );
  }

  const reviers = (reviersData ?? []) as RevierRow[];
  const allowedReviers: RevierOption[] = reviers.map((revier) => ({
    id: revier.id,
    name: revier.name,
  }));
  const revierScope = resolveRevierScope(rawRevier, allowedReviers);
  const allowedRevierIds = allowedReviers.map((revier) => revier.id);

  const scopeLabel =
    revierScope.type === "single"
      ? reviers.find((r) => r.id === revierScope.revierId)?.name ?? "Ein Revier"
      : "Alle aktiven Reviere";

  if (allowedRevierIds.length === 0) {
    return (
      <main className="space-y-6">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
                Events
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">Events</h1>
              <p className="mt-2 text-sm text-white/68">
                Priorisierte Event-Zusammenfassungen nach Relevanz
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/72">
              {scopeLabel}
            </div>
          </div>
        </section>

        <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
          Noch keine Events vorhanden.
        </div>
      </main>
    );
  }

  let camerasQuery = supabase
    .from("cameras")
    .select("id,name,location_name")
    .eq("organization_id", activeOrganization.id);

  camerasQuery =
    revierScope.type === "single"
      ? camerasQuery.eq("revier_id", revierScope.revierId)
      : camerasQuery.in("revier_id", allowedRevierIds);

  const { data: cameras, error: camerasError } = await camerasQuery;

  if (camerasError) {
    return (
      <main className="space-y-6">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Events
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">Events</h1>
          <p className="mt-2 text-sm text-white/68">
            Priorisierte Event-Zusammenfassungen
          </p>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          Fehler: {camerasError.message}
        </div>
      </main>
    );
  }

  const allowedCameraIds = (cameras ?? []).map((c) => c.id);

  if (allowedCameraIds.length === 0) {
    return (
      <main className="space-y-6">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
                Events
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">Events</h1>
              <p className="mt-2 text-sm text-white/68">
                Priorisierte Event-Zusammenfassungen nach Relevanz
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/72">
              {scopeLabel}
            </div>
          </div>
        </section>

        <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
          Noch keine Events vorhanden.
        </div>
      </main>
    );
  }

  const { data: events, error } = await supabase
    .from("event_feed")
    .select(
      "id,camera_id,start_at,end_at,asset_count,top_species,top_count,relevance_score"
    )
    .in("camera_id", allowedCameraIds)
    .order("relevance_score", { ascending: false, nullsFirst: false })
    .order("end_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <main className="space-y-6">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            Events
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">Events</h1>
          <p className="mt-2 text-sm text-white/68">
            Priorisierte Event-Zusammenfassungen
          </p>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          Fehler: {error.message}
        </div>
      </main>
    );
  }

  const camerasById = Object.fromEntries(
    (cameras ?? []).map((c) => [
      c.id,
      c.name
        ? `${c.name}${c.location_name ? ` (${c.location_name})` : ""}`
        : c.id,
    ])
  );

  return (
    <main className="space-y-6">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
              Events
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white">Events</h1>
            <p className="mt-2 text-sm text-white/68">
              Priorisierte Event-Zusammenfassungen nach Relevanz
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/72">
            {scopeLabel}
          </div>
        </div>
      </section>

      <div className="space-y-3">
        {(events ?? []).map((e) => {
          const cameraLabel = camerasById[e.camera_id] ?? e.camera_id ?? "—";

          return (
            <Link
              key={e.id}
              href={`/cameras/events/${e.id}`}
              className="block rounded-[24px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition hover:border-amber-300/20 hover:bg-white/8"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-white">
                    {prettySpecies(e.top_species)}
                    {e.top_count ? ` (${e.top_count})` : ""}
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    {fmt(e.start_at)} – {fmt(e.end_at)}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-medium text-white">
                    {typeof e.relevance_score === "number"
                      ? e.relevance_score.toFixed(3)
                      : "—"}
                  </div>
                  <div className="text-xs text-white/45">
                    Score · {scoreBadge(e.relevance_score ?? null)}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-sm text-white/72 md:grid-cols-2">
                <div>
                  <span className="font-medium text-white">Kamera:</span> {cameraLabel}
                </div>
                <div>
                  <span className="font-medium text-white">Assets:</span> {e.asset_count ?? 0}
                </div>
              </div>

              <div className="mt-3 text-xs text-amber-200 underline">
                Details anzeigen →
              </div>
            </Link>
          );
        })}

        {(!events || events.length === 0) && (
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
            Noch keine Events vorhanden.
          </div>
        )}
      </div>
    </main>
  );
}