export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const supabase = supabaseServer();

  const url = new URL(req.url);
  const onlyRelevant = url.searchParams.get("onlyRelevant") === "true";

  let q = supabase
    .from("assets")
    .select("id,storage_path,status,created_at,relevant")
    .order("created_at", { ascending: false })
    .limit(30);

  if (onlyRelevant) q = q.eq("relevant", true);

  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assets: data ?? [] });
}