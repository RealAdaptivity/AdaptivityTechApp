import { Linking, Platform } from 'react-native';
import { normalizePhoneForSms } from './onTheWaySms';

export type ChargeReceiptLine = {
  title: string;
  laborDollars?: number;
  partsDollars?: number;
  totalDollars?: number;
};

export function buildChargeReceiptMessage(opts: {
  customerName?: string;
  referenceCode: string;
  amountDollars: number;
  kind: 'charge' | 'diagnostic_only' | 'no_show';
  lines?: ChargeReceiptLine[];
  diagnosticDollars?: number;
}): string {
  const first = (opts.customerName || '').trim().split(/\s+/)[0] || 'there';
  const amt = opts.amountDollars.toFixed(2);
  if (opts.kind === 'no_show') {
    return (
      `Hi ${first}, Adaptivity Performance charged $${amt} for a no-show / missed appointment ` +
      `(job ${opts.referenceCode}). Questions? Reply here or contact support.`
    );
  }
  if (opts.kind === 'diagnostic_only') {
    return (
      `Hi ${first}, your Adaptivity diagnostic visit is complete. We charged $${amt} for job ` +
      `${opts.referenceCode} (diagnostic only — no additional repairs). Thank you!`
    );
  }

  const parts: string[] = [
    `Hi ${first}, your Adaptivity service is complete for job ${opts.referenceCode}.`,
  ];
  const diag = opts.diagnosticDollars ?? 85;
  const itemLines: string[] = [`• Mobile diagnostic: $${diag.toFixed(2)}`];
  for (const line of opts.lines || []) {
    const title = line.title.trim();
    if (!title) continue;
    const labor = Number(line.laborDollars) || 0;
    const partsAmt = Number(line.partsDollars) || 0;
    const total = line.totalDollars ?? labor + partsAmt;
    if (total <= 0) continue;
    const detail =
      labor > 0 || partsAmt > 0
        ? ` (labor $${labor.toFixed(2)}${partsAmt > 0 ? ` + parts $${partsAmt.toFixed(2)}` : ''})`
        : '';
    itemLines.push(`• ${title}: $${total.toFixed(2)}${detail}`);
  }
  if (itemLines.length > 1) {
    parts.push('Itemized:');
    parts.push(...itemLines);
  }
  parts.push(`Total charged: $${amt}. Thank you for choosing Adaptivity Performance!`);
  return parts.join('\n');
}

function buildSmsUrl(phone: string, body: string): string | null {
  const to = normalizePhoneForSms(phone);
  if (!to) return null;
  const encoded = encodeURIComponent(body);
  if (Platform.OS === 'ios') return `sms:${to}&body=${encoded}`;
  return `sms:${to}?body=${encoded}`;
}

export async function openChargeReceiptSms(opts: {
  phone: string;
  customerName?: string;
  referenceCode: string;
  amountDollars: number;
  kind: 'charge' | 'diagnostic_only' | 'no_show';
  lines?: ChargeReceiptLine[];
  diagnosticDollars?: number;
}): Promise<boolean> {
  const url = buildSmsUrl(opts.phone, buildChargeReceiptMessage(opts));
  if (!url) return false;
  await Linking.openURL(url);
  return true;
}
