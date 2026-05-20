// src/app/admin/growth/page.tsx #1
import { cookies } from "next/headers";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";

type GrowthDashboardRow = {
  website_visitors_30d: number | null;
  demo_visitors_30d: number | null;
  demo_conversion_rate_30d: number | null;
  new_customer_accounts_30d: number | null;
  active_paying_customers: number | null;
  cancellations_30d: number | null;
  scheduled_cancellations: number | null;
  account_language_split: Record<string, number> | null;
};

type WebAnalyticsDailyRow = {
  day: string;
  unique_visitors: number;
  demo_unique_visitors: number;
  synced_at: string;
};

const VENARIS_ADMIN_EMAIL = "dev@venaris.io";

function numberValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatNumber(value: number | null | undefined, language: AppLanguage) {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "de-DE", {
    maximumFractionDigits: 0,
  }).format(numberValue(value));
}

function formatPercent(value: number | null | undefined, language: AppLanguage) {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(numberValue(value));
}

function formatDate(value: string | null | undefined, language: AppLanguage) {
  if (!value) return "—";

  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined, language: AppLanguage) {
  if (!value) return "—";

  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        eyebrow: "Admin",
        title: "Growth Dashboard",
        intro: `Internal Venaris view for the founder funnel. Access only for ${VENARIS_ADMIN_EMAIL}.`,

        websiteVisitorsStat: "Website Visitors",
        websiteVisitorsSubline: "unique visitors, last 30 days",
        demoVisitorsStat: "Demo Visitors",
        demoVisitorsSubline: "unique demo_start visitors, last 30 days",
        demoRateStat: "Demo Rate",
        demoRateSubline: "demo visitors / website visitors",
        newAccountsStat: "New Accounts",
        newAccountsSubline: "real customer org owners, last 30 days",
        payingCustomersStat: "Paying Customers",
        payingCustomersSubline: "active paid customer organizations",
        cancellationsStat: "Cancellations",
        cancellationsSubline: "effective cancellations, last 30 days",

        funnelTitle: "Founder Funnel",
        funnelText:
          "The five steering metrics for the path from reach to paying customers.",
        websiteStep: "Website",
        demoStep: "Demo",
        accountStep: "Account",
        paidStep: "Paid",
        churnStep: "Churn",

        detailTitle: "Signals",
        detailText:
          "Additional context for interpreting the funnel without turning it into a KPI wall.",
        scheduledCancellationsLabel: "Scheduled cancellations",
        languageSplitLabel: "Account language split",
        noLanguageData: "No real customer accounts yet.",

        dailyTitle: "Latest Web Analytics Snapshots",
        dailyText:
          "Daily Umami snapshots stored in Supabase. The dashboard uses the last 30 days.",
        noDailyRows:
          "No web analytics snapshots have been synced yet.",
        dayLabel: "Day",
        visitorsLabel: "Visitors",
        demoVisitorsLabel: "Demo visitors",
        syncedAtLabel: "Synced at",
      }
    : {
        eyebrow: "Admin",
        title: "Growth Dashboard",
        intro: `Interne Venaris-Ansicht für den Founder-Funnel. Zugriff nur für ${VENARIS_ADMIN_EMAIL}.`,

        websiteVisitorsStat: "Website-Besucher",
        websiteVisitorsSubline: "Unique Visitors, letzte 30 Tage",
        demoVisitorsStat: "Demo-Besucher",
        demoVisitorsSubline: "Unique demo_start Visitors, letzte 30 Tage",
        demoRateStat: "Demo-Quote",
        demoRateSubline: "Demo-Besucher / Website-Besucher",
        newAccountsStat: "Neue Accounts",
        newAccountsSubline: "echte Customer-Owner, letzte 30 Tage",
        payingCustomersStat: "Zahlende Kunden",
        payingCustomersSubline: "aktive bezahlte Customer-Orgas",
        cancellationsStat: "Kündigungen",
        cancellationsSubline: "wirksame Kündigungen, letzte 30 Tage",

        funnelTitle: "Founder-Funnel",
        funnelText:
          "Die fünf Steuerungsgrößen vom Website-Besuch bis zum zahlenden Kunden.",
        websiteStep: "Website",
        demoStep: "Demo",
        accountStep: "Account",
        paidStep: "Paid",
        churnStep: "Churn",

        detailTitle: "Signale",
        detailText:
          "Zusätzlicher Kontext zur Einordnung des Funnels, ohne daraus eine KPI-Wand zu machen.",
        scheduledCancellationsLabel: "Vorgemerkte Kündigungen",
        languageSplitLabel: "Account-Sprachverteilung",
        noLanguageData: "Noch keine echten Customer-Accounts vorhanden.",

        dailyTitle: "Letzte Web-Analytics-Snapshots",
        dailyText:
          "Tägliche Umami-Snapshots in Supabase. Das Dashboard nutzt die letzten 30 Tage.",
        noDailyRows:
          "Noch keine Web-Analytics-Snapshots synchronisiert.",
        dayLabel: "Tag",
        visitorsLabel: "Besucher",
        demoVisitorsLabel: "Demo-Besucher",
        syncedAtLabel: "Synchronisiert",
      };
}

