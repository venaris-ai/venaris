// src/app/register/page.tsx #6
import { cookies } from "next/headers";
import RegisterForm from "./RegisterForm";
import {
  LOCALE_COOKIE,
  normalizeLanguage,
  type AppLanguage,
} from "@/lib/i18n";

function t(language: AppLanguage) {
  return language === "en"
    ? {
        eyebrow: "Register",
        title: "Create your Venaris account",
        body:
          "Create your account and set up your first organization right away with a 30-day Starter trial.",
      }
    : {
        eyebrow: "Registrieren",
        title: "Venaris Konto erstellen",
        body:
          "Erstelle Dein Konto und lege direkt Deine erste Organisation mit 30 Tagen Starter-Testphase an.",
      };
}

export default async function RegisterPage() {
  const cookieStore = await cookies();
  const language = normalizeLanguage(cookieStore.get(LOCALE_COOKIE)?.value);
  const text = t(language);

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <div className="w-full rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
          {text.eyebrow}
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          {text.title}
        </h1>
        <p className="mt-2 text-sm text-white/68">{text.body}</p>

        <RegisterForm initialLanguage={language} />
      </div>
    </main>
  );
}