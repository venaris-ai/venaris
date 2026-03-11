"use client";

import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");

  client = createBrowserClient(url, anonKey);

  return client;
}