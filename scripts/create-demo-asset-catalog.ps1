# C:\dev\venaris\scripts\create-demo-asset-catalog.ps1
# Erstellt eine manuell ergänzbare CSV für Demo-Bild-Mapping:
# datei_ordner,dateiname,top_species,top_count

$RootPath = "C:\dev\demo-upload_2"
$OutputCsv = "C:\dev\demo-upload_2\demo_asset_catalog.csv"
$MaxImagesPerFolder = 10

$ImageExtensions = @(".jpg", ".jpeg", ".png", ".webp")

if (-not (Test-Path $RootPath)) {
  throw "RootPath not found: $RootPath"
}

$rows = Get-ChildItem -Path $RootPath -Directory | ForEach-Object {
  $folder = $_

  Get-ChildItem -Path $folder.FullName -File |
    Where-Object { $ImageExtensions -contains $_.Extension.ToLowerInvariant() } |
    Sort-Object Name |
    Select-Object -First $MaxImagesPerFolder |
    ForEach-Object {
      [PSCustomObject]@{
        datei_ordner = $folder.Name
        dateiname    = $_.Name
        top_species  = ""
        top_count    = ""
      }
    }
}

$rows |
  Export-Csv -Path $OutputCsv -NoTypeInformation -Encoding UTF8

Write-Host "CSV created:" $OutputCsv
Write-Host "Rows:" ($rows.Count)