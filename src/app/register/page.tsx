// src/app/register/page.tsx #1
import RegisterForm from "./RegisterForm";

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <div className="w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Venaris Konto erstellen
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Erstelle Dein Konto und lege direkt Deine erste Organisation mit
          30 Tagen Starter-Testphase an.
        </p>

        <RegisterForm />
      </div>
    </main>
  );
}