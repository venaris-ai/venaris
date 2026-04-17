// src/app/invite/accept/InviteAcceptForm.tsx #7
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import type { AppLanguage } from "@/lib/i18n";

type Props = {
  token: string;
  inviteEmail: string;
  language: AppLanguage;
};

function t(language: AppLanguage) {
  return language === "en"
    ? {
        emailLabel: "Invited email",
        passwordLabel: "Password *",
        passwordHint: "Please choose a password with at least 8 characters.",
        passwordRepeatLabel: "Repeat password *",
        missingPassword: "Please set a password first.",
        shortPassword: "Your password must be at least 8 characters long.",
        missingRepeat: "Please repeat the password for confirmation.",
        mismatch: "Password and confirmation do not match.",
        existingAccount:
          "An account already exists for this email. Please sign in with the existing password and then open the invitation link again.",
        autoLoginFailed:
          "Account was created, but automatic sign-in failed.",
        noSession: "No active session received after signup/login.",
        acceptFailed: "Invitation could not be accepted.",
        submitIdle: "Accept & sign in",
        submitLoading: "Accepting...",
      }
    : {
        emailLabel: "Eingeladene E-Mail",
        passwordLabel: "Passwort *",
        passwordHint: "Bitte ein Passwort mit mindestens 8 Zeichen festlegen.",
        passwordRepeatLabel: "Passwort wiederholen *",
        missingPassword: "Bitte erst ein Passwort festlegen.",
        shortPassword: "Das Passwort muss mindestens 8 Zeichen lang sein.",
        missingRepeat: "Bitte das Passwort zur Kontrolle wiederholen.",
        mismatch: "Passwort und Wiederholung stimmen nicht überein.",
        existingAccount:
          "Für diese E-Mail existiert bereits ein Account. Bitte logge Dich mit dem bestehenden Passwort ein und öffne danach den Einladungslink erneut.",
        autoLoginFailed:
          "Account wurde angelegt, aber automatisches Einloggen ist fehlgeschlagen.",
        noSession: "Keine aktive Session nach Signup/Login erhalten.",
        acceptFailed: "Einladung konnte nicht angenommen werden.",
        submitIdle: "Annehmen & einloggen",
        submitLoading: "Nehme an...",
      };
}

export default function InviteAcceptForm({
  token,
  inviteEmail,
  language,
}: Props) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const text = t(language);

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

    let session: Awaited<
      ReturnType<typeof supabase.auth.getSession>
    >["data"]["session"] | null = null;

    const signUpResult = await supabase.auth.signUp({
      email: inviteEmail,
      password,
      options: {
        data: {
          preferred_language: language,
          language,
        },
      },
    });

    if (signUpResult.error) {
      const message = signUpResult.error.message.toLowerCase();
      const accountAlreadyExists =
        message.includes("already") || message.includes("registered");

      if (!accountAlreadyExists) {
        setLoading(false);
        setError(signUpResult.error.message);
        return;
      }

      const signInExistingResult = await supabase.auth.signInWithPassword({
        email: inviteEmail,
        password,
      });

      if (signInExistingResult.error) {
        setLoading(false);
        setError(text.existingAccount);
        return;
      }

      session = signInExistingResult.data.session ?? null;
    } else {
      session = signUpResult.data.session ?? null;

      if (!session) {
        const signInResult = await supabase.auth.signInWithPassword({
          email: inviteEmail,
          password,
        });

        if (signInResult.error) {
          setLoading(false);
          setError(text.autoLoginFailed);
          return;
        }

        session = signInResult.data.session ?? null;
      }
    }

    if (!session) {
      setLoading(false);
      setError(text.noSession);
      return;
    }

    const acceptResponse = await fetch("/api/invites/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    const payload = await acceptResponse.json().catch(() => null);

    if (!acceptResponse.ok || !payload?.ok) {
      setLoading(false);
      setError(payload?.error ?? text.acceptFailed);
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
          className="mb-2 block text-sm font-medium text-white"
        >
          {text.emailLabel}
        </label>
        <input
          id="invite-email"
          type="email"
          value={inviteEmail}
          readOnly
          className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60 outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-2 block text-sm font-medium text-white"
        >
          {text.passwordLabel}
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35"
          required
        />
        <p className="mt-2 text-xs text-white/45">{text.passwordHint}</p>
      </div>

      <div>
        <label
          htmlFor="password-repeat"
          className="mb-2 block text-sm font-medium text-white"
        >
          {text.passwordRepeatLabel}
        </label>
        <input
          id="password-repeat"
          type="password"
          value={passwordRepeat}
          onChange={(e) => setPasswordRepeat(e.target.value)}
          className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35"
          required
        />
      </div>

      {error ? (
        <div className="rounded-[14px] border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="rounded-[10px] bg-[#c9952e] px-4 py-2 text-sm text-[#102018] disabled:opacity-50"
      >
        {loading ? text.submitLoading : text.submitIdle}
      </button>
    </form>
  );
}