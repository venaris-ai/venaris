// src/app/cameras/security/[id]/page.tsx #1
export const runtime = "nodejs";

import Link from "next/link";
import { cookies } from "next/headers";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolveAssetPreviewUrl } from "@/lib/demoAssetResolver";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import { formatAppDateTime } from "@/lib/dateTime";
import {
  resolveRevierScope,
  type RevierOption,
} from "@/lib/intelligence/revierScope";

type SearchParams = {
  revier?: string;
  camera?: string;
  from?: string;
  to?: string;
};

type SecurityListContext = {
  revier?: string;
  camera?: string;
  from?: string;
  to?: string;
};

type OrganizationRow = {
  id: string;
  is_demo: boolean;
  security_detections_enabled: boolean;
};

type RevierRow = {
  id: string;
  name: string;
  timezone: string | null;
};

type CameraRow = {
  id: string;
  name: string | null;
  location_name: string | null;
  organization_id: string;
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

type AssetRow = {
  id: string;
  camera_id: string;
  storage_path: string | null;
  captured_at: string | null;
  created_at: string;
  storage_deleted_at: string | null;
};

type NavigationItem = {
  assetId: string;
  detailId: string;
  cameraId: string;
  capturedAt: string | null;
  createdAt: string;
};

function parseDateParam(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return value;
}

function buildSecurityListSearchParams(context: SecurityListContext) {
  const params = new URLSearchParams();

  if (context.revier) params.set("revier", context.revier);
  if (context.camera) params.set("camera", context.camera);
  if (context.from) params.set("from", context.from);
  if (context.to) params.set("to", context.to);

  return params;
}

function buildBackHref(context: SecurityListContext) {
  const params = buildSecurityListSearchParams(context);
  const query = params.toString();
  return query ? `/cameras/security?${query}` : "/cameras/security";
}

function buildSecurityHref(detailId: string, context: SecurityListContext) {
  const params = buildSecurityListSearchParams(context);
  const query = params.toString();
  return query
    ? `/cameras/security/${detailId}?${query}`
    : `/cameras/security/${detailId}`;
}

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      eyebrow: "Security",
      title: "Security detection",
      intro: "Person and vehicle detection details",
      overview: "Overview",
      older: "← Older",
      newer: "Newer →",
      missingId: "Security detection ID is missing. Please reload the page.",
      notFound: "Security detection not found",
      notFoundOrForbidden: "Security detection not found or not allowed.",
      inactive: "Security detections are not enabled for this organization.",
      errorPrefix: "Error:",
      unnamedCamera: "Unnamed camera",
      person: "Person",
      vehicle: "Vehicle",
      type: "Type",
      truth: "Truth",
      camera: "Camera",
      time: "Time",
      imageUnavailable: "Image unavailable",
    };
  }

  return {
    eyebrow: "Sicherheit",
    title: "Sicherheitserkennung",
    intro: "Details zur Personen- und Fahrzeugerkennung",
    overview: "Übersicht",
    older: "← Älter",
    newer: "Neuer →",
    missingId: "Security-Detection-ID fehlt. Bitte Seite neu laden.",
    notFound: "Sicherheitserkennung nicht gefunden",
    notFoundOrForbidden: "Sicherheitserkennung nicht gefunden oder nicht erlaubt.",
    inactive: "Sicherheitserkennungen sind für diese Organisation nicht aktiviert.",
    errorPrefix: "Fehler:",
    unnamedCamera: "Unbenannte Kamera",
    person: "Person",
    vehicle: "Fahrzeug",
    type: "Typ",
    truth: "Wahr",
    camera: "Kamera",
    time: "Zeit",
    imageUnavailable: "Bild nicht verfügbar",
  };
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
  detections: SecurityDetectionRow[],
  text: ReturnType<typeof t>
) {
  const scoresByClass: Partial<Record<"human" | "vehicle", number | null>> = {};

  for (const detection of detections) {
    const currentScore = scoresByClass[detection.detected_class];

    if (
      typeof currentScore !== "number" ||
      (typeof detection.score === "number" && detection.score > currentScore)
    ) {
      scoresByClass[detection.detected_class] = detection.score;
    }
  }

  const detectedClasses = Array.from(
    new Set(detections.map((detection) => detection.detected_class))
  ).sort((a, b) => {
    const order = { human: 0, vehicle: 1 };
    return order[a] - order[b];
  });

  if (detectedClasses.length === 1) {
    return formatProbability(scoresByClass[detectedClasses[0]]);
  }

  return detectedClasses
    .map((detectedClass) => {
      const label = formatType(detectedClass, text);
      const score = formatProbability(scoresByClass[detectedClass]);
      return `${label} ${score}`;
    })
    .join(" · ");
}

