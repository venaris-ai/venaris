// src/app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { supabaseAuthServer } from "@/lib/supabaseAuthServer";

export async function POST() {
  const supabase = await supabaseAuthServer();

  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}