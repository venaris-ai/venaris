"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function LoginForm() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  setLoading(true);
  setError("");

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  console.log("login data", data);
  console.log("login error", error);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  console.log("session after login", session);

  setLoading(false);

  if (error) {
    setError(error.message);
    return;
  }

  router.push("/");
  router.refresh();
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
        <label className="mb-1 block text-sm font-medium">Password</label>
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