// src/app/layout.tsx
import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Venaris",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>
        <header className="border-b">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
            <div className="font-semibold">Venaris</div>

            <nav className="flex items-center gap-2 text-sm">
              <Link className="rounded-md border px-3 py-1" href="/">
                Home
              </Link>
              <Link className="rounded-md border px-3 py-1" href="/cameras">
                Cameras
              </Link>
              <Link className="rounded-md border px-3 py-1" href="/import">
                Import
              </Link>
              <Link className="rounded-md border px-3 py-1" href="/ingest">
                Ingest
              </Link>
              <Link className="rounded-md border px-3 py-1" href="/events">
                Events
              </Link>
            </nav>
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </body>
    </html>
  );
}