function StatCard({
  title,
  value,
  subline,
}: {
  title: string;
  value: string | number;
  subline: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <div className="text-xs uppercase tracking-wide text-white/45">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-white/60">{subline}</div>
    </div>
  );
}

function FunnelStep({
  label,
  value,
  subline,
}: {
  label: string;
  value: string;
  subline: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
      <div className="text-xs uppercase tracking-wide text-amber-200/70">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-white/55">{subline}</div>
    </div>
  );
}

function getLanguageEntries(split: Record<string, number> | null | undefined) {
  return Object.entries(split ?? {})
    .filter(([, value]) => typeof value === "number" && value > 0)
    .sort((a, b) => b[1] - a[1]);
}

export default async function AdminGrowthPage() {
  const ctx = await requirePathAccess("/admin/growth");

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

  const text = t(language);

  const [dashboardResult, dailyRowsResult] = await Promise.all([
    supabase
      .from("admin_growth_dashboard")
      .select(
        [
          "website_visitors_30d",
          "demo_visitors_30d",
          "demo_conversion_rate_30d",
          "new_customer_accounts_30d",
          "active_paying_customers",
          "cancellations_30d",
          "scheduled_cancellations",
          "account_language_split",
        ].join(", ")
      )
      .maybeSingle(),

    supabase
      .from("growth_web_analytics_daily")
      .select("day, unique_visitors, demo_unique_visitors, synced_at")
      .order("day", { ascending: false })
      .limit(7),
  ]);

  if (dashboardResult.error) {
    throw new Error(
      `Failed to load growth dashboard: ${dashboardResult.error.message}`
    );
  }

  if (dailyRowsResult.error) {
    throw new Error(
      `Failed to load web analytics snapshots: ${dailyRowsResult.error.message}`
    );
  }

  const dashboard = (dashboardResult.data ?? {
    website_visitors_30d: 0,
    demo_visitors_30d: 0,
    demo_conversion_rate_30d: 0,
    new_customer_accounts_30d: 0,
    active_paying_customers: 0,
    cancellations_30d: 0,
    scheduled_cancellations: 0,
    account_language_split: {},
  }) as GrowthDashboardRow;

  const dailyRows = (dailyRowsResult.data ?? []) as WebAnalyticsDailyRow[];
  const languageEntries = getLanguageEntries(dashboard.account_language_split);

  const websiteVisitors = numberValue(dashboard.website_visitors_30d);
  const demoVisitors = numberValue(dashboard.demo_visitors_30d);
  const newAccounts = numberValue(dashboard.new_customer_accounts_30d);
  const payingCustomers = numberValue(dashboard.active_paying_customers);
  const cancellations = numberValue(dashboard.cancellations_30d);

  return (
    <main className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm">
        <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
          {text.eyebrow}
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          {text.title}
        </h1>
        <p className="mt-2 text-sm text-white/68">{text.intro}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title={text.websiteVisitorsStat}
          value={formatNumber(websiteVisitors, language)}
          subline={text.websiteVisitorsSubline}
        />
        <StatCard
          title={text.demoVisitorsStat}
          value={formatNumber(demoVisitors, language)}
          subline={text.demoVisitorsSubline}
        />
        <StatCard
          title={text.demoRateStat}
          value={`${formatPercent(
            dashboard.demo_conversion_rate_30d,
            language
          )} %`}
          subline={text.demoRateSubline}
        />
        <StatCard
          title={text.newAccountsStat}
          value={formatNumber(newAccounts, language)}
          subline={text.newAccountsSubline}
        />
        <StatCard
          title={text.payingCustomersStat}
          value={formatNumber(payingCustomers, language)}
          subline={text.payingCustomersSubline}
        />
        <StatCard
          title={text.cancellationsStat}
          value={formatNumber(cancellations, language)}
          subline={text.cancellationsSubline}
        />
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-medium text-white">{text.funnelTitle}</h2>
          <p className="mt-1 text-sm text-white/65">{text.funnelText}</p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <FunnelStep
            label={text.websiteStep}
            value={formatNumber(websiteVisitors, language)}
            subline={text.websiteVisitorsSubline}
          />
          <FunnelStep
            label={text.demoStep}
            value={formatNumber(demoVisitors, language)}
            subline={`${formatPercent(
              dashboard.demo_conversion_rate_30d,
              language
            )} %`}
          />
          <FunnelStep
            label={text.accountStep}
            value={formatNumber(newAccounts, language)}
            subline={text.newAccountsSubline}
          />
          <FunnelStep
            label={text.paidStep}
            value={formatNumber(payingCustomers, language)}
            subline={text.payingCustomersSubline}
          />
          <FunnelStep
            label={text.churnStep}
            value={formatNumber(cancellations, language)}
            subline={text.cancellationsSubline}
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-medium text-white">{text.detailTitle}</h2>
          <p className="mt-1 text-sm text-white/65">{text.detailText}</p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-wide text-white/45">
              {text.scheduledCancellationsLabel}
            </div>
            <div className="mt-2 text-3xl font-semibold text-white">
              {formatNumber(dashboard.scheduled_cancellations, language)}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-wide text-white/45">
              {text.languageSplitLabel}
            </div>

            {languageEntries.length === 0 ? (
              <div className="mt-3 text-sm text-white/60">
                {text.noLanguageData}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {languageEntries.map(([entryLanguage, count]) => (
                  <span
                    key={entryLanguage}
                    className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/75"
                  >
                    {entryLanguage.toUpperCase()}:{" "}
                    {formatNumber(count, language)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-medium text-white">{text.dailyTitle}</h2>
          <p className="mt-1 text-sm text-white/65">{text.dailyText}</p>
        </div>

        <div className="mt-6 overflow-hidden rounded-[24px] border border-white/10">
          {dailyRows.length === 0 ? (
            <div className="bg-white/5 p-5 text-sm text-white/68">
              {text.noDailyRows}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/45">
                  <tr>
                    <th className="px-4 py-3 font-medium">{text.dayLabel}</th>
                    <th className="px-4 py-3 font-medium">
                      {text.visitorsLabel}
                    </th>
                    <th className="px-4 py-3 font-medium">
                      {text.demoVisitorsLabel}
                    </th>
                    <th className="px-4 py-3 font-medium">
                      {text.syncedAtLabel}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 bg-white/3 text-white/72">
                  {dailyRows.map((row) => (
                    <tr key={row.day}>
                      <td className="px-4 py-3 text-white">
                        {formatDate(row.day, language)}
                      </td>
                      <td className="px-4 py-3">
                        {formatNumber(row.unique_visitors, language)}
                      </td>
                      <td className="px-4 py-3">
                        {formatNumber(row.demo_unique_visitors, language)}
                      </td>
                      <td className="px-4 py-3">
                        {formatDateTime(row.synced_at, language)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}