// src/app/layout.tsx #4
import "./globals.css";
import MainNav from "@/components/MainNav";
import SectionNav from "@/components/SectionNav";
import ContextBar from "@/components/ContextBar";
import LogoutButton from "@/components/LogoutButton";
import AppHeaderGate from "@/components/AppHeaderGate";
import { getOptionalActiveOrganization } from "@/lib/auth";

export const metadata = {
  title: "Venaris",
};

async function HeaderBrand() {
  const ctx = await getOptionalActiveOrganization();
  const email = ctx?.user.email ?? null;

  return (
    <div className="font-semibold">
      Venaris
      {email ? (
        <span className="ml-2 font-normal text-sm text-gray-500">
          · {email}
        </span>
      ) : null}
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>
        <AppHeaderGate>
          <header className="border-b">
            <div className="mx-auto max-w-5xl px-6 py-3">
              <div className="flex items-end justify-between gap-6">
                <div className="min-w-0">
                  <HeaderBrand />
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
        </AppHeaderGate>

        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </body>
    </html>
  );
}