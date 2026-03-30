// src/app/access-denied/page.tsx #2
import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
        <div className="text-sm font-medium uppercase tracking-[0.14em] text-amber-200/80">
          Venaris
        </div>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Kein Zugriff
        </h1>

        <p className="mt-4 text-sm leading-7 text-white/68">
          Du hast für diesen Bereich aktuell keine Berechtigung. Wenn Du glaubst,
          dass das ein Fehler ist, prüfe bitte Deine aktive Organization oder
          kontaktiere den Owner bzw. Admin.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
          >
            Zur Startseite
          </Link>

          <Link
            href="/login"
            className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
          >
            Zum Login
          </Link>
        </div>
      </div>
    </main>
  );
}