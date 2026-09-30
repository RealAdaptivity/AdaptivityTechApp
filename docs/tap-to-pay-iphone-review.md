# Tap to Pay on iPhone — Apple review pack

Apple granted the entitlement with the *development distribution restriction*
(registered test devices only). To lift it, reply to Apple's email and upload:
three screen recordings and the completed **App Review Requirements
Checklist**. This file says where the app meets each item and how to record
each flow.

Record on a **registered iPhone running a `preview` build**
(`npx eas-cli build --profile preview --platform ios`). Apple wants the
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
| 5.1, 5.2 | Clear Tap to Pay button, first payment option | "Tap to Pay on iPhone · $total" is the first option on Get paid |
| 5.3 | Never greyed out | Always tappable; explains what's missing or opens setup |
| 5.6–5.8 | Fast, clear processing | Square SDK payment sheet; reader warmed at launch |
| 5.9–5.11 | Result shown, digital receipt | Job closed screen with total, then text/email receipt |
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
