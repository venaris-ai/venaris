// src/app/invite/accept/InviteAcceptForm.tsx #5b
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

  let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null =
    null;

  const signUpResult = await supabase.auth.signUp({
    email: inviteEmail,
    password,
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
      setError(
        "Für diese E-Mail existiert bereits ein Account. Bitte logge Dich mit dem bestehenden Passwort ein und öffne danach den Einladungslink erneut."
      );
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
        setError(
          "Account wurde angelegt, aber automatisches Einloggen ist fehlgeschlagen."
        );
        return;
      }

      session = signInResult.data.session ?? null;
    }
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
          className="mb-2 block text-sm font-medium text-white"
        >
          Eingeladene E-Mail
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
          Passwort *
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35"
          required
        />
        <p className="mt-2 text-xs text-white/45">
          Bitte ein Passwort mit mindestens 8 Zeichen festlegen.
        </p>
      </div>

      <div>
        <label
          htmlFor="password-repeat"
          className="mb-2 block text-sm font-medium text-white"
        >
          Passwort wiederholen *
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
        {loading ? "Nimmt an..." : "Annehmen & einloggen"}
      </button>
    </form>
  );
}