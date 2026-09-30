# Tap to Pay on iPhone — Apple review pack

Apple granted the entitlement with the *development distribution restriction*
(registered test devices only). To lift it, reply to Apple's email and upload:
three screen recordings and the completed **App Review Requirements
Checklist**. This file says where the app meets each item and how to record
each flow.

Record on a registered iPhone running a **`tap-to-pay-dev` build** (see
"Building for Tap to Pay testing" below): Apple's development restriction only
covers development-signed builds, so `preview` (ad hoc) and App Store builds
can't include Tap to Pay yet. Apple wants the
recordings made **with a second device** filming the iPhone, so the Tap to Pay
screens (which block screen recording) are visible.

## Checklist — where the app meets it

| # | Requirement | In the app |
|---|---|---|
| 1.1 | iPhone XS and later | `iphoneTapToPayStatus()` checks `isDeviceCapable`; older phones are told to use a Square reader |
| 1.4 | Handle iOS older than 17.6 | Setup and checkout say "Update this iPhone to iOS 17.6 or later" |
| 1.5 | Prepare Tap to Pay at launch / foreground | `TapToPayLaunch` warms the reader on launch and every return to the foreground |
| 1.6 | Read acceptance status from Apple, don't store it | Status always comes from `isAppleAccountLinked` |
| 2.1–2.3 | Merchant onboarding | Technician accounts are created by Adaptivity (not self-serve); sign-in then setup takes minutes |
| 3.1, 3.3 | Tell every eligible user about Tap to Pay at least once | Full-screen introduction shown once per user after sign-in |
| 3.2 | Full-screen splash (recommended) | Same introduction |
| 3.4 | Show how to enable at the end of onboarding | Introduction leads straight to "Set up Tap to Pay on iPhone" |
| 3.5 | Clear action to accept the Terms and Conditions | "Review and accept Terms and Conditions" in setup |
| 3.6 | Enable outside checkout | Settings → Card payments → "Set up Tap to Pay on iPhone" |
| 3.7 | Enable from checkout | Get paid → "Tap to Pay on iPhone" opens setup if this iPhone isn't set up |
| 3.8 / 3.8.1 | Only an admin accepts the T&Cs; others told to contact an admin | Admin role accepts (recorded in `app_config`); technicians see "Ask an admin to turn it on" until then |
| 3.9 | Invite to try it after setup (recommended) | "You're ready to take payments" screen after setup |
| 3.9.1 | Configuration progress indicator | "Setting up Tap to Pay on iPhone" with live reader status and percentage |
| 4.1 | Use ProximityReaderDiscovery on iOS 18+ | `modules/tap-to-pay-education` presents Apple's `howToTap` content |
| 4.2, 4.3 | Education after acceptance and in Settings | Shown from the ready screen and Settings → "How to use Tap to Pay on iPhone" |
| 4.5–4.8 | Contactless cards, Apple Pay/wallets, PIN & accessibility, fallback | Apple's content on iOS 18+; the app's own four pages on older iOS |
| 5.1, 5.2 | Clear Tap to Pay button, first payment option, no scrolling | "Tap to Pay on iPhone · $total" is fixed at the bottom of Get paid; Card is first, ahead of Zelle and Cash |
| 5.3 | Never greyed out | Always tappable; explains what's missing or opens setup |
| 5.6, 5.8 | Fast, clear processing | Square SDK payment sheet; reader warmed at launch |
| 5.7 | "Initializing" while configuring | The button becomes "Tap to Pay on iPhone will be ready soon" with live progress until the reader is ready |
| 5.9 | Result shown | Approved: job closed screen; declined / timed out: the reason, with retry or another method |
| 5.10 | Receipt, approved or declined | Approved: itemized signed receipt by SMS / email (Twilio, email service); declined: "Send the customer a receipt for the declined payment" (iOS share sheet) |
| 5.12 | Not approved while the app was closed | Local notification "Payment not approved" |
| 6.x | Marketing | Use only Apple's Tap to Pay on iPhone Marketing Toolkit assets in any announcement |

## Recording scripts

