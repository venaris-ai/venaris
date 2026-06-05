// src/app/cameras/security/page.tsx #3
export const dynamic = "force-dynamic";

import Link from "next/link";
import { cookies } from "next/headers";
import IngestFilterBlock from "@/app/cameras/ingest/IngestFilterBlock";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import { formatAppDateTime } from "@/lib/dateTime";

type SearchParams = {
  revier?: string;
  camera?: string;
  from?: string;
  to?: string;
  page?: string;
};

type OrganizationSecurityRow = {
  id: string;
  security_detections_enabled: boolean;
};

type RevierRow = {
  id: string;
  name: string;
  timezone: string | null;
};

type CameraScopeRow = {
  id: string;
  name: string | null;
  revier_id: string | null;
};

type SecurityDetectionRow = {
  id: string;
  organization_id: string;
  revier_id: string | null;
  camera_id: string;
  asset_id: string;
  detected_class: "human" | "vehicle";
  score: number | null;
  captured_at: string | null;
  created_at: string;
  delete_after: string;
};

type SecurityAssetRow = {
  id: string;
  captured_at: string | null;
  created_at: string;
  storage_deleted_at: string | null;
};

type SecurityListItem = {
  assetId: string;
  detailId: string;
  cameraId: string;
  cameraName: string | null;
  revierId: string | null;
  detectedClasses: ("human" | "vehicle")[];
  scoresByClass: Partial<Record<"human" | "vehicle", number | null>>;
  capturedAt: string | null;
  createdAt: string;
  deleteAfter: string;
  timeZone: string | null;
};

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      activeOrganizationContextRequired: "Active organization context required",
      activeOrganizationNotFound: "Active organization not found",
      eyebrow: "Security",
      title: "Security",
      intro:
        "Person and vehicle detections from your cameras. These captures are separate from wildlife events and are not used for species identification, wildlife analytics, or PopSim.",
      inactiveTitle: "Security detections are not enabled",
      inactiveText:
        "Enable person and vehicle detections in your organization account settings before security detections can appear here.",
      accountLink: "Open account settings",
      emptyTitle: "No person or vehicle detections yet",
      emptyText:
        "Future camera images with people or vehicles will appear here for 30 days.",
      time: "Time",
      camera: "Camera",
      type: "Type",
      truth: "Truth",
      details: "Details",
      person: "Person",
      vehicle: "Vehicle",
      unnamedCamera: "Unnamed camera",
      showDetails: "Show details",
      apiError: "API error",
      filterTitle: "Filter security detections",
      allCameras: "All cameras",
      fromDate: "From",
      toDate: "To",
      applyFilters: "Apply",
      resetFilters: "Reset",
      page: "Page",
      previousPage: "Previous",
      nextPage: "Next",
      paginationSummary: "Showing {from}–{to} of {total} detections",
      paginationSummaryCapped:
        "Showing {from}–{to} of the latest {total}+ detections",
      cappedHint:
        "The overview is limited to the latest 500 images. Use filters to narrow down older detections.",
    };
  }

  return {
    activeOrganizationContextRequired: "Aktiver Organisationskontext erforderlich",
    activeOrganizationNotFound: "Aktive Organisation nicht gefunden",
    eyebrow: "Sicherheit",
    title: "Sicherheit",
    intro:
      "Personen- und Fahrzeugerkennungen Deiner Kameras. Diese Aufnahmen sind von Wildlife-Ereignissen getrennt und werden nicht für Wildartenbestimmung, Wildlife-Auswertungen oder PopSim verwendet.",
    inactiveTitle: "Sicherheitserkennungen sind nicht aktiviert",
    inactiveText:
      "Aktiviere Personen- und Fahrzeugerkennungen in den Kontoeinstellungen Deiner Organisation, bevor hier Sicherheitserkennungen erscheinen können.",
    accountLink: "Kontoeinstellungen öffnen",
    emptyTitle: "Noch keine Personen- oder Fahrzeugerkennungen",
    emptyText:
      "Zukünftige Kamerabilder mit Personen oder Fahrzeugen erscheinen hier für 30 Tage.",
    time: "Zeit",
    camera: "Kamera",
    type: "Typ",
    truth: "Wahr",
    details: "Details",
    person: "Person",
    vehicle: "Fahrzeug",
    unnamedCamera: "Unbenannte Kamera",
    showDetails: "Details anzeigen",
    apiError: "API Fehler",
    filterTitle: "Sicherheitserkennungen eingrenzen",
    allCameras: "Alle Kameras",
    fromDate: "Von",
    toDate: "Bis",
    applyFilters: "Anwenden",
    resetFilters: "Zurücksetzen",
    page: "Seite",
    previousPage: "Zurück",
    nextPage: "Weiter",
    paginationSummary: "Zeige {from}–{to} von {total} Erkennungen",
    paginationSummaryCapped:
      "Zeige {from}–{to} der neuesten {total}+ Erkennungen",
    cappedHint:
      "Die Übersicht ist auf die neuesten 500 Bilder begrenzt. Nutze Filter, um ältere Erkennungen gezielt einzugrenzen.",
  };
}

