import { supabase } from './supabase';

/**
 * Apple requires that only an administrator (or otherwise authorised person)
 * accepts the Tap to Pay on iPhone Terms and Conditions for the business
 * (review requirement 3.8). Admins accept; the moment is recorded in
 * app_config (admin-write, readable by every signed-in user) so technicians
 * can then enable Tap to Pay on their own iPhones, and are told to contact an
 * admin until it has happened (3.8.1).
 *
 * This records who may press the button, not whether a given iPhone is set
 * up — that is always read from Apple (1.6).
 */
const CONFIG_KEY = 'tap_to_pay_iphone_terms_accepted_at';

export async function fetchMyRole(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return (data?.role as string) ?? null;
}

export async function fetchTermsAcceptedForBusiness(): Promise<boolean> {
  const { data } = await supabase.from('app_config').select('value').eq('key', CONFIG_KEY).maybeSingle();
  return Boolean(data?.value);
}

/** Admins only (enforced by app_config's RLS). */
export async function recordTermsAcceptedForBusiness(): Promise<void> {
  const { error } = await supabase
    .from('app_config')
    .upsert({ key: CONFIG_KEY, value: new Date().toISOString(), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
