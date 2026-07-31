# Opens Play Console Internal testing upload path and the local AAB folder.
# Usage (from app root):
#   powershell -File scripts/open-manual-aab-upload.ps1 -App tech
#   powershell -File scripts/open-manual-aab-upload.ps1 -App customer

param(
  [ValidateSet('tech','customer','both')]
  [string]$App = 'both'
)

function Open-Upload([string]$Label, [string]$Package, [string]$AabPath, [string]$ExpoBuildUrl) {
  Write-Host ''
  Write-Host "=== $Label ===" -ForegroundColor Cyan
  Write-Host "Package: $Package"
  Write-Host "AAB:     $AabPath"
  if (Test-Path $AabPath) {
    $len = (Get-Item $AabPath).Length
    Write-Host ("Size:    {0:N1} MB" -f ($len / 1MB))
    Start-Process (Split-Path $AabPath -Parent)
  } else {
    Write-Host 'AAB missing - download from Expo build page first.' -ForegroundColor Yellow
    if ($ExpoBuildUrl) { Start-Process $ExpoBuildUrl }
  }
  Write-Host 'Play Console: create Internal testing release, choose Google Play App Signing, Upload AAB.'
}

$scratch = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
# Prefer running from each repo; fall back to sibling paths
$techRoot = Join-Path $scratch 'adaptivity-tech-app'
$custRoot = Join-Path $scratch 'adaptivity-customer-app'
if (-not (Test-Path $techRoot)) { $techRoot = Split-Path $PSScriptRoot -Parent }

Write-Host 'Manual first upload required by Google. After both apps have one release, eas submit works.' -ForegroundColor Yellow
Start-Process 'https://play.google.com/console/u/0/developers'
Start-Process 'https://expo.fyi/first-android-submission'

if ($App -eq 'tech' -or $App -eq 'both') {
  Open-Upload `
    -Label 'Adaptivity Tech Dispatch' `
    -Package 'com.adaptivityperformance.tech' `
    -AabPath (Join-Path $techRoot 'dist\adaptivity-tech-dispatch.aab') `
    -ExpoBuildUrl 'https://expo.dev/accounts/adaptivityperformance/projects/adaptivity-tech-dispatch/builds/f06e9bdd-d3ae-4bac-9a72-8a2d72316efa'
}

if ($App -eq 'customer' -or $App -eq 'both') {
  Open-Upload `
    -Label 'Adaptivity Customer Portal' `
    -Package 'com.adaptivityperformance.customer' `
    -AabPath (Join-Path $custRoot 'dist\adaptivity-customer-app.aab') `
    -ExpoBuildUrl 'https://expo.dev/accounts/adaptivityperformance/projects/adaptivity-customer-app/builds/f176a10d-faa9-4bd1-a6d4-cf2b6f25f2ca'
}

Write-Host ''
Write-Host 'Done opening Play Console + AAB folders.' -ForegroundColor Green
