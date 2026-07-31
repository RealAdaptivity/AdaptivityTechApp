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

module.exports = ({ config }) => ({
  ...config,
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
  },
});
