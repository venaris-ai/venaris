// src/app/cameras/events/page.tsx #7
export const runtime = "nodejs";

import Link from "next/link";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";
import { requirePathAccess } from "@/lib/authz";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";
import {
  buildSpeciesMetaMap,
  getSpeciesLabel,
  loadSpeciesMeta,
} from "@/lib/speciesMeta";

type SearchParams = {
  revier?: string;
};

type RevierRow = {
  id: string;
  name: string;
};

function fmt(ts: string | null, language: AppLanguage) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(language === "en" ? "en-GB" : "de-DE");
}

function scoreBadge(score: number | null, language: AppLanguage) {
  if (typeof score !== "number") return "—";

  if (language === "en") {
    if (score >= 0.9) return "very high";
    if (score >= 0.75) return "high";
    if (score >= 0.5) return "medium";
    return "low";
  }

  if (score >= 0.9) return "sehr hoch";
  if (score >= 0.75) return "hoch";
  if (score >= 0.5) return "mittel";
  return "niedrig";
}

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      eyebrow: "Events",
      title: "Events",
      intro: "Prioritized event summaries by relevance",
      missingOrg: "Active organization not found.",
      scopeAll: "All active grounds",
      scopeSingleFallback: "One ground",
      loadErrorPrefix: "Error:",
      noEvents: "No events yet.",
      score: "Score",
      camera: "Camera",
      assets: "Assets",
      details: "Open details →",
    };
  }

  return {
    eyebrow: "Events",
    title: "Events",
    intro: "Priorisierte Event-Zusammenfassungen nach Relevanz",
    missingOrg: "Aktive Organisation nicht gefunden.",
    scopeAll: "Alle aktiven Reviere",
    scopeSingleFallback: "Ein Revier",
    loadErrorPrefix: "Fehler:",
    noEvents: "Noch keine Events vorhanden.",
    score: "Score",
    camera: "Kamera",
    assets: "Assets",
    details: "Details anzeigen →",
  };
}

export default async function CameraEventsPage(props: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const ctx = await requirePathAccess("/cameras/events");
  if (!ctx.user) {
    throw new Error("Authenticated user required");
  }

  const cookieStore = await cookies();
  const supabase = supabaseServer();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", ctx.user.id)
    .maybeSingle();

  const language = resolveLanguage({
    cookieLanguage: cookieStore.get(LOCALE_COOKIE)?.value,
    profileLanguage: profileData?.preferred_language,
  });

  const speciesMetaRows = await loadSpeciesMeta();
  const speciesMetaMap = buildSpeciesMetaMap(speciesMetaRows);

  const text = t(language);
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
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
          <p className="mt-2 text-sm text-white/68">{text.intro}</p>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.missingOrg}
        </div>
      </main>
    );
  }

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
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
          <p className="mt-2 text-sm text-white/68">{text.intro}</p>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.loadErrorPrefix} {reviersError.message}
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
      ? reviers.find((revier) => revier.id === revierScope.revierId)?.name ??
        text.scopeSingleFallback
      : text.scopeAll;

  if (allowedRevierIds.length === 0) {
    return (
      <main className="space-y-6">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
                {text.eyebrow}
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
              <p className="mt-2 text-sm text-white/68">{text.intro}</p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/72">
              {scopeLabel}
            </div>
          </div>
        </section>

        <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
          {text.noEvents}
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
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
          <p className="mt-2 text-sm text-white/68">{text.intro}</p>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.loadErrorPrefix} {camerasError.message}
        </div>
      </main>
    );
  }

  const allowedCameraIds = (cameras ?? []).map((camera) => camera.id);

  if (allowedCameraIds.length === 0) {
    return (
      <main className="space-y-6">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
                {text.eyebrow}
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
              <p className="mt-2 text-sm text-white/68">{text.intro}</p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/72">
              {scopeLabel}
            </div>
          </div>
        </section>

        <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
          {text.noEvents}
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
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
          <p className="mt-2 text-sm text-white/68">{text.intro}</p>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.loadErrorPrefix} {error.message}
        </div>
      </main>
    );
  }

  const camerasById = Object.fromEntries(
    (cameras ?? []).map((camera) => [
      camera.id,
      camera.name
        ? `${camera.name}${camera.location_name ? ` (${camera.location_name})` : ""}`
        : camera.id,
    ])
  );

  return (
    <main className="space-y-6">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
              {text.eyebrow}
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white">{text.title}</h1>
            <p className="mt-2 text-sm text-white/68">{text.intro}</p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/72">
            {scopeLabel}
          </div>
        </div>
      </section>

      <div className="space-y-3">
        {(events ?? []).map((event) => {
          const cameraLabel = camerasById[event.camera_id] ?? event.camera_id ?? "—";
          const href = rawRevier
            ? `/cameras/events/${event.id}?${new URLSearchParams({ revier: rawRevier }).toString()}`
            : `/cameras/events/${event.id}`;

          return (
            <Link
              key={event.id}
              href={href}
              className="block rounded-[24px] border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition hover:border-amber-300/20 hover:bg-white/8"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-white">
                    {getSpeciesLabel(event.top_species, language, speciesMetaMap)}
                    {event.top_count ? ` (${event.top_count})` : ""}
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    {fmt(event.start_at, language)} – {fmt(event.end_at, language)}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-medium text-white">
                    {typeof event.relevance_score === "number"
                      ? event.relevance_score.toFixed(3)
                      : "—"}
                  </div>
                  <div className="text-xs text-white/45">
                    {text.score} · {scoreBadge(event.relevance_score ?? null, language)}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-sm text-white/72 md:grid-cols-2">
                <div>
                  <span className="font-medium text-white">{text.camera}:</span>{" "}
                  {cameraLabel}
                </div>
                <div>
                  <span className="font-medium text-white">{text.assets}:</span>{" "}
                  {event.asset_count ?? 0}
                </div>
              </div>

              <div className="mt-3 text-xs text-amber-200 underline">
                {text.details}
              </div>
            </Link>
          );
        })}

        {(!events || events.length === 0) && (
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-white/68">
            {text.noEvents}
          </div>
        )}
      </div>
    </main>
  );
}