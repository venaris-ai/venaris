// src/app/login/LoginForm.tsx #3
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = supabaseBrowser();

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
      setError("Bitte zuerst Deine E-Mail-Adresse eingeben.");
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

    setResetMessage(
      "Wenn für diese E-Mail ein Account existiert, wurde eine Nachricht zum Zurücksetzen des Passworts versendet."
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">E-Mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2"
          required
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-3">
          <label className="block text-sm font-medium">Password</label>
          <button
            type="button"
            onClick={onForgotPassword}
            disabled={resetLoading}
            className="text-xs text-neutral-600 underline underline-offset-2 hover:text-black disabled:opacity-50"
          >
            {resetLoading ? "Sending..." : "Forgot password?"}
          </button>
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2"
          required
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {resetMessage ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {resetMessage}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}