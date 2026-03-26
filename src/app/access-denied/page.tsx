// src/app/access-denied/page.tsx #1
import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-2xl border bg-white p-8 shadow-sm">
        <div className="text-sm font-medium uppercase tracking-[0.14em] text-gray-500">
          Venaris
        </div>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950">
          Kein Zugriff
        </h1>

        <p className="mt-4 text-sm leading-7 text-gray-600">
          Du hast für diesen Bereich aktuell keine Berechtigung. Wenn Du glaubst,
          dass das ein Fehler ist, prüfe bitte Deine aktive Organization oder
          kontaktiere den Owner bzw. Admin.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Zur Startseite
          </Link>

          <Link
            href="/login"
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Zum Login
          </Link>
        </div>
      </div>
    </main>
  );
}