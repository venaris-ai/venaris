// src/app/cameras/security/page.tsx #1
export const dynamic = "force-dynamic";

import Link from "next/link";
import { cookies } from "next/headers";
import { requirePathAccess } from "@/lib/authz";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  LOCALE_COOKIE,
  resolveLanguage,
  type AppLanguage,
} from "@/lib/i18n";

type OrganizationSecurityRow = {
  id: string;
  security_detections_enabled: boolean;
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
        "Once enabled in your account, future camera images with people or vehicles will appear here for 30 days.",
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
      "Nach der Aktivierung im Konto erscheinen zukünftige Kamerabilder mit Personen oder Fahrzeugen hier für 30 Tage.",
  };
}

export default async function CamerasSecurityPage() {
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

  const { data: organizationData, error: organizationError } = await supabase
    .from("organizations")
    .select("id,security_detections_enabled")
    .eq("id", activeOrganization.id)
    .single();

  if (organizationError) {
    throw new Error(`Failed to load organization: ${organizationError.message}`);
  }

  const organization = organizationData as OrganizationSecurityRow;

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
        <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium text-white">{text.emptyTitle}</h2>
          <p className="mt-2 max-w-3xl text-sm text-white/62">
            {text.emptyText}
          </p>
        </section>
      )}
    </main>
  );
}
