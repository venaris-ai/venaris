export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const supabase = supabaseServer();
  const body = await req.json().catch(() => null);

  const assetId = body?.assetId as string | undefined;
  const relevant = body?.relevant as boolean | undefined;

  if (!assetId || typeof relevant !== "boolean") {
    return NextResponse.json(
      { error: "assetId and relevant required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("assets")
    .update({ relevant })
    .eq("id", assetId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}