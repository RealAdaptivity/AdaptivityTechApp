# Verifies local readiness for Google Play Internal testing upload.
# Exit 0 = AABs + eas submit config ready; remaining steps are Play Console UI.

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$ok = $true

function Check([string]$Label, [bool]$Pass, [string]$Detail) {
  if ($Pass) { Write-Host "[OK] $Label - $Detail" -ForegroundColor Green }
  else { Write-Host "[!!] $Label - $Detail" -ForegroundColor Red; $script:ok = $false }
}

Push-Location $root
try {
  $pkg = (Get-Content app.json -Raw | ConvertFrom-Json).expo.android.package
  $eas = Get-Content eas.json -Raw | ConvertFrom-Json
  $saPath = $eas.submit.production.android.serviceAccountKeyPath
  $aabs = @(Get-ChildItem (Join-Path $root 'dist\*.aab') -ErrorAction SilentlyContinue)

  Check 'package' ($null -ne $pkg) "$pkg"
  Check 'eas submit path' ($null -ne $saPath) "$saPath"
  Check 'eas track' ($eas.submit.production.android.track -eq 'internal') 'internal'
  Check 'gitignore SA' ((Get-Content .gitignore -Raw) -match 'google-play-service-account') 'present'
  Check 'AAB downloaded' ($aabs.Count -gt 0) (($aabs | ForEach-Object { $_.Name + ' ' + [math]::Round($_.Length/1MB,1) + 'MB' }) -join ', ')
  Check 'service account JSON' (Test-Path (Join-Path $root 'google-play-service-account.json')) 'place real key at google-play-service-account.json'

  Write-Host ''
  Write-Host 'Human steps still required:' -ForegroundColor Yellow
  Write-Host '  1. Play Console account + create app listing for this package'
  Write-Host '  2. Internal testing: first manual AAB upload (Google Play App Signing)'
  Write-Host '  3. Create Google Cloud service account JSON + invite to Play Console'
  Write-Host '  4. Then: npx eas submit --profile production --platform android --latest'
  Write-Host ''
  Write-Host 'Privacy policy: https://adaptivityperformance.com/privacy'
  if (-not $ok) { exit 1 }
} finally {
  Pop-Location
}
