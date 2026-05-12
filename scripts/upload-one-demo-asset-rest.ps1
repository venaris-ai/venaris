# scripts/upload-one-demo-asset-rest.ps1

$ErrorActionPreference = "Stop"

$EnvFile = ".env.local"

if (-not (Test-Path $EnvFile)) {
  throw ".env.local not found"
}

# .env.local laden, ohne Werte auszugeben
Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()

  if (-not $line) { return }
  if ($line.StartsWith("#")) { return }
  if ($line -notmatch "=") { return }

  $parts = $line -split "=", 2
  $name = $parts[0].Trim()
  $value = $parts[1].Trim().Trim('"').Trim("'")

  [Environment]::SetEnvironmentVariable($name, $value, "Process")
}

$supabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL
if (-not $supabaseUrl) {
  $supabaseUrl = $env:SUPABASE_URL
}

$serviceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $supabaseUrl) {
  throw "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL"
}

if (-not $serviceRoleKey) {
  throw "Missing SUPABASE_SERVICE_ROLE_KEY"
}

$bucket = "camera-assets"
$folder = "9f5b2da6-6ce4-4f9e-879b-0746d0e81e98"
$filename = "demo-source-roe_deer-count-3.webp"

# Wenn Du die reparierte Datei hochladen willst, diese Zeile nutzen:
$localPath = "C:\dev\demo-upload_2\$folder\demo-source-roe_deer-count-3.repaired.webp"

# Alternativ Original:
# $localPath = "C:\dev\demo-upload_2\$folder\$filename"

if (-not (Test-Path $localPath)) {
  throw "Local file not found: $localPath"
}

$objectPath = "$folder/$filename"
$url = "$supabaseUrl/storage/v1/object/$bucket/$objectPath"

Write-Host "Uploading:"
Write-Host $objectPath

curl.exe `
  --fail-with-body `
  --request POST `
  --url $url `
  --header "Authorization: Bearer $serviceRoleKey" `
  --header "apikey: $serviceRoleKey" `
  --header "Content-Type: image/webp" `
  --header "x-upsert: true" `
  --data-binary "@$localPath"

Write-Host ""
Write-Host "Upload finished."