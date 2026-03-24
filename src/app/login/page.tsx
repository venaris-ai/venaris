// src/app/login/page.tsx #2
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
      <div className="w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Sign in to access your Venaris workspace.
        </p>

        {inviteCreated ? (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
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