// src/app/demo/start/page.tsx
import { cookies } from "next/headers";
import DemoStartRedirect from "@/app/demo/start/DemoStartRedirect";
import { LOCALE_COOKIE, normalizeLanguage, type AppLanguage } from "@/lib/i18n";

export const metadata = {
  title: "Venaris Demo",
};

const copy = {
  de: {
    eyebrow: "Venaris Demo",
    title: "Demo-Revier wird vorbereitet",
    body:
      "Wir öffnen ein Demo-Revier mit Kameras, Bildern, Ereignissen und Auswertungen.",
    status: [
      "Demo-Revier wird geöffnet …",
      "Wildkamera-Daten werden geladen …",
      "Lagebild wird vorbereitet …",
    ],
  },
  en: {
    eyebrow: "Venaris Demo",
    title: "Preparing the demo ground",
    body:
      "We are opening a demo ground with cameras, images, events and insights.",
    status: [
      "Opening demo ground …",
      "Loading trail camera data …",
      "Preparing wildlife insights …",
    ],
  },
} satisfies Record<
  AppLanguage,
  {
    eyebrow: string;
    title: string;
    body: string;
    status: string[];
  }
>;

export default async function DemoStartPage() {
  const cookieStore = await cookies();
  const language = normalizeLanguage(cookieStore.get(LOCALE_COOKIE)?.value);
  const t = copy[language];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0d1712] text-white">
      <DemoStartRedirect />

      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('/brand/scenes/venaris-demo-transition.webp')",
        }}
        aria-hidden="true"
      />

      <div
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(13,23,18,0.94)_0%,rgba(13,23,18,0.86)_34%,rgba(13,23,18,0.48)_68%,rgba(13,23,18,0.24)_100%)]"
        aria-hidden="true"
      />

      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_24%_42%,rgba(201,149,46,0.18),transparent_28%),linear-gradient(180deg,rgba(13,23,18,0.05)_0%,rgba(13,23,18,0.72)_100%)]"
        aria-hidden="true"
      />

      <section className="relative z-10 flex min-h-screen items-center px-6 py-12">
        <div className="mx-auto w-full max-w-6xl">
          <div className="max-w-xl rounded-[32px] border border-white/10 bg-[#102018]/70 p-7 shadow-2xl shadow-black/30 backdrop-blur-md md:p-9">
            <div className="inline-flex items-center rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-amber-200">
              {t.eyebrow}
            </div>

            <div className="mt-7 flex items-center gap-3">
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-300/25 via-emerald-300/10 to-teal-300/20 shadow-[0_0_40px_rgba(201,149,46,0.18)]">
                <div className="absolute inset-[7px] rounded-xl border border-white/10" />
                <div className="relative text-xl font-semibold tracking-tight text-amber-200">
                  V
                </div>
              </div>

              <div>
                <div className="text-lg font-semibold tracking-[0.18em] text-white">
                  VENARIS
                </div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/45">
                  Wildlife Intelligence
                </div>
              </div>
            </div>

            <h1 className="mt-8 text-4xl font-semibold tracking-tight text-white md:text-5xl">
              {t.title}
            </h1>

            <p className="mt-5 max-w-lg text-base leading-7 text-white/72 md:text-lg md:leading-8">
              {t.body}
            </p>

            <div className="mt-8 space-y-3">
              {t.status.map((item, index) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/74"
                >
                  <span className="relative flex h-2.5 w-2.5">
                    <span
                      className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#c9952e] opacity-40"
                      style={{ animationDelay: `${index * 180}ms` }}
                    />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#c9952e]" />
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-2/3 animate-[venaris-demo-progress_1.2s_ease-in-out_infinite] rounded-full bg-[#c9952e]" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}