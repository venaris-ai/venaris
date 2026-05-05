// scripts/inspect-asset-exif.mjs
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import exifrDefault, * as exifrNS from "exifr";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const STORAGE_PATH =
  "df34afc9-5300-4819-9d1d-9579aad29914/1777981693674-696ce2163be6.jpg";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function exifrParse() {
  return exifrNS?.parse || exifrDefault?.parse || exifrNS?.default?.parse || null;
}

function describeValue(label, value) {
  console.log(`\n${label}:`);
  console.log("value:", value);
  console.log("typeof:", typeof value);
  console.log("toStringTag:", Object.prototype.toString.call(value));

  if (value instanceof Date) {
    console.log("date.toISOString():", value.toISOString());
    console.log("date.getTime():", value.getTime());
  }
}

const { data, error } = await supabase.storage
  .from("camera-assets")
  .download(STORAGE_PATH);

if (error || !data) {
  throw new Error(`Storage download failed: ${error?.message || "no data"}`);
}

const buf = Buffer.from(await data.arrayBuffer());

console.log("storagePath:", STORAGE_PATH);
console.log("bytes:", buf.length);

const parseFn = exifrParse();
if (!parseFn) throw new Error("exifr.parse not available");

const exif = await parseFn(buf, {
  tiff: true,
  exif: true,
  gps: false,
  ifd0: true,
});

console.log("\nEXIF keys:");
console.log(Object.keys(exif || {}).sort());

describeValue("DateTimeOriginal", exif?.DateTimeOriginal);
describeValue("CreateDate", exif?.CreateDate);
describeValue("ModifyDate", exif?.ModifyDate);
describeValue("DateTime", exif?.DateTime);

const picked =
  exif?.DateTimeOriginal ||
  exif?.CreateDate ||
  exif?.ModifyDate ||
  exif?.DateTime ||
  null;

describeValue("picked", picked);