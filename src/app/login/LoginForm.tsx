// src/app/login/LoginForm.tsx #5
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type AppLanguage = "de" | "en";

function t(language: AppLanguage) {
  return language === "en"
    ? {
        emailLabel: "Email",
        passwordLabel: "Password",
        forgotPassword: "Forgot password?",
        sending: "Sending...",
        signIn: "Sign in",
        signingIn: "Signing in...",
        enterEmailFirst: "Please enter your email address first.",
        resetMessage:
          "If an account exists for this email address, a password reset email has been sent.",
      }
    : {
        emailLabel: "E-Mail",
        passwordLabel: "Passwort",
        forgotPassword: "Passwort vergessen?",
        sending: "Sende...",
        signIn: "Anmelden",
        signingIn: "Meldet an...",
        enterEmailFirst: "Bitte zuerst Deine E-Mail-Adresse eingeben.",
        resetMessage:
          "Wenn für diese E-Mail ein Account existiert, wurde eine Nachricht zum Zurücksetzen des Passworts versendet.",
      };
}

export default function LoginForm({
  language,
}: {
  language: AppLanguage;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = supabaseBrowser();
  const text = t(language);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResetMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    const next = searchParams.get("next");

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push(next || "/");
    router.refresh();
  }

  async function onForgotPassword() {
    setError("");
    setResetMessage("");

    if (!email.trim()) {
      setError(text.enterEmailFirst);
      return;
    }

    setResetLoading(true);

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/reset-password`
        : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    setResetLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setResetMessage(text.resetMessage);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-white">
          {text.emailLabel}
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35"
          required
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-3">
          <label className="block text-sm font-medium text-white">
            {text.passwordLabel}
          </label>
          <button
            type="button"
            onClick={onForgotPassword}
            disabled={resetLoading}
            className="text-xs text-white/60 underline underline-offset-2 hover:text-white disabled:opacity-50"
          >
            {resetLoading ? text.sending : text.forgotPassword}
          </button>
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35"
          required
        />
      </div>

      {error ? (
        <div className="rounded-[14px] border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {resetMessage ? (
        <div className="rounded-[14px] border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">
          {resetMessage}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-[14px] bg-[#c9952e] px-4 py-2 text-sm font-medium text-[#102018] disabled:opacity-50"
      >
        {loading ? text.signingIn : text.signIn}
      </button>
    </form>
  );
}