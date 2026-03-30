// src/app/register/RegisterForm.tsx #2
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function RegisterForm() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const orgName = organizationName.trim();
    const userEmail = email.trim().toLowerCase();

    if (!orgName) {
      setLoading(false);
      setError("Bitte einen Organisationsnamen eingeben.");
      return;
    }

    if (orgName.length < 2) {
      setLoading(false);
      setError("Der Organisationsname ist zu kurz.");
      return;
    }

    if (!userEmail) {
      setLoading(false);
      setError("Bitte eine E-Mail-Adresse eingeben.");
      return;
    }

    if (!password) {
      setLoading(false);
      setError("Bitte ein Passwort eingeben.");
      return;
    }

    if (password.length < 8) {
      setLoading(false);
      setError("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }

    if (!passwordRepeat) {
      setLoading(false);
      setError("Bitte das Passwort wiederholen.");
      return;
    }

    if (password !== passwordRepeat) {
      setLoading(false);
      setError("Passwort und Wiederholung stimmen nicht überein.");
      return;
    }

    const signUpResult = await supabase.auth.signUp({
      email: userEmail,
      password,
    });

    if (signUpResult.error) {
      setLoading(false);

      if (signUpResult.error.message.includes("registered")) {
        setError(
          "Für diese E-Mail existiert bereits ein Konto. Bitte melde Dich an oder nutze Passwort vergessen."
        );
        return;
      }

      setError(signUpResult.error.message);
      return;
    }

    const registerResponse = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ organizationName: orgName }),
    });

    const registerData = await registerResponse.json();

    if (!registerResponse.ok) {
      setLoading(false);
      setError(registerData.error ?? "Registrierung fehlgeschlagen.");
      return;
    }

    const activeOrgResponse = await fetch("/api/auth/active-organization", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId: registerData.organization.id,
      }),
    });

    if (!activeOrgResponse.ok) {
      setLoading(false);
      setError(
        "Konto wurde erstellt, aber die Organisation konnte nicht aktiviert werden."
      );
      return;
    }

    setLoading(false);
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {error ? (
        <div className="rounded-[14px] border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <div>
        <label className="mb-1 block text-sm font-medium text-white">
          Organisationsname
        </label>
        <input
          type="text"
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
          className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35"
          placeholder="z. B. Revier Musterwald"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-white">E-Mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-white">Passwort</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35"
          required
        />
        <p className="mt-2 text-xs text-white/45">
          Bitte ein Passwort mit mindestens 8 Zeichen festlegen.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-white">
          Passwort wiederholen
        </label>
        <input
          type="password"
          value={passwordRepeat}
          onChange={(e) => setPasswordRepeat(e.target.value)}
          className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-[14px] bg-[#c9952e] px-4 py-2 text-sm font-medium text-[#102018] disabled:opacity-50"
      >
        {loading ? "Creating account..." : "Konto erstellen"}
      </button>
    </form>
  );
}