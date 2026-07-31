import Constants from 'expo-constants';

const FALLBACK_URL = 'https://qqyairzymqpkbfxobztx.supabase.co';
const FALLBACK_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxeWFpcnp5bXFwa2JmeG9ienR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTExNTUsImV4cCI6MjEwMDU4NzE1NX0.a6pkHT6fVnW6synzig51QOmR0x48fi88zi6RT7MpeLs';

function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  const v = value.trim();
  if (!v || v === 'undefined' || v === 'null') return '';
  return v;
}

const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export const SUPABASE_URL =
  clean(process.env.EXPO_PUBLIC_SUPABASE_URL) ||
  clean(extra.supabaseUrl) ||
  FALLBACK_URL;

export const SUPABASE_ANON_KEY =
  clean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ||
  clean(extra.supabaseAnonKey) ||
  FALLBACK_ANON;
