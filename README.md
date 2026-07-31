# Adaptivity Tech Dispatch (Expo)

Native tech app for job board, on-site pricing (labor + parts charge / diagnostic-only), GPS, and Stripe Connect earnings.

## Stack

- Expo SDK 57 / React Native
- Supabase Auth + Realtime
- EAS Build / Submit (`owner`: `adaptivityperformance`, slug: `adaptivity-tech-dispatch`)

## Setup

```bash
npm install
# From adaptivity-performance:
node scripts/sync-expo-env.mjs
npm start
```

Copy `.env.example` → `.env` if you are not using the sync script. Never commit `.env`.

## GitHub

```text
https://github.com/RealAdaptivity/AdaptivityTechApp
```

## Google Play (Android)

Package: `com.adaptivityperformance.tech`

Privacy policy (store listing): https://adaptivityperformance.com/privacy

### First-time Play Console (manual)

1. Sign up: https://play.google.com/apps/publish/signup/ (~$25 once).
2. **Create app** → name **Adaptivity Tech Dispatch** → App → Free.
3. Complete **Internal testing** setup (tester email list including yourself).
4. Build AAB (below), download it, then **Internal testing → Create release → Upload AAB**.
   Use **Google-managed Play App Signing**. First upload must be manual ([expo.fyi](https://expo.fyi/first-android-submission)).

### Service account (for later `eas submit`)

1. Google Cloud → create service account → JSON key.
2. Enable **Google Play Android Developer API**.
3. Play Console → Users and permissions → invite the service account email (release + draft + store presence).
4. Save the real key as `google-play-service-account.json` in this repo root (gitignored). See `google-play-service-account.example.json`.

```bash
npx eas whoami
npx eas build --profile preview --platform ios
npx eas build --profile production --platform ios
npx eas build --profile production --platform android
npx eas submit --profile production --platform ios
npx eas submit --profile production --platform android --latest
```

Set EAS env (already configured for production/preview on this project via `eas env:create`):

```bash
npx eas env:list --environment production
```

Keep Stripe publishable mode aligned with Supabase Edge `STRIPE_SECRET_KEY` (both test or both live).