const SECURITY_ITEMS_PER_PAGE = 50;
const MAX_PAGINATED_SECURITY_ITEMS = 500;
const MAX_SECURITY_DETECTION_ROWS = 1000;

function parsePageParam(value?: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

function parseDateParam(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return value;
}

function formatDateInputValue(value?: string | null) {
  if (!value) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  return date.toLocaleDateString("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getTodayDateInputValue() {
  return formatDateInputValue(new Date().toISOString());
}

function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(page, 1), Math.max(totalPages, 1));
}

function formatProbability(value?: number | null) {
  if (typeof value !== "number") return "—";
  return `${Math.round(value * 100)}%`;
}

function formatType(
  value: "human" | "vehicle",
  text: ReturnType<typeof t>
) {
  return value === "human" ? text.person : text.vehicle;
}

function formatTypes(
  values: ("human" | "vehicle")[],
  text: ReturnType<typeof t>
) {
  return values.map((value) => formatType(value, text)).join(" + ");
}

function formatSecurityScores(
  item: SecurityListItem,
  text: ReturnType<typeof t>
) {
  if (item.detectedClasses.length === 1) {
    return formatProbability(item.scoresByClass[item.detectedClasses[0]]);
  }

  return item.detectedClasses
    .map((detectedClass) => {
      const label = formatType(detectedClass, text);
      const score = formatProbability(item.scoresByClass[detectedClass]);
      return `${label} ${score}`;
    })
    .join(" · ");
}

function sortItems(items: SecurityListItem[]) {
  return [...items].sort((a, b) => {
    const aTs = new Date(a.capturedAt ?? a.createdAt ?? 0).getTime();
    const bTs = new Date(b.capturedAt ?? b.createdAt ?? 0).getTime();
    return bTs - aTs;
  });
}

function buildSecurityPageHref(params: {
  page: number;
  revier?: string;
  camera?: string;
  from?: string;
  to?: string;
}) {
  const search = new URLSearchParams();

  if (params.revier) search.set("revier", params.revier);
  if (params.camera) search.set("camera", params.camera);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.page > 1) search.set("page", String(params.page));

  const query = search.toString();
  return query ? `/cameras/security?${query}` : "/cameras/security";
}

function buildResetFilterHref(params: { revier?: string }) {
  if (!params.revier) return "/cameras/security";

  const search = new URLSearchParams({ revier: params.revier });
  return `/cameras/security?${search.toString()}`;
}

function buildSecurityDetailHref(params: {
  detailId: string;
  revier?: string;
  camera?: string;
  from?: string;
  to?: string;
}) {
  const search = new URLSearchParams();

  if (params.revier) search.set("revier", params.revier);
  if (params.camera) search.set("camera", params.camera);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);

  const query = search.toString();
  return query
    ? `/cameras/security/${params.detailId}?${query}`
    : `/cameras/security/${params.detailId}`;
}

