import { Linking, Platform } from 'react-native';

/** Digits-only phone for sms:/tel: links (keeps leading + if present). */
export function normalizePhoneForSms(phone: string): string {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

export function buildOnTheWayMessage(opts: {
  customerName?: string;
  referenceCode: string;
  etaMinutes?: number;
}): string {
  const first = (opts.customerName || '').trim().split(/\s+/)[0] || 'there';
  const eta =
    opts.etaMinutes != null && opts.etaMinutes > 0
      ? ` I'm about ${opts.etaMinutes} minutes out.`
      : '';
  return (
    `Hi ${first}, this is your Adaptivity Performance technician. ` +
    `I'm on the way for job ${opts.referenceCode}.${eta} ` +
    `Reply here if you need anything — see you soon!`
  );
}

export function buildSmsUrl(phone: string, body: string): string | null {
  const to = normalizePhoneForSms(phone);
  if (!to) return null;
  const encoded = encodeURIComponent(body);
  // iOS uses &body=, Android commonly uses ?body=
  if (Platform.OS === 'ios') {
    return `sms:${to}&body=${encoded}`;
  }
  return `sms:${to}?body=${encoded}`;
}

export async function openOnTheWaySms(opts: {
  phone: string;
  customerName?: string;
  referenceCode: string;
  etaMinutes?: number;
}): Promise<boolean> {
  const body = buildOnTheWayMessage(opts);
  const url = buildSmsUrl(opts.phone, body);
  if (!url) return false;
  const can = await Linking.canOpenURL(url);
  if (!can) {
    // Some Android builds return false for sms: even when Messages works
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  }
  await Linking.openURL(url);
  return true;
}
