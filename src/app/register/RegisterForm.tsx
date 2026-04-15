// src/app/register/RegisterForm.tsx #4
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type AppLanguage = "de" | "en";

function t(language: AppLanguage) {
  return language === "en"
    ? {
        orgNameLabel: "Organization name",
        orgNamePlaceholder: "e.g. Hunting Club Woodland",
        languageLabel: "Language",
        languageDe: "Deutsch",
        languageEn: "English",
        emailLabel: "Email",
        passwordLabel: "Password",
        passwordHint: "Please choose a password with at least 8 characters.",
        passwordRepeatLabel: "Repeat password",
        submitIdle: "Create account",
        submitLoading: "Creating account...",
        orgNameRequired: "Please enter an organization name.",
        orgNameTooShort: "The organization name is too short.",
        emailRequired: "Please enter an email address.",
        passwordRequired: "Please enter a password.",
        passwordTooShort: "The password must be at least 8 characters long.",
        passwordRepeatRequired: "Please repeat the password.",
        passwordMismatch: "Password and confirmation do not match.",
        invalidLanguage: "Please choose a valid language.",
        alreadyRegistered:
          "An account already exists for this email address. Please sign in or use password reset.",
        registerFailed: "Registration failed.",
        activateOrgFailed:
          "Account was created, but the organization could not be activated.",
      }
    : {
        orgNameLabel: "Organisationsname",
        orgNamePlaceholder: "z. B. Hegering Musterwald",
        languageLabel: "Sprache",
        languageDe: "Deutsch",
        languageEn: "English",
        emailLabel: "E-Mail",
        passwordLabel: "Passwort",
        passwordHint: "Bitte ein Passwort mit mindestens 8 Zeichen festlegen.",
        passwordRepeatLabel: "Passwort wiederholen",
        submitIdle: "Konto erstellen",
        submitLoading: "Creating account...",
        orgNameRequired: "Bitte einen Organisationsnamen eingeben.",
        orgNameTooShort: "Der Organisationsname ist zu kurz.",
        emailRequired: "Bitte eine E-Mail-Adresse eingeben.",
        passwordRequired: "Bitte ein Passwort eingeben.",
        passwordTooShort: "Das Passwort muss mindestens 8 Zeichen lang sein.",
        passwordRepeatRequired: "Bitte das Passwort wiederholen.",
        passwordMismatch: "Passwort und Wiederholung stimmen nicht überein.",
        invalidLanguage: "Bitte eine gültige Sprache auswählen.",
        alreadyRegistered:
          "Für diese E-Mail existiert bereits ein Konto. Bitte melde Dich an oder nutze Passwort vergessen.",
        registerFailed: "Registrierung fehlgeschlagen.",
        activateOrgFailed:
          "Konto wurde erstellt, aber die Organisation konnte nicht aktiviert werden.",
      };
}

export default function RegisterForm({
  initialLanguage,
}: {
  initialLanguage: AppLanguage;
}) {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [language, setLanguage] = useState<AppLanguage>(initialLanguage);
  const text = t(language);

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
      setError(text.orgNameRequired);
      return;
    }

    if (orgName.length < 2) {
      setLoading(false);
      setError(text.orgNameTooShort);
      return;
    }

    if (!["de", "en"].includes(language)) {
      setLoading(false);
      setError(text.invalidLanguage);
      return;
    }

    if (!userEmail) {
      setLoading(false);
      setError(text.emailRequired);
      return;
    }

    if (!password) {
      setLoading(false);
      setError(text.passwordRequired);
      return;
    }

    if (password.length < 8) {
      setLoading(false);
      setError(text.passwordTooShort);
      return;
    }

    if (!passwordRepeat) {
      setLoading(false);
      setError(text.passwordRepeatRequired);
      return;
    }

    if (password !== passwordRepeat) {
      setLoading(false);
      setError(text.passwordMismatch);
      return;
    }

    const signUpResult = await supabase.auth.signUp({
      email: userEmail,
      password,
      options: {
        data: {
          preferred_language: language,
          language,
        },
      },
    });

    if (signUpResult.error) {
      setLoading(false);

      if (signUpResult.error.message.includes("registered")) {
        setError(text.alreadyRegistered);
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
      setError(registerData.error ?? text.registerFailed);
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
      setError(text.activateOrgFailed);
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
          {text.orgNameLabel}
        </label>
        <input
          type="text"
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
          className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/35"
          placeholder={text.orgNamePlaceholder}
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-white">
          {text.languageLabel}
        </label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as AppLanguage)}
          className="w-full rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
        >
          <option value="de" className="bg-[#102018] text-white">
            {text.languageDe}
          </option>
          <option value="en" className="bg-[#102018] text-white">
            {text.languageEn}
          </option>
        </select>
      </div>

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
        {loading ? text.submitLoading : text.submitIdle}
      </button>
    </form>
  );
}