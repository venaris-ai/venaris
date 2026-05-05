# scripts/audit-orphan-files.ps1
# Scans tracked repo files for orphan-file candidates.
# This script does NOT delete anything.

$ErrorActionPreference = "Stop"

$repoRoot = (Get-Location).Path
$outDir = Join-Path $repoRoot "tmp\orphan-audit"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$trackedFiles = git ls-files | Where-Object {
  $_ -and
  $_ -notmatch '(^|/)node_modules/' -and
  $_ -notmatch '(^|/)\.next/' -and
  $_ -notmatch '(^|/)dist/' -and
  $_ -notmatch '(^|/)build/' -and
  $_ -notmatch '(^|/)coverage/'
}

$textExtensions = @(
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".css", ".scss", ".json", ".md", ".sql",
  ".yml", ".yaml", ".html", ".txt", ".env.example"
)

$sourceFiles = $trackedFiles | Where-Object {
  $ext = [System.IO.Path]::GetExtension($_)
  $textExtensions -contains $ext
}

$candidateExtensions = @(
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".css", ".scss", ".sql", ".md"
)

$nextConventionNames = @(
  "page.tsx", "page.ts",
  "layout.tsx", "layout.ts",
  "route.ts", "route.tsx",
  "loading.tsx", "loading.ts",
  "error.tsx", "error.ts",
  "not-found.tsx", "not-found.ts",
  "template.tsx", "template.ts",
  "default.tsx", "default.ts",
  "global-error.tsx", "global-error.ts",
  "middleware.ts", "instrumentation.ts"
)

$knownEntryPatterns = @(
  "^next\.config\.",
  "^tailwind\.config\.",
  "^postcss\.config\.",
  "^eslint\.config\.",
  "^tsconfig\.json$",
  "^package\.json$",
  "^package-lock\.json$",
  "^vercel\.json$",
  "^supabase/",
  "^public/",
  "^scripts/",
  "^migrations/",
  "^supabase/migrations/"
)

function Test-KnownEntryFile {
  param([string]$Path)

  $fileName = Split-Path $Path -Leaf

  if ($nextConventionNames -contains $fileName -and $Path -match "^src/app/") {
    return $true
  }

  foreach ($pattern in $knownEntryPatterns) {
    if ($Path -match $pattern) {
      return $true
    }
  }

  return $false
}

function Get-ReferencePatterns {
  param([string]$Path)

  $normalized = $Path -replace "\\", "/"
  $withoutExt = $normalized -replace '\.[^.]+$', ''
  $fileName = Split-Path $normalized -Leaf
  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($normalized)

  $patterns = New-Object System.Collections.Generic.List[string]

  # Direct relative/repo path references
  $patterns.Add([regex]::Escape($normalized))
  $patterns.Add([regex]::Escape($withoutExt))

  # Common Next alias references
  if ($normalized -match "^src/(.+)$") {
    $aliasPath = "@/" + $Matches[1]
    $aliasWithoutExt = $aliasPath -replace '\.[^.]+$', ''
    $patterns.Add([regex]::Escape($aliasPath))
    $patterns.Add([regex]::Escape($aliasWithoutExt))
  }

  # Filename references for assets/scripts/docs. Noisy, but useful as weak evidence.
  if ($fileName.Length -gt 5) {
    $patterns.Add([regex]::Escape($fileName))
  }

  # Component/function style basename reference. Also noisy, but useful as weak evidence.
  if ($baseName.Length -gt 4 -and $baseName -cmatch "^[A-Z][A-Za-z0-9]+$") {
    $patterns.Add("\b" + [regex]::Escape($baseName) + "\b")
  }

  return $patterns | Select-Object -Unique
}

$results = @()

foreach ($file in $trackedFiles) {
  $ext = [System.IO.Path]::GetExtension($file)
  if ($candidateExtensions -notcontains $ext) {
    continue
  }

  $isKnownEntry = Test-KnownEntryFile -Path $file
  $patterns = Get-ReferencePatterns -Path $file

  $hits = @()

  foreach ($pattern in $patterns) {
    foreach ($src in $sourceFiles) {
      if ($src -eq $file) {
        continue
      }

      $fullSrc = Join-Path $repoRoot $src

      try {
        $match = Select-String -Path $fullSrc -Pattern $pattern -CaseSensitive -SimpleMatch:$false -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($match) {
          $hits += [PSCustomObject]@{
            ReferencedBy = $src
            Pattern      = $pattern
            LineNumber   = $match.LineNumber
            Line         = ($match.Line.Trim() -replace '\s+', ' ')
          }
        }
      } catch {
        # Ignore unreadable/binary-ish files
      }
    }
  }

  $uniqueReferencers = $hits | Select-Object -ExpandProperty ReferencedBy -Unique

  $risk = "keep"
  $reason = "referenced or known entrypoint"

  if (-not $isKnownEntry -and $uniqueReferencers.Count -eq 0) {
    $risk = "candidate"
    $reason = "no static references found and not recognized as framework/config/script/public entrypoint"
  } elseif (-not $isKnownEntry -and $uniqueReferencers.Count -le 1) {
    $risk = "review"
    $reason = "very few static references found"
  } elseif ($isKnownEntry) {
    $risk = "entrypoint"
    $reason = "known entrypoint or convention file"
  }

  $results += [PSCustomObject]@{
    Risk              = $risk
    File              = $file
    Extension         = $ext
    KnownEntry        = $isKnownEntry
    ReferenceCount    = $uniqueReferencers.Count
    ReferencedBy      = ($uniqueReferencers -join " ; ")
    Reason            = $reason
  }
}

$results |
  Sort-Object Risk, File |
  Export-Csv -NoTypeInformation -Encoding UTF8 (Join-Path $outDir "orphan-file-audit.csv")

$results |
  Where-Object { $_.Risk -in @("candidate", "review") } |
  Sort-Object Risk, File |
  Format-Table -AutoSize

Write-Host ""
Write-Host "Wrote: tmp\orphan-audit\orphan-file-audit.csv"