function formatPaginationSummary(
  template: string,
  values: { from: number; to: number; total: number }
) {
  return template
    .replace("{from}", String(values.from))
    .replace("{to}", String(values.to))
    .replace("{total}", String(values.total));
}

export default async function CamerasSecurityPage(props: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const ctx = await requirePathAccess("/cameras/security");

  if (!ctx.user) {
    throw new Error("Authenticated user required");
  }

  if (!ctx.activeMembership) {
    throw new Error("Active organization context required");
  }

  const activeOrganization = ctx.activeMembership.organizations;

  if (!activeOrganization) {
    throw new Error("Active organization not found");
  }

  const supabase = supabaseServer();
  const cookieStore = await cookies();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", ctx.user.id)
    .maybeSingle();

  const language = resolveLanguage({
    cookieLanguage: cookieStore.get(LOCALE_COOKIE)?.value,
    profileLanguage: profileData?.preferred_language,
  });

  const text = t(language);
  const searchParams = props?.searchParams
    ? await Promise.resolve(props.searchParams)
    : undefined;
  const rawRevier = searchParams?.revier;
  const rawCamera = searchParams?.camera;
  const requestedFromDate = parseDateParam(searchParams?.from);
  const requestedToDate = parseDateParam(searchParams?.to);
  const requestedPage = parsePageParam(searchParams?.page);
  const defaultToDate = getTodayDateInputValue();

  let items: SecurityListItem[] = [];
  let apiError: string | null = null;
  let cameraOptions: CameraScopeRow[] = [];
  let selectedCameraId: string | undefined;
  let oldestDetectionDate: string | undefined;
  let fromDate = requestedFromDate;
  let toDate = requestedToDate ?? defaultToDate;
  let currentPage = 1;
  let totalItems = 0;
  let totalPages = 1;
  let hasMoreThanMaxItems = false;

  const { data: organizationData, error: organizationError } = await supabase
    .from("organizations")
    .select("id,security_detections_enabled")
    .eq("id", activeOrganization.id)
    .single();

  if (organizationError) {
    throw new Error(`Failed to load organization: ${organizationError.message}`);
  }

  const organization = organizationData as OrganizationSecurityRow;

  const { data: reviersData, error: reviersError } = await supabase
    .from("reviers")
    .select("id,name,timezone")
    .eq("organization_id", activeOrganization.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (reviersError) {
    apiError = reviersError.message;
  }

  if (!apiError && organization.security_detections_enabled) {
    const reviers = (reviersData ?? []) as RevierRow[];
    const allowedReviers: RevierOption[] = reviers.map((revier) => ({
      id: revier.id,
      name: revier.name,
    }));
    const revierScope = resolveRevierScope(rawRevier, allowedReviers);
    const allowedRevierIds = allowedReviers.map((revier) => revier.id);
    const timeZoneByRevierId = new Map(
      reviers.map((revier) => [revier.id, revier.timezone] as const)
    );

    if (allowedRevierIds.length > 0) {
      let camerasQuery = supabase
        .from("cameras")
        .select("id,name,revier_id")
        .eq("organization_id", activeOrganization.id);

      camerasQuery =
        revierScope.type === "single"
          ? camerasQuery.eq("revier_id", revierScope.revierId)
          : camerasQuery.in("revier_id", allowedRevierIds);

      const { data: camerasData, error: camerasError } = await camerasQuery;

      if (camerasError) {
        apiError = camerasError.message;
      } else {
        const cameras = (camerasData ?? []) as CameraScopeRow[];
        cameraOptions = [...cameras].sort((a, b) =>
          (a.name ?? "").localeCompare(b.name ?? "")
        );

        const allowedCameraIds = cameras.map((camera) => camera.id);
        selectedCameraId =
          rawCamera && allowedCameraIds.includes(rawCamera) ? rawCamera : undefined;
        const filteredCameraIds = selectedCameraId
          ? [selectedCameraId]
          : allowedCameraIds;

        if (filteredCameraIds.length > 0) {
          const oldestDetectionQuery = supabase
            .from("security_detections")
            .select("captured_at")
            .eq("organization_id", activeOrganization.id)
            .in("camera_id", filteredCameraIds)
            .gt("delete_after", new Date().toISOString())
            .not("captured_at", "is", null)
            .order("captured_at", { ascending: true, nullsFirst: false })
            .limit(1);

          const { data: oldestDetectionData, error: oldestDetectionError } =
            await oldestDetectionQuery;

          if (oldestDetectionError) {
            apiError = oldestDetectionError.message;
          } else {
            oldestDetectionDate = formatDateInputValue(
              ((oldestDetectionData ?? []) as Pick<SecurityDetectionRow, "captured_at">[])[0]
                ?.captured_at
            );

            fromDate = requestedFromDate ?? oldestDetectionDate;

            if (fromDate && toDate && fromDate > toDate) {
              const normalizedFromDate = toDate;
              toDate = fromDate;
              fromDate = normalizedFromDate;
            }
          }
        }

        if (!apiError && filteredCameraIds.length > 0) {
          const cameraNameById = new Map(
            cameras.map((camera) => [camera.id, camera.name] as const)
          );
          const revierIdByCameraId = new Map(
            cameras.map((camera) => [camera.id, camera.revier_id] as const)
          );

          let securityQuery = supabase
            .from("security_detections")
            .select(
              "id,organization_id,revier_id,camera_id,asset_id,detected_class,score,captured_at,created_at,delete_after"
            )
            .eq("organization_id", activeOrganization.id)
            .in("camera_id", filteredCameraIds)
            .gt("delete_after", new Date().toISOString())
            .order("captured_at", { ascending: false, nullsFirst: false })
            .limit(MAX_SECURITY_DETECTION_ROWS);

          if (fromDate) {
            securityQuery = securityQuery.gte("captured_at", `${fromDate}T00:00:00`);
          }

          if (toDate) {
            securityQuery = securityQuery.lte("captured_at", `${toDate}T23:59:59.999`);
          }

          const { data: securityData, error: securityError } =
            await securityQuery.returns<SecurityDetectionRow[]>();

          if (securityError) {
            apiError = securityError.message;
          } else {
            const detections = securityData ?? [];
            const assetIds = Array.from(
              new Set(detections.map((item) => item.asset_id).filter(Boolean))
            );

            let assets: SecurityAssetRow[] = [];

            if (assetIds.length > 0) {
              const { data: assetsData, error: assetsError } = await supabase
                .from("assets")
                .select("id,captured_at,created_at,storage_deleted_at")
                .in("id", assetIds)
                .is("storage_deleted_at", null)
                .returns<SecurityAssetRow[]>();

              if (assetsError) {
                apiError = assetsError.message;
              } else {
                assets = assetsData ?? [];
              }
            }

            if (!apiError) {
              const assetById = new Map(assets.map((asset) => [asset.id, asset]));
              const detectionsByAssetId = new Map<string, SecurityDetectionRow[]>();

              for (const detection of detections) {
                const existing = detectionsByAssetId.get(detection.asset_id) ?? [];
                existing.push(detection);
                detectionsByAssetId.set(detection.asset_id, existing);
              }

              const resolvedItems: SecurityListItem[] = [];

              for (const [assetId, assetDetections] of detectionsByAssetId.entries()) {
                const asset = assetById.get(assetId);
                const firstDetection = assetDetections[0];

                if (!asset || !firstDetection) continue;

                const revierId =
                  firstDetection.revier_id ??
                  revierIdByCameraId.get(firstDetection.camera_id) ??
                  null;

                const detectedClasses = Array.from(
                  new Set(assetDetections.map((detection) => detection.detected_class))
                ).sort((a, b) => {
                  const order = { human: 0, vehicle: 1 };
                  return order[a] - order[b];
                });

                const scoresByClass: Partial<Record<"human" | "vehicle", number | null>> = {};

                for (const detection of assetDetections) {
                  const currentScore = scoresByClass[detection.detected_class];

                  if (
                    typeof currentScore !== "number" ||
                    (typeof detection.score === "number" &&
                      detection.score > currentScore)
                  ) {
                    scoresByClass[detection.detected_class] = detection.score;
                  }
                }

                resolvedItems.push({
                  assetId,
                  detailId: firstDetection.id,
                  cameraId: firstDetection.camera_id,
                  cameraName: cameraNameById.get(firstDetection.camera_id) ?? null,
                  revierId,
                  detectedClasses,
                  scoresByClass,
                  capturedAt: firstDetection.captured_at ?? asset.captured_at,
                  createdAt: firstDetection.created_at,
                  deleteAfter: firstDetection.delete_after,
                  timeZone: revierId ? timeZoneByRevierId.get(revierId) ?? null : null,
                });
              }

              const sortedItems = sortItems(resolvedItems);
              hasMoreThanMaxItems =
                sortedItems.length >= MAX_PAGINATED_SECURITY_ITEMS;
              const cappedItems = sortedItems.slice(0, MAX_PAGINATED_SECURITY_ITEMS);
              totalItems = cappedItems.length;
              totalPages = Math.max(
                1,
                Math.ceil(totalItems / SECURITY_ITEMS_PER_PAGE)
              );
              currentPage = clampPage(requestedPage, totalPages);

              const from = (currentPage - 1) * SECURITY_ITEMS_PER_PAGE;
              const to = from + SECURITY_ITEMS_PER_PAGE;

              items = cappedItems.slice(from, to);
            }
          }
        }
      }
    }
  }

  const paginationFrom =
    totalItems === 0 ? 0 : (currentPage - 1) * SECURITY_ITEMS_PER_PAGE + 1;
  const paginationTo = Math.min(currentPage * SECURITY_ITEMS_PER_PAGE, totalItems);
  const paginationSummary = formatPaginationSummary(
    hasMoreThanMaxItems
      ? text.paginationSummaryCapped
      : text.paginationSummary,
    {
      from: paginationFrom,
      to: paginationTo,
      total: totalItems,
    }
  );
  const paginationPages = Array.from(
    { length: totalPages },
    (_, index) => index + 1
  );

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
            {text.eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {text.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/68">
            {text.intro}
          </p>
        </div>
      </section>

      {!organization.security_detections_enabled ? (
        <section className="rounded-[28px] border border-amber-300/20 bg-amber-300/10 p-6">
          <h2 className="text-lg font-medium text-white">
            {text.inactiveTitle}
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-white/68">
            {text.inactiveText}
          </p>
          <Link
            href="/orga/account"
            className="mt-5 inline-flex rounded-full border border-amber-300/30 bg-amber-300/15 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-300/20"
          >
            {text.accountLink}
          </Link>
        </section>
      ) : (
        <>
          <IngestFilterBlock
            text={text}
            rawRevier={rawRevier}
            selectedCameraId={selectedCameraId}
            fromDate={fromDate}
            toDate={toDate}
            oldestEventDate={oldestDetectionDate}
            defaultToDate={defaultToDate}
            cameraOptions={cameraOptions}
            resetHref={buildResetFilterHref({ revier: rawRevier })}
          />

          <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-white/8 bg-white/5 text-left text-white/55">
                <tr>
                  <th className="px-3 py-2">{text.time}</th>
                  <th className="px-3 py-2">{text.camera}</th>
                  <th className="px-3 py-2">{text.type}</th>
                  <th className="px-3 py-2">{text.truth}</th>
                  <th className="px-3 py-2">{text.details}</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-white/45" colSpan={5}>
                      <div className="font-medium text-white/72">
                        {text.emptyTitle}
                      </div>
                      <div className="mt-1 text-white/45">{text.emptyText}</div>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const detailHref = buildSecurityDetailHref({
                      detailId: item.detailId,
                      revier: rawRevier,
                      camera: selectedCameraId,
                      from: fromDate,
                      to: toDate,
                    });

                    return (
                      <tr
                        key={item.assetId}
                        className="border-b border-white/8 last:border-b-0"
                      >
                        <td className="px-3 py-3 text-white/72 whitespace-nowrap">
                          {formatAppDateTime(
                            item.capturedAt ?? item.createdAt,
                            language,
                            item.timeZone
                          )}
                        </td>
                        <td className="px-3 py-3 text-white">
                          {item.cameraName?.trim() || text.unnamedCamera}
                        </td>
                        <td className="px-3 py-3 text-white/72">
                          {formatTypes(item.detectedClasses, text)}
                        </td>
                        <td className="px-3 py-3 text-white/72">
                          {formatSecurityScores(item, text)}
                        </td>
                        <td className="px-3 py-3">
                          <Link
                            href={detailHref}
                            className="text-amber-200 underline underline-offset-4 hover:text-amber-100"
                          >
                            {text.showDetails}
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {totalItems > 0 ? (
              <div className="flex flex-col gap-3 border-t border-white/8 px-3 py-3 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div>{paginationSummary}</div>
                  {hasMoreThanMaxItems ? (
                    <div className="mt-1 text-xs text-white/45">
                      {text.cappedHint}
                    </div>
                  ) : null}
                </div>

                <nav
                  className="flex flex-wrap items-center gap-1"
                  aria-label={text.page}
                >
                  {currentPage > 1 ? (
                    <Link
                      href={buildSecurityPageHref({
                        page: currentPage - 1,
                        revier: rawRevier,
                        camera: selectedCameraId,
                        from: fromDate,
                        to: toDate,
                      })}
                      className="rounded-full border border-white/10 px-3 py-1 text-white/70 hover:border-amber-300/30 hover:text-amber-100"
                    >
                      {text.previousPage}
                    </Link>
                  ) : (
                    <span className="rounded-full border border-white/8 px-3 py-1 text-white/25">
                      {text.previousPage}
                    </span>
                  )}

                  {paginationPages.map((pageNumber) => {
                    const isCurrentPage = pageNumber === currentPage;

                    return isCurrentPage ? (
                      <span
                        key={pageNumber}
                        className="rounded-full border border-amber-300/35 bg-amber-300/15 px-3 py-1 font-medium text-amber-100"
                        aria-current="page"
                      >
                        {pageNumber}
                      </span>
                    ) : (
                      <Link
                        key={pageNumber}
                        href={buildSecurityPageHref({
                          page: pageNumber,
                          revier: rawRevier,
                          camera: selectedCameraId,
                          from: fromDate,
                          to: toDate,
                        })}
                        className="rounded-full border border-white/10 px-3 py-1 text-white/70 hover:border-amber-300/30 hover:text-amber-100"
                      >
                        {pageNumber}
                      </Link>
                    );
                  })}

                  {currentPage < totalPages ? (
                    <Link
                      href={buildSecurityPageHref({
                        page: currentPage + 1,
                        revier: rawRevier,
                        camera: selectedCameraId,
                        from: fromDate,
                        to: toDate,
                      })}
                      className="rounded-full border border-white/10 px-3 py-1 text-white/70 hover:border-amber-300/30 hover:text-amber-100"
                    >
                      {text.nextPage}
                    </Link>
                  ) : (
                    <span className="rounded-full border border-white/8 px-3 py-1 text-white/25">
                      {text.nextPage}
                    </span>
                  )}
                </nav>
              </div>
            ) : null}
          </section>
        </>
      )}

      {apiError ? (
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.apiError}: {apiError}
        </div>
      ) : null}
    </main>
  );
}
