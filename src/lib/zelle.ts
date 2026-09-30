import { supabase } from './supabase';

/**
 * Where customers send Zelle payments. Kept in app_config (admins edit it,
 * every signed-in tech reads it) so it can change without a new app build:
 *  - zelle_qr_payload: the text inside the business's Zelle QR code
 *  - zelle_recipient:  the email or phone the business is enrolled with
 *  - zelle_display_name: the name customers see in their bank app
 */
export type ZelleConfig = { qrPayload: string | null; recipient: string | null; displayName: string | null };

const KEYS = ['zelle_qr_payload', 'zelle_recipient', 'zelle_display_name'] as const;

export async function fetchZelleConfig(): Promise<ZelleConfig> {
  const { data, error } = await supabase.from('app_config').select('key, value').in('key', [...KEYS]);
  if (error) throw new Error(error.message);
  const get = (k: (typeof KEYS)[number]) => {
    const v = (data ?? []).find((r) => r.key === k)?.value;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };
  return { qrPayload: get('zelle_qr_payload'), recipient: get('zelle_recipient'), displayName: get('zelle_display_name') };
}