**1. New User Flow** (a technician iPhone that has never set it up; sign out and
reinstall first. To unlink an Apple Account for re-recording, see Apple's note
in the checklist.)
1. Sign in → full-screen "Tap to Pay on iPhone" introduction appears.
2. "Set up Tap to Pay on iPhone" → admin accepts Apple's Terms and Conditions
   (use an admin account for this recording) → progress indicator → "You're
   ready" → "Learn how to take payments" (Apple's education).

**2. Existing User Flow** (an account that already uses the app)
1. Settings → Card payments → shows Tap to Pay not enabled → "Set up Tap to Pay
   on iPhone" → accept → progress → ready → education.
2. Show Settings → "How to use Tap to Pay on iPhone" again afterwards.
3. With a non-admin account before an admin has accepted: show the "Ask an
   admin to turn it on" screen.

**3. Checkout Flow**
1. Open an on-site job → Get paid → enter a line, customer signs.
2. "Tap to Pay on iPhone · $total" → tap a card (sandbox test card or a
   contactless card in sandbox) → approved → job closed → send receipt.
3. Also show a declined/cancelled attempt and the fallback ("Paid another way").

## Building for Tap to Pay testing (development-signed)

The `tap-to-pay-dev` EAS profile signs with an **Apple Development**
certificate and an **iOS App Development** provisioning profile that you create
once and keep on your computer in `credentials.json` + `credentials/` (both
git-ignored). Windows is fine — Git for Windows includes `openssl`.

1. In the app folder, make a key and signing request (use Git Bash, or
   PowerShell with `& "C:\Program Files\Git\usr\bin\openssl.exe"`):
   ```
   mkdir credentials
   openssl genrsa -out credentials/dev.key 2048
   openssl req -new -key credentials/dev.key -out credentials/dev.csr -subj "/emailAddress=you@example.com/CN=RealAdaptivity LLC/C=US"
   ```
2. developer.apple.com → Certificates → **+** → **Apple Development** → upload
   `credentials/dev.csr` → download the `.cer` into `credentials/dev.cer`.
3. Turn it into a `.p12` (pick your own password):
   ```
   openssl x509 -inform DER -in credentials/dev.cer -out credentials/dev.pem
   openssl pkcs12 -export -legacy -inkey credentials/dev.key -in credentials/dev.pem -out credentials/dev.p12 -password pass:CHOOSE_A_PASSWORD
   ```
   (If `-legacy` is rejected, run it again without `-legacy`.)
4. developer.apple.com → Profiles → **+** → **iOS App Development** → App ID
   `com.adaptivityperformance.tech` → the certificate from step 2 → your
   registered iPhones → if asked for **Additional Entitlements**, choose **Tap to
   Pay on iPhone** → name it → download to `credentials/dev.mobileprovision`.
5. Create `credentials.json` in the app folder:
   ```json
   {
     "ios": {
       "provisioningProfilePath": "credentials/dev.mobileprovision",
       "distributionCertificate": {
         "path": "credentials/dev.p12",
         "password": "CHOOSE_A_PASSWORD"
       }
     }
   }
   ```
6. Build and install on the registered iPhone:
   ```
   npx eas-cli build --profile tap-to-pay-dev --platform ios
   ```

If EAS refuses the development profile for this build type, the alternative
is a development build from Xcode on a Mac (automatic signing handles all of
the above).

## Submitting

- The filled-in checklist (`App_Review_Requirements_Checklist_1_7_Adaptivity.numbers`)
  and the three recordings go back to Apple by replying to the entitlement email.
- Distribution: Custom App via Apple Business Manager (employees only), so the
  public-App-Store onboarding rules (2.x) don't apply and Terms and Conditions
  can also be accepted for the organization in Apple Business Connect (3.8.2).
- At launch (after the publishing entitlement): Toolkit "Launch" email to all
  techs (6.1), Toolkit "Hero" banner in the splash (6.2), push with the Toolkit
  "Value Proposition" copy (3.3 / 6.3). Only Apple Toolkit assets and copy.
- App Store Connect review notes: declare the Tap to Pay on iPhone entitlement,
  describe the use case (technicians take payment at the vehicle), give a test
  technician login, attach the checkout recording, don't mention MDM, and don't
  put "Tap to Pay" in the app name.
