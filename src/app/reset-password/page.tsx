// src/app/reset-password/page.tsx #8
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type AppLanguage = "de" | "en";

const LOCALE_COOKIE = "venaris_locale";

function normalizeLanguage(value: string | null | undefined): AppLanguage {
  return value === "en" ? "en" : "de";
}

function readLocaleCookie(): AppLanguage {
  if (typeof document === "undefined") return "de";

  const raw = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${LOCALE_COOKIE}=`));

  if (!raw) return "de";

  const value = raw.slice(`${LOCALE_COOKIE}=`.length);
  return normalizeLanguage(decodeURIComponent(value));
}

function t(language: AppLanguage) {
  return language === "en"
    ? {
        eyebrow: "Reset Password",
        title: "Reset password",
        body: "Set your new password here.",
        loadingLink: "Loading reset link...",
        linkError:
          "The reset link is incomplete or invalid. Please request a new password email.",
        processError:
          "The reset link could not be processed. Please request a new password email.",
        passwordLabel: "New password",
        passwordHint: "Please choose a password with at least 8 characters.",
        passwordRepeatLabel: "Repeat password",
        saveIdle: "Save password",
        saveLoading: "Saving...",
        success: "Password changed successfully. You are now being signed in...",
        missingPassword: "Please enter a new password.",
        shortPassword: "The password must be at least 8 characters long.",
        missingRepeat: "Please repeat the password for confirmation.",
        mismatch: "Password and confirmation do not match.",
      }
    : {
        eyebrow: "Reset Password",
        title: "Passwort zurücksetzen",
        body: "Lege hier Dein neues Passwort fest.",
        loadingLink: "Lade Reset-Link...",
        linkError:
          "Der Reset-Link ist unvollständig oder ungültig. Bitte fordere eine neue Passwort-E-Mail an.",
        processError:
          "Der Reset-Link konnte nicht verarbeitet werden. Bitte fordere eine neue Passwort-E-Mail an.",
        passwordLabel: "Neues Passwort",
        passwordHint: "Bitte ein Passwort mit mindestens 8 Zeichen festlegen.",
        passwordRepeatLabel: "Passwort wiederholen",
        saveIdle: "Passwort speichern",
        saveLoading: "Saving...",
        success: "Passwort erfolgreich geändert. Du wirst jetzt eingeloggt ...",
        missingPassword: "Bitte ein neues Passwort eingeben.",
        shortPassword: "Das Passwort muss mindestens 8 Zeichen lang sein.",
        missingRepeat: "Bitte das Passwort zur Kontrolle wiederholen.",
        mismatch: "Passwort und Wiederholung stimmen nicht überein.",
      };
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const language = useMemo(() => readLocaleCookie(), []);
  const text = t(language);

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
            setError(text.processError);
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
      setError(text.linkError);
    }, 2500);

    return () => {
      active = false;
      window.clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, [supabase, text.linkError, text.processError]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (!password) {
      setLoading(false);
      setError(text.missingPassword);
      return;
    }

    if (password.length < 8) {
      setLoading(false);
      setError(text.shortPassword);
      return;
    }

    if (!passwordRepeat) {
      setLoading(false);
      setError(text.missingRepeat);
      return;
    }

    if (password !== passwordRepeat) {
      setLoading(false);
      setError(text.mismatch);
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

    setSuccess(text.success);

    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1200);
  }

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

        {!ready && !error ? (
          <div className="mt-6 rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/72">
            {text.loadingLink}
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
                {text.passwordLabel}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35"
                required
              />
              <p className="mt-2 text-xs text-white/45">{text.passwordHint}</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-white">
                {text.passwordRepeatLabel}
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
              {loading ? text.saveLoading : text.saveIdle}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}