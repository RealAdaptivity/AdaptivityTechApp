# Opens Google Play Console and prints first-time checklist for both Adaptivity Android apps.
# Run: powershell -File scripts/open-play-console-setup.ps1

Write-Host ''
Write-Host '=== Adaptivity Google Play - first-time setup ===' -ForegroundColor Cyan
Write-Host ''
Write-Host '1. Developer account signup (if needed):'
Write-Host '   https://play.google.com/apps/publish/signup/'
Write-Host ''
Write-Host '2. Create TWO apps (Create app -> App -> Free):'
Write-Host '   - Adaptivity Tech Dispatch'
Write-Host '     package: com.adaptivityperformance.tech'
Write-Host '   - Adaptivity Customer Portal'
Write-Host '     package: com.adaptivityperformance.customer'
Write-Host ''
Write-Host '3. Privacy policy URL (already live):'
Write-Host '   https://adaptivityperformance.com/privacy'
Write-Host ''
Write-Host '4. For each app: Internal testing -> create tester email list -> Create release -> Upload AAB'
Write-Host '   Prefer Google-managed Play App Signing.'
Write-Host '   First AAB upload MUST be manual (Google API limitation).'
Write-Host ''
Write-Host '5. Service account for later eas submit:'
Write-Host '   - Google Cloud -> Service account -> JSON key'
Write-Host '   - Enable Google Play Android Developer API'
Write-Host '   - Play Console -> Users and permissions -> invite SA email to BOTH apps'
Write-Host '   - Save JSON as google-play-service-account.json in each app repo root (gitignored)'
Write-Host ''

Start-Process 'https://play.google.com/console/u/0/developers'
Start-Process 'https://play.google.com/apps/publish/signup/'
Start-Process 'https://console.cloud.google.com/iam-admin/serviceaccounts'
Start-Process 'https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com'

Write-Host 'Browser tabs opened for Play Console, signup, and Cloud service accounts.' -ForegroundColor Green
