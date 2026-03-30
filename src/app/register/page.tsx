// src/app/register/page.tsx #2
import RegisterForm from "./RegisterForm";

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <div className="w-full rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
          Register
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          Venaris Konto erstellen
        </h1>
        <p className="mt-2 text-sm text-white/68">
          Erstelle Dein Konto und lege direkt Deine erste Organisation mit
          30 Tagen Starter-Testphase an.
        </p>

        <RegisterForm />
      </div>
    </main>
  );
}