function SecurityNavigation({
  olderHref,
  overviewHref,
  newerHref,
  text,
}: {
  olderHref: string | null;
  overviewHref: string;
  newerHref: string | null;
  text: ReturnType<typeof t>;
}) {
  const linkClass =
    "rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white";
  const disabledClass =
    "rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/28";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {olderHref ? (
        <Link href={olderHref} className={linkClass}>
          {text.older}
        </Link>
      ) : (
        <span className={disabledClass}>{text.older}</span>
      )}

      <Link href={overviewHref} className={linkClass}>
        {text.overview}
      </Link>

      {newerHref ? (
        <Link href={newerHref} className={linkClass}>
          {text.newer}
        </Link>
      ) : (
        <span className={disabledClass}>{text.newer}</span>
      )}
    </div>
  );
}

function sortNavigationItems(items: NavigationItem[]) {
  return [...items].sort((a, b) => {
    const aTs = new Date(a.capturedAt ?? a.createdAt ?? 0).getTime();
    const bTs = new Date(b.capturedAt ?? b.createdAt ?? 0).getTime();
    return bTs - aTs;
  });
}

export default async function SecurityDetectionDetailPage(props: {
  params?: Promise<{ id?: string }> | { id?: string };
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const params = props?.params ? await Promise.resolve(props.params) : undefined;
  const searchParams = props?.searchParams
    ? await Promise.resolve(props.searchParams)
    : undefined;

  const detectionId = params?.id;
  const rawRevier = searchParams?.revier;
  const rawCamera = searchParams?.camera;
  const requestedFromDate = parseDateParam(searchParams?.from);
  const requestedToDate = parseDateParam(searchParams?.to);

  let listContext: SecurityListContext = {
    revier: rawRevier,
    camera: rawCamera,
    from: requestedFromDate,
    to: requestedToDate,
  };
  let overviewHref = buildBackHref(listContext);

  const cookieStore = await cookies();

  if (!detectionId) {
    const language = resolveLanguage({
      cookieLanguage: cookieStore.get(LOCALE_COOKIE)?.value,
    });
    const text = t(language);

    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
                {text.eyebrow}
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">
                {text.title}
              </h1>
              <p className="mt-2 text-sm text-white/68">{text.intro}</p>
            </div>

            <SecurityNavigation
              olderHref={null}
              overviewHref={overviewHref}
              newerHref={null}
              text={text}
            />
          </div>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.missingId}
        </div>
      </main>
    );
  }

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

  const { data: organizationData, error: organizationError } = await supabase
    .from("organizations")
    .select("id,is_demo,security_detections_enabled")
    .eq("id", activeOrganization.id)
    .single();

  if (organizationError) {
    throw new Error(`Failed to load organization: ${organizationError.message}`);
  }

  const organization = organizationData as OrganizationRow;

  if (!organization.security_detections_enabled) {
    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
                {text.eyebrow}
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">
                {text.title}
              </h1>
              <p className="mt-2 text-sm text-white/68">{text.intro}</p>
            </div>

            <SecurityNavigation
              olderHref={null}
              overviewHref={overviewHref}
              newerHref={null}
              text={text}
            />
          </div>
        </section>

        <div className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
          {text.inactive}
        </div>
      </main>
    );
  }

  const { data: detection, error: detectionError } = await supabase
    .from("security_detections")
    .select(
      "id,organization_id,revier_id,camera_id,asset_id,detected_class,score,captured_at,created_at,delete_after"
    )
    .eq("id", detectionId)
    .single();

  if (detectionError || !detection) {
    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
                {text.eyebrow}
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">
                {text.title}
              </h1>
              <p className="mt-2 text-sm text-white/68">{text.intro}</p>
            </div>

            <SecurityNavigation
              olderHref={null}
              overviewHref={overviewHref}
              newerHref={null}
              text={text}
            />
          </div>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.notFound}: {detectionError?.message ?? "unknown error"}
        </div>
      </main>
    );
  }

  const currentDetection = detection as SecurityDetectionRow;

  const { data: asset } = await supabase
    .from("assets")
    .select("id,camera_id,storage_path,captured_at,created_at,storage_deleted_at")
    .eq("id", currentDetection.asset_id)
    .single();

  const currentAsset = asset as AssetRow | null;

  const { data: camera } = await supabase
    .from("cameras")
    .select("id,name,location_name,organization_id,revier_id")
    .eq("id", currentDetection.camera_id)
    .single();

  const currentCamera = camera as CameraRow | null;

  if (
    currentDetection.organization_id !== activeOrganization.id ||
    !currentAsset ||
    !currentCamera ||
    currentCamera.organization_id !== activeOrganization.id ||
    currentAsset.storage_deleted_at
  ) {
    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
                {text.eyebrow}
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">
                {text.title}
              </h1>
              <p className="mt-2 text-sm text-white/68">{text.intro}</p>
            </div>

            <SecurityNavigation
              olderHref={null}
              overviewHref={overviewHref}
              newerHref={null}
              text={text}
            />
          </div>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.notFoundOrForbidden}
        </div>
      </main>
    );
  }

  const { data: sameAssetDetectionsData } = await supabase
    .from("security_detections")
    .select(
      "id,organization_id,revier_id,camera_id,asset_id,detected_class,score,captured_at,created_at,delete_after"
    )
    .eq("asset_id", currentDetection.asset_id)
    .eq("organization_id", activeOrganization.id)
    .gt("delete_after", new Date().toISOString())
    .returns<SecurityDetectionRow[]>();

  const sameAssetDetections = sameAssetDetectionsData ?? [currentDetection];

  const { data: reviersData, error: reviersError } = await supabase
    .from("reviers")
    .select("id,name,timezone")
    .eq("organization_id", activeOrganization.id)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (reviersError) {
    throw new Error(`Failed to load reviers: ${reviersError.message}`);
  }

  const reviers = (reviersData ?? []) as RevierRow[];
  const allowedReviers: RevierOption[] = reviers.map((revier) => ({
    id: revier.id,
    name: revier.name,
  }));
  const revierScope = resolveRevierScope(rawRevier, allowedReviers);
  const allowedRevierIds = allowedReviers.map((revier) => revier.id);

  const cameraAllowedInScope =
    allowedRevierIds.length > 0 &&
    (revierScope.type === "single"
      ? currentCamera.revier_id === revierScope.revierId
      : currentCamera.revier_id
        ? allowedRevierIds.includes(currentCamera.revier_id)
        : false);

  if (!cameraAllowedInScope) {
    return (
      <main className="space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
                {text.eyebrow}
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">
                {text.title}
              </h1>
              <p className="mt-2 text-sm text-white/68">{text.intro}</p>
            </div>

            <SecurityNavigation
              olderHref={null}
              overviewHref={overviewHref}
              newerHref={null}
              text={text}
            />
          </div>
        </section>

        <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">
          {text.notFoundOrForbidden}
        </div>
      </main>
    );
  }

  const eventTimeZone =
    reviers.find((revier) => revier.id === currentCamera.revier_id)?.timezone ??
    null;

  let scopeCameraIds: string[] = [currentCamera.id];

  if (allowedRevierIds.length > 0) {
    let scopeCameraQuery = supabase
      .from("cameras")
      .select("id")
      .eq("organization_id", activeOrganization.id);

    if (revierScope.type === "single") {
      scopeCameraQuery = scopeCameraQuery.eq("revier_id", revierScope.revierId);
    } else {
      scopeCameraQuery = scopeCameraQuery.in("revier_id", allowedRevierIds);
    }

    const { data: scopeCameras } = await scopeCameraQuery;

    const nextScopeCameraIds = (scopeCameras ?? [])
      .map((row: { id: string | null }) => row.id)
      .filter(Boolean) as string[];

    if (nextScopeCameraIds.length > 0) {
      scopeCameraIds = nextScopeCameraIds;
    }
  }

  const selectedNavigationCameraIds =
    rawCamera && scopeCameraIds.includes(rawCamera) ? [rawCamera] : scopeCameraIds;

  listContext = {
    revier: rawRevier,
    camera: rawCamera && scopeCameraIds.includes(rawCamera) ? rawCamera : undefined,
    from: requestedFromDate,
    to: requestedToDate,
  };
  overviewHref = buildBackHref(listContext);

  let olderHref: string | null = null;
  let newerHref: string | null = null;

  if (selectedNavigationCameraIds.length > 0) {
    let navigationQuery = supabase
      .from("security_detections")
      .select("id,camera_id,asset_id,captured_at,created_at,delete_after")
      .eq("organization_id", activeOrganization.id)
      .in("camera_id", selectedNavigationCameraIds)
      .gt("delete_after", new Date().toISOString())
      .order("captured_at", { ascending: false, nullsFirst: false })
      .limit(1000);

    if (requestedFromDate) {
      navigationQuery = navigationQuery.gte("captured_at", `${requestedFromDate}T00:00:00`);
    }

    if (requestedToDate) {
      navigationQuery = navigationQuery.lte("captured_at", `${requestedToDate}T23:59:59.999`);
    }

    const { data: navigationRowsData } =
      await navigationQuery.returns<SecurityDetectionRow[]>();

    const navigationRows = navigationRowsData ?? [];
    const navigationAssetIds = Array.from(
      new Set(navigationRows.map((row) => row.asset_id).filter(Boolean))
    );

    let availableAssetIds = new Set<string>();

    if (navigationAssetIds.length > 0) {
      const { data: navigationAssets } = await supabase
        .from("assets")
        .select("id,storage_deleted_at")
        .in("id", navigationAssetIds)
        .is("storage_deleted_at", null);

      availableAssetIds = new Set(
        (navigationAssets ?? [])
          .map((row: { id: string | null }) => row.id)
          .filter(Boolean) as string[]
      );
    }

    const navigationByAssetId = new Map<string, NavigationItem>();

    for (const row of navigationRows) {
      if (!availableAssetIds.has(row.asset_id)) continue;

      const existing = navigationByAssetId.get(row.asset_id);

      if (!existing) {
        navigationByAssetId.set(row.asset_id, {
          assetId: row.asset_id,
          detailId: row.id,
          cameraId: row.camera_id,
          capturedAt: row.captured_at,
          createdAt: row.created_at,
        });
      }
    }

    const navigationItems = sortNavigationItems(
      Array.from(navigationByAssetId.values())
    );

    const currentIndex = navigationItems.findIndex(
      (item) => item.assetId === currentDetection.asset_id
    );

    if (currentIndex >= 0) {
      const newerItem = navigationItems[currentIndex - 1] ?? null;
      const olderItem = navigationItems[currentIndex + 1] ?? null;

      if (olderItem) {
        olderHref = buildSecurityHref(olderItem.detailId, listContext);
      }

      if (newerItem) {
        newerHref = buildSecurityHref(newerItem.detailId, listContext);
      }
    }
  }

  const previewUrl = await resolveAssetPreviewUrl({
    asset: {
      id: currentAsset.id,
      camera_id: currentAsset.camera_id,
      storage_path: currentAsset.storage_path,
    },
    isDemo: organization.is_demo,
  });

  const detectedClasses = Array.from(
    new Set(sameAssetDetections.map((detection) => detection.detected_class))
  ).sort((a, b) => {
    const order = { human: 0, vehicle: 1 };
    return order[a] - order[b];
  });

  const cameraLabel = currentCamera.name
    ? `${currentCamera.name}${
        currentCamera.location_name ? ` (${currentCamera.location_name})` : ""
      }`
    : text.unnamedCamera;

  const timeLabel = formatAppDateTime(
    currentDetection.captured_at ?? currentAsset.captured_at ?? currentAsset.created_at,
    language,
    eventTimeZone
  );

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
              {text.eyebrow}
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white">
              {formatTypes(detectedClasses, text)}
            </h1>
            <p className="mt-2 text-sm text-white/68">{timeLabel}</p>
          </div>

          <SecurityNavigation
            olderHref={olderHref}
            overviewHref={overviewHref}
            newerHref={newerHref}
            text={text}
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-black/20">
          {previewUrl ? (
            <a href={previewUrl} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt=""
                className="max-h-[75vh] w-full object-contain"
              />
            </a>
          ) : (
            <div className="flex min-h-[24rem] items-center justify-center text-sm text-white/45">
              {text.imageUnavailable}
            </div>
          )}
        </div>

        <aside className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <dl className="space-y-5">
            <div>
              <dt className="text-xs font-medium uppercase tracking-[0.16em] text-white/40">
                {text.camera}
              </dt>
              <dd className="mt-1 text-sm text-white">{cameraLabel}</dd>
            </div>

            <div>
              <dt className="text-xs font-medium uppercase tracking-[0.16em] text-white/40">
                {text.time}
              </dt>
              <dd className="mt-1 text-sm text-white">{timeLabel}</dd>
            </div>

            <div>
              <dt className="text-xs font-medium uppercase tracking-[0.16em] text-white/40">
                {text.type}
              </dt>
              <dd className="mt-1 text-sm text-white">
                {formatTypes(detectedClasses, text)}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium uppercase tracking-[0.16em] text-white/40">
                {text.truth}
              </dt>
              <dd className="mt-1 text-sm text-white">
                {formatSecurityScores(sameAssetDetections, text)}
              </dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
