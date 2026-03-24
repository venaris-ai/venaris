// src/app/invite/accept/InviteAcceptForm.tsx #4
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Props = {
  token: string;
  inviteEmail: string;
};

export default function InviteAcceptForm({
  token,
  inviteEmail,
}: Props) {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!password) {
      setLoading(false);
      setError("Bitte erst ein Passwort festlegen.");
      return;
    }

    if (password.length < 8) {
      setLoading(false);
      setError("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }

    if (!passwordRepeat) {
      setLoading(false);
      setError("Bitte das Passwort zur Kontrolle wiederholen.");
      return;
    }

    if (password !== passwordRepeat) {
      setLoading(false);
      setError("Passwort und Wiederholung stimmen nicht überein.");
      return;
    }

    const signUpResult = await supabase.auth.signUp({
      email: inviteEmail,
      password,
    });

    if (signUpResult.error) {
      setLoading(false);
      setError(
        signUpResult.error.message.includes("already") ||
          signUpResult.error.message.includes("registered")
          ? "Für diese E-Mail existiert bereits ein Account. Bitte logge Dich mit dieser E-Mail ein und öffne danach den Einladungslink erneut."
          : signUpResult.error.message
      );
      return;
    }

    let session = signUpResult.data.session ?? null;

    if (!session) {
      const signInResult = await supabase.auth.signInWithPassword({
        email: inviteEmail,
        password,
      });

      if (signInResult.error) {
        setLoading(false);
        setError(
          "Account wurde angelegt, aber automatisches Einloggen ist fehlgeschlagen."
        );
        return;
      }

      session = signInResult.data.session ?? null;
    }

    if (!session) {
      setLoading(false);
      setError("Keine aktive Session nach Signup/Login erhalten.");
      return;
    }

    const acceptResponse = await fetch("/api/invites/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (!acceptResponse.ok) {
      const payload = await acceptResponse.json().catch(() => null);
      setLoading(false);
      setError(payload?.error ?? "Einladung konnte nicht angenommen werden.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="invite-email"
          className="mb-2 block text-sm font-medium text-gray-900"
        >
          Eingeladene E-Mail
        </label>
        <input
          id="invite-email"
          type="email"
          value={inviteEmail}
          readOnly
          className="w-full rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-600 outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-2 block text-sm font-medium text-gray-900"
        >
          Passwort *
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm outline-none"
          required
        />
        <p className="mt-2 text-xs text-gray-500">
          Bitte ein Passwort mit mindestens 8 Zeichen festlegen.
        </p>
      </div>

      <div>
        <label
          htmlFor="password-repeat"
          className="mb-2 block text-sm font-medium text-gray-900"
        >
          Passwort wiederholen *
        </label>
        <input
          id="password-repeat"
          type="password"
          value={passwordRepeat}
          onChange={(e) => setPasswordRepeat(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm outline-none"
          required
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md border border-black bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {loading ? "Nimmt an..." : "Annehmen & einloggen"}
      </button>
    </form>
  );
}