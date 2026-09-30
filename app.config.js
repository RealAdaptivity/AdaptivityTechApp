/**
 * Loads EXPO_PUBLIC_* from local .env for Expo / EAS builds.
 * Sync keys: node ../adaptivity-performance/scripts/sync-expo-env.mjs
 *
 * Expo merges app.json into `config` when both files exist — prefer that
 * over require('./app.json') so expo-doctor recognizes the linkage.
 */
const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i < 0) continue;
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

const FALLBACK_URL = 'https://qqyairzymqpkbfxobztx.supabase.co';
const FALLBACK_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxeWFpcnp5bXFwa2JmeG9ienR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTExNTUsImV4cCI6MjEwMDU4NzE1NX0.a6pkHT6fVnW6synzig51QOmR0x48fi88zi6RT7MpeLs';

loadDotEnv();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || FALLBACK_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON;

// Square Mobile Payments SDK (Tap to Pay). Set these as EAS environment
// variables (or in .env for local builds):
//   SQUARE_APPLICATION_ID            Square app id (production, or sandbox-…)
//   SQUARE_TAP_TO_PAY_IPHONE=1       only after Apple approves the Tap to Pay on
//                                    iPhone entitlement for this app
const squareApplicationId = (process.env.SQUARE_APPLICATION_ID || '').trim();
const tapToPayOnIphone = process.env.SQUARE_TAP_TO_PAY_IPHONE === '1';

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    [
      'expo-build-properties',
      {
        // Mobile Payments SDK 2.6 needs Kotlin 2.2, compileSdk 36, minSdk 28
        // and Square's Maven repository.
        android: {
          minSdkVersion: 28,
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          kotlinVersion: '2.2.21',
          extraMavenRepos: ['https://sdk.squareup.com/public/android/'],
        },
      },
    ],
    ['./plugins/withSquareMobilePayments', { applicationId: squareApplicationId, tapToPayOnIphone }],
  ],
  android: {
    ...(config.android || {}),
    permissions: [
      ...new Set([...(config.android?.permissions || []), 'INTERNET', 'ACCESS_NETWORK_STATE']),
    ],
  },
  extra: {
    ...(config.extra || {}),
    supabaseUrl,
    supabaseAnonKey,
    squareApplicationId,
  },
});
