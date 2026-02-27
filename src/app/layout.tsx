import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Venaris",
  description: "Wildlife intelligence platform (MVP)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Global Nav */}
        <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <a href="/" className="font-semibold tracking-tight">
              Venaris
            </a>

            <nav className="flex items-center gap-2 text-sm">
              <a href="/" className="rounded-md border px-3 py-1 hover:bg-gray-50">
                Home
              </a>
              <a href="/cameras" className="rounded-md border px-3 py-1 hover:bg-gray-50">
                Cameras
              </a>
              <a href="/ingest" className="rounded-md border px-3 py-1 hover:bg-gray-50">
                Ingest
              </a>
              <a href="/events" className="rounded-md border px-3 py-1 hover:bg-gray-50">
                Events
              </a>
            </nav>
          </div>
        </header>

        {/* Page content */}
        <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
      </body>
    </html>
  );
}