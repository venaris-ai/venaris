// src/app/access-denied/page.tsx #4
import Link from "next/link";
import { cookies } from "next/headers";
import {
  LOCALE_COOKIE,
  normalizeLanguage,
  type AppLanguage,
} from "@/lib/i18n";

function t(language: AppLanguage) {
  return language === "en"
    ? {
        title: "Access denied",
        body:
          "You currently do not have permission to access this area. If you believe this is an error, please check your active organization or contact the owner or admin.",
        home: "Back to home",
        login: "Go to login",
      }
    : {
        title: "Kein Zugriff",
        body:
          "Du hast für diesen Bereich aktuell keine Berechtigung. Wenn Du glaubst, dass das ein Fehler ist, prüfe bitte Deine aktive Organization oder kontaktiere den Owner bzw. Admin.",
        home: "Zur Startseite",
        login: "Zum Login",
      };
}

export default async function AccessDeniedPage() {
  const cookieStore = await cookies();
  const language = normalizeLanguage(cookieStore.get(LOCALE_COOKIE)?.value);
  const text = t(language);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
        <div className="text-sm font-medium uppercase tracking-[0.14em] text-amber-200/80">
          Venaris
        </div>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          {text.title}
        </h1>

        <p className="mt-4 text-sm leading-7 text-white/68">{text.body}</p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
          >
            {text.home}
          </Link>

          <Link
            href="/login"
            className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
          >
            {text.login}
          </Link>
        </div>
      </div>
    </main>
  );
}