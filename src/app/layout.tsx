// src/app/layout.tsx
import "./globals.css";
import MainNav from "@/components/MainNav";

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

            <MainNav />
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </body>
    </html>
  );
}