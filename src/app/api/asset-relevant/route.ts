// src/app/api/asset-relevant/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const supabase = supabaseServer();
    const body = await req.json().catch(() => null);

    const assetId = body?.assetId as string | undefined;
    const relevant = body?.relevant as boolean | null | undefined;

    if (!assetId || relevant === undefined) {
      return NextResponse.json(
        { error: "assetId and relevant required" },
        { status: 400 }
      );
    }

    const patch: any = { relevant };

    // Wenn User override = relevant → empty zurücksetzen
    if (relevant === true) {
      patch.empty = false;
      patch.empty_confidence = null;
    }

    const { error } = await supabase
      .from("assets")
      .update(patch)
      .eq("id", assetId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: "asset_relevant_api_crashed", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}