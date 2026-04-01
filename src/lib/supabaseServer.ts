// src/lib/supabaseServer.ts #2
import { createClient } from "@supabase/supabase-js";
import { Agent } from "undici";

const undiciAgent = new Agent({
  connect: {
    timeout: 30_000,
  },
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
});

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetch(input, {
        ...init,
        dispatcher: undiciAgent,
      } as RequestInit & { dispatcher: Agent });
    } catch (error) {
      lastError = error;

      if (attempt === 1) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) {
    throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY (service role)");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    global: {
      fetch: fetchWithRetry,
    },
  });
}