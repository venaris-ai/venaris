// src/app/login/page.tsx #4
import { cookies } from "next/headers";
import LoginForm from "./LoginForm";

type AppLanguage = "de" | "en";

const LOCALE_COOKIE = "venaris_locale";

function normalizeLanguage(value: string | null | undefined): AppLanguage {
  return value === "en" ? "en" : "de";
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        eyebrow: "Login",
        title: "Login",
        body: "Sign in to access your Venaris workspace.",
        inviteCreated:
          "Account created. Please confirm your email address first and then sign in.",
      }
    : {
        eyebrow: "Login",
        title: "Login",
        body: "Melde Dich an, um auf Deinen Venaris Workspace zuzugreifen.",
        inviteCreated:
          "Account angelegt. Bitte bestätige zuerst Deine E-Mail-Adresse und logge Dich danach ein.",
      };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ invite_created?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const inviteCreated = params.invite_created === "1";

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

        {inviteCreated ? (
          <div className="mt-4 rounded-[14px] border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">
            {text.inviteCreated}
          </div>
        ) : null}

        <div className="mt-6">
          <LoginForm language={language} />
        </div>
      </div>
    </main>
  );
}