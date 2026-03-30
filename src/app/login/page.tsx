// src/app/login/page.tsx #3
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ invite_created?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const inviteCreated = params.invite_created === "1";

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <div className="w-full rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
          Login
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          Login
        </h1>
        <p className="mt-2 text-sm text-white/68">
          Sign in to access your Venaris workspace.
        </p>

        {inviteCreated ? (
          <div className="mt-4 rounded-[14px] border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">
            Account angelegt. Bitte bestätige zuerst Deine E-Mail-Adresse und logge Dich danach ein.
          </div>
        ) : null}

        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}