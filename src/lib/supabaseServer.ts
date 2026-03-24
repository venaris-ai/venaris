// src/lib/supabaseServer.ts
import { createClient } from "@supabase/supabase-js";
import https from "https";

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
});

export function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY (service role)");

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    global: {
      fetch: (input: any, init?: any) =>
        fetch(input, { ...init, agent: httpsAgent }),
    },
  });
}