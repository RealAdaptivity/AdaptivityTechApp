# Downloads latest finished Android AAB via Expo artifact URL from build list JSON.
# Usage: powershell -File scripts/download-latest-aab.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $root 'dist'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

Push-Location $root
try {
  Write-Host 'Listing latest finished Android build...'
  $json = npx eas-cli build:list --platform android --status finished --limit 1 --json --non-interactive 2>$null
  if (-not $json) { throw 'No finished Android builds found' }
  $builds = $json | ConvertFrom-Json
  $build = if ($builds -is [array]) { $builds[0] } else { $builds }
  $id = $build.id
  $artifacts = $build.artifacts
  $url = $artifacts.applicationArchiveUrl
  if (-not $url) { $url = $artifacts.buildUrl }
  if (-not $url) { throw "No artifact URL on build $id" }
  $out = Join-Path $outDir 'app-release.aab'
  Write-Host "Downloading build $id ..."
  Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
  Get-Item $out | Format-List FullName, Length, LastWriteTime
  Write-Host "Saved: $out" -ForegroundColor Green
} finally {
  Pop-Location
}
