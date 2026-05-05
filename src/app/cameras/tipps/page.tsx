// src/app/cameras/tipps/page.tsx #7
export const runtime = "nodejs";

import { cookies } from "next/headers";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import CameraTipsTable, {
  type CameraRecommendation,
} from "./CameraTipsTable";

type SimRatingTone = "good" | "warning" | "bad";

type SimProviderRecommendation = {
  provider: string;
  packageName: string;
  data: string;
  dataTone: SimRatingTone;
  networkQuality: string;
  networkQualityTone: SimRatingTone;
  commitment: string;
  commitmentTone: SimRatingTone;
  payment: string;
  paymentTone: SimRatingTone;
  cost: string;
  costTone: SimRatingTone;
};

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      eyebrow: "Camera tips",
      title: "Camera recommendations",
      intro:
        "Practical evaluation of LTE trail cameras for Venaris. The focus is direct input, SIM freedom, app independency, night captures and solar operation.",
      tableTitle: "Camera comparison",
      tableText:
        "Only combinations with real Venaris experience are rated conservatively. Additional cameras can be added after field tests.",
      simTableTitle: "SIM card providers",
      simTableText:
        "Initial tariff recommendation for LTE trail cameras. Prices and data volumes should be checked before purchase because prepaid conditions can change.",
      simColumns: {
        provider: "Provider",
        packageName: "Package",
        data: "Data",
        networkQuality: "Network quality",
        commitment: "Commitment",
        payment: "Payment",
        cost: "Cost",
      },
    };
  }

  return {
    eyebrow: "Kamera-Tipps",
    title: "Kamera-Empfehlungen",
    intro:
      "Praxisbewertung von LTE-Wildkameras für Venaris. Im Fokus stehen direkter Input, SIM-Freiheit, App-Unabhängigkeit, Nachtaufnahmen und Solarbetrieb.",
    tableTitle: "Kameravergleich",
    tableText:
      "Nur Kombinationen mit echter Venaris-Erfahrung werden konservativ bewertet. Weitere Kameras können nach Praxistests ergänzt werden.",
    simTableTitle: "SIM-Karten-Anbieter",
    simTableText:
      "Erste Tarifempfehlung für LTE-Wildkameras. Preise und Datenvolumen sollten vor Kauf geprüft werden, da sich Prepaid-Konditionen ändern können.",
    simColumns: {
      provider: "Anbieter",
      packageName: "Paket",
      data: "Daten",
      networkQuality: "Netzqualität",
      commitment: "Bindung",
      payment: "Zahlung",
      cost: "Kosten",
    },
  };
}

function getRecommendations(language: AppLanguage): CameraRecommendation[] {
  if (language === "en") {
    return [
      {
        name: "X-View LTE 9.x",
        status: "recommended",
        input: "direct",
        simLock: "without",
        appRequired: "no",
        nightShots: "yes",
        solar: "possible",
        comment:
          "Direct transfer via FTP is technically supported; free SIM/APN configuration is possible. Solar operation is plausible through external accessories, but is not rated as an included feature.",
        verdict:
          "Currently the strongest candidate for direct Venaris integration: open, flexible and not dependent on a mandatory app/cloud model.",
      },
      {
        name: "Zeiss Secacam 5",
        status: "compatible",
        input: "app_download",
        simLock: "with",
        appRequired: "yes",
        nightShots: "yes",
        solar: "possible",
        comment:
          "Mobile transmission runs through the ZEISS Secacam SIM and the ZEISS app/web account. For Venaris, app/web download plus manual import is therefore the required workflow.",
        verdict:
          "Good consumer camera with strong core features, but no open direct integration due to SIM lock and app/cloud dependency.",
      },
    ];
  }

  return [
    {
      name: "X-View LTE 9.x",
      status: "recommended",
      input: "direct",
      simLock: "without",
      appRequired: "no",
      nightShots: "yes",
      solar: "possible",
      comment:
        "Direkte Übertragung per FTP ist technisch belegbar; freie SIM-/APN-Konfiguration ist möglich. Solarbetrieb ist über externes Zubehör plausibel, aber nicht als inklusive Funktion bewertet.",
      verdict:
        "Aktuell stärkster Kandidat für direkte Venaris-Integration: offen, flexibel und ohne zwingendes App-/Cloud-Modell.",
    },
    {
      name: "Zeiss Secacam 5",
      status: "compatible",
      input: "app_download",
      simLock: "with",
      appRequired: "yes",
      nightShots: "yes",
      solar: "possible",
      comment:
        "Mobilfunk läuft über die ZEISS Secacam SIM und das ZEISS App-/Web-Konto. Für Venaris ist daher App-/Web-Download plus manueller Import notwendig.",
      verdict:
        "Gute Consumer-Kamera mit starken Basisfunktionen, aber wegen SIM-Lock und App-/Cloud-Bindung keine offene Direktintegration.",
    },
  ];
}

