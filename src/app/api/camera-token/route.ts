export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";

function newToken() {
  // 32 bytes -> 64 hex chars, non-guessable
  return crypto.randomBytes(32).toString("hex");
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseServer();
    const body = await req.json().catch(() => null);

    const cameraId = body?.cameraId as string | undefined;
    if (!cameraId) {
      return NextResponse.json({ error: "cameraId required" }, { status: 400 });
    }

    const token = newToken();

    const { data, error } = await supabase
      .from("cameras")
      .update({ ingest_token: token })
      .eq("id", cameraId)
      .select("id, ingest_token")
      .single();

    if (error) {
      console.error("camera-token error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, camera: data });
  } catch (err: any) {
    console.error("camera-token crashed:", err);
    return NextResponse.json(
      { error: "camera-token crashed", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}