// scripts/manual-replace-storage-object.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, statSync } from "node:fs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const bucket = "camera-assets";
const targetPath = "eaf40d17-c061-4049-ac44-1ed3fa0158ec/1777308782036-f077790c1b31.jpg";
const sourcePath =
  "C:\\dev\\demo-upload\\9d71e823-e15a-4134-8281-642e8dd8195b\\seed-2f0de4f8-4ef0-4d4e-86ac-2d83039198d4-381c1688ba78.webp";

statSync(sourcePath);

const body = readFileSync(sourcePath);

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const { data, error } = await supabase.storage
  .from(bucket)
  .upload(targetPath, body, {
    contentType: "image/webp",
    upsert: true,
  });

if (error) {
  throw error;
}

console.log(
  JSON.stringify(
    {
      ok: true,
      bucket,
      targetPath,
      sourcePath,
      result: data,
    },
    null,
    2
  )
);