function getSimProviderRecommendations(
  language: AppLanguage
): SimProviderRecommendation[] {
  if (language === "en") {
    return [
      {
        provider: "Telekom",
        packageName: "MagentaMobil Prepaid M",
        data: "20 GB / 4 weeks",
        dataTone: "good",
        networkQuality: "Very good",
        networkQualityTone: "good",
        commitment: "No fixed term",
        commitmentTone: "good",
        payment: "Prepaid",
        paymentTone: "warning",
        cost: "€9.95 incl. VAT / 4 weeks",
        costTone: "warning",
      },
    ];
  }

  return [
    {
      provider: "Telekom",
      packageName: "MagentaMobil Prepaid M",
      data: "20 GB / 4 Wochen",
      dataTone: "good",
      networkQuality: "Sehr gut",
      networkQualityTone: "good",
      commitment: "Keine Vertragslaufzeit",
      commitmentTone: "good",
      payment: "Prepaid",
      paymentTone: "warning",
      cost: "9,95 € inkl. MwSt. / 4 Wochen",
      costTone: "warning",
    },
  ];
}

function PageHeader({ text }: { text: ReturnType<typeof t> }) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,149,46,0.16),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/35 to-transparent" />

      <p className="text-sm font-medium uppercase tracking-[0.22em] text-amber-200/80">
        {text.eyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
        {text.title}
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/68">
        {text.intro}
      </p>
    </section>
  );
}

function ratingBadgeClass(tone: SimRatingTone) {
  if (tone === "good") {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
  }

  if (tone === "warning") {
    return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  }

  return "border-red-300/25 bg-red-300/10 text-red-200";
}

function SimRatingBadge({
  value,
  tone,
}: {
  value: string;
  tone: SimRatingTone;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${ratingBadgeClass(
        tone
      )}`}
    >
      {value}
    </span>
  );
}

function SimProvidersTable({
  rows,
  text,
}: {
  rows: SimProviderRecommendation[];
  text: ReturnType<typeof t>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[980px] table-fixed text-sm">
        <colgroup>
          <col className="w-[170px]" />
          <col className="w-[220px]" />
          <col className="w-[150px]" />
          <col className="w-[150px]" />
          <col className="w-[180px]" />
          <col className="w-[140px]" />
          <col className="w-[190px]" />
        </colgroup>

        <thead className="bg-white/5 text-left text-white/55">
          <tr>
            <th className="whitespace-nowrap px-6 py-3 font-medium">
              {text.simColumns.provider}
            </th>
            <th className="whitespace-nowrap px-6 py-3 font-medium">
              {text.simColumns.packageName}
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-center font-medium">
              {text.simColumns.data}
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-center font-medium">
              {text.simColumns.networkQuality}
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-center font-medium">
              {text.simColumns.commitment}
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-center font-medium">
              {text.simColumns.payment}
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-center font-medium">
              {text.simColumns.cost}
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.provider}-${row.packageName}`}
              className="border-t border-white/8 align-middle transition-colors hover:bg-white/[0.025]"
            >
              <td className="whitespace-nowrap px-6 py-4 font-medium text-white">
                {row.provider}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-white/78">
                {row.packageName}
              </td>
              <td className="whitespace-nowrap px-4 py-4 text-center">
                <SimRatingBadge value={row.data} tone={row.dataTone} />
              </td>
              <td className="whitespace-nowrap px-4 py-4 text-center">
                <SimRatingBadge
                  value={row.networkQuality}
                  tone={row.networkQualityTone}
                />
              </td>
              <td className="whitespace-nowrap px-4 py-4 text-center">
                <SimRatingBadge
                  value={row.commitment}
                  tone={row.commitmentTone}
                />
              </td>
              <td className="whitespace-nowrap px-4 py-4 text-center">
                <SimRatingBadge value={row.payment} tone={row.paymentTone} />
              </td>
              <td className="whitespace-nowrap px-4 py-4 text-center">
                <SimRatingBadge value={row.cost} tone={row.costTone} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function CameraTipsPage() {
  const ctx = await requirePathAccess("/cameras/tipps");

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
  const recommendations = getRecommendations(language);
  const simProviderRecommendations = getSimProviderRecommendations(language);

  return (
    <main className="space-y-8">
      <PageHeader text={text} />

      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur-sm">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="text-lg font-medium text-white">{text.tableTitle}</h2>
          <p className="mt-1 text-sm leading-6 text-white/65">
            {text.tableText}
          </p>
        </div>

        <CameraTipsTable rows={recommendations} language={language} />
      </section>

      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur-sm">
        <div className="border-b border-white/8 px-6 py-4">
          <h2 className="text-lg font-medium text-white">
            {text.simTableTitle}
          </h2>
          <p className="mt-1 text-sm leading-6 text-white/65">
            {text.simTableText}
          </p>
        </div>

        <SimProvidersTable rows={simProviderRecommendations} text={text} />
      </section>
    </main>
  );
}