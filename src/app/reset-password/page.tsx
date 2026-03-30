// src/app/reset-password/page.tsx #7
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    let resolved = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent) => {
      if (!active) return;

      if (event === "PASSWORD_RECOVERY") {
        resolved = true;
        setReady(true);
        setError("");
      }
    });

    supabase.auth
      .getSession()
      .then(
        ({
          data,
          error,
        }: {
          data: { session: Session | null };
          error: Error | null;
        }) => {
          if (!active || resolved) return;

          if (error) {
            resolved = true;
            setError(
              "Der Reset-Link konnte nicht verarbeitet werden. Bitte fordere eine neue Passwort-E-Mail an."
            );
            setReady(false);
            return;
          }

          if (data.session) {
            resolved = true;
            setReady(true);
            setError("");
          }
        }
      );

    const fallbackTimer = window.setTimeout(() => {
      if (!active || resolved) return;

      resolved = true;
      setReady(false);
      setError(
        "Der Reset-Link ist unvollständig oder ungültig. Bitte fordere eine neue Passwort-E-Mail an."
      );
    }, 2500);

    return () => {
      active = false;
      window.clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (!password) {
      setLoading(false);
      setError("Bitte ein neues Passwort eingeben.");
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

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess("Passwort erfolgreich geändert. Du wirst jetzt eingeloggt ...");

    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1200);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <div className="w-full rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div className="text-xs font-medium uppercase tracking-[0.22em] text-amber-200/80">
          Reset Password
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          Passwort zurücksetzen
        </h1>
        <p className="mt-2 text-sm text-white/68">
          Lege hier Dein neues Passwort fest.
        </p>

        {!ready && !error ? (
          <div className="mt-6 rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/72">
            Lade Reset-Link...
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-[14px] border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mt-6 rounded-[14px] border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">
            {success}
          </div>
        ) : null}

        {ready ? (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-white">
                Neues Passwort
              </label>
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
              {loading ? "Saving..." : "Passwort speichern"}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}