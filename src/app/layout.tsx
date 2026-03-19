// src/app/layout.tsx
import "./globals.css";
import MainNav from "@/components/MainNav";
import SectionNav from "@/components/SectionNav";
import ContextBar from "@/components/ContextBar";
import LogoutButton from "@/components/LogoutButton";

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
          <div className="mx-auto max-w-5xl px-6 py-3">
            <div className="flex items-end justify-between gap-6">
              <div className="min-w-0">
                <div className="font-semibold">Venaris</div>
                <div className="mt-2">
                  <ContextBar />
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <MainNav />
                  <LogoutButton />
                </div>

                <SectionNav />
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </body>
    </html>
  );
}