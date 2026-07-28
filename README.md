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

## EAS

Project ID is in `app.json` → `extra.eas.projectId`.

```bash
npx eas whoami
npx eas build --profile preview --platform ios
npx eas build --profile production --platform ios
npx eas submit --profile production --platform ios
```

Set EAS secrets for cloud builds (same keys as `.env`):

```bash
npx eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://qqyairzymqpkbfxobztx.supabase.co" --scope project
npx eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "…" --scope project
npx eas secret:create --name EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY --value "pk_…" --scope project
```

Keep Stripe publishable mode aligned with Supabase Edge `STRIPE_SECRET_KEY` (both test or both live).
