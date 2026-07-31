/** Device SMS composer for on-the-way / receipt texts.
 *  Twilio auto-send (`send-sms` edge) stays deployed but unused until volume justifies it.
 */

import { supabase } from './supabase';
import {
  buildChargeReceiptMessage,
  openChargeReceiptSms,
} from './chargeReceiptSms';
import { buildOnTheWayMessage, openOnTheWaySms, normalizePhoneForSms } from './onTheWaySms';

export type SendBookingSmsResult = {
  sent: boolean;
  via: 'twilio' | 'device' | 'none';
  skipped?: string;
  error?: string;
};

/** Prefer device SMS until Twilio is enabled for production volume. */
export async function sendBookingSms(opts: {
  to: string;
  body: string;
  bookingReference?: string;
}): Promise<SendBookingSmsResult> {
  void opts.body;
  void opts.bookingReference;
  const to = normalizePhoneForSms(opts.to);
  if (!to) return { sent: false, via: 'none', error: 'No phone number' };
  return { sent: false, via: 'none', skipped: 'Twilio deferred — use device SMS' };
}

export async function sendOnTheWaySmsAuto(opts: {
  phone: string;
  customerName?: string;
  referenceCode: string;
  etaMinutes?: number;
}): Promise<SendBookingSmsResult> {
  void buildOnTheWayMessage(opts);
  const opened = await openOnTheWaySms(opts);
  if (opened) return { sent: true, via: 'device' };
  return { sent: false, via: 'none', error: 'No phone number' };
}

export async function sendChargeReceiptSmsAuto(opts: {
  phone: string;
  customerName?: string;
  referenceCode: string;
  amountDollars: number;
  kind: 'charge' | 'diagnostic_only' | 'no_show';
  lines?: Parameters<typeof buildChargeReceiptMessage>[0]['lines'];
  diagnosticDollars?: number;
}): Promise<SendBookingSmsResult> {
  void buildChargeReceiptMessage(opts);
  const opened = await openChargeReceiptSms(opts);
  if (opened) return { sent: true, via: 'device' };
  return { sent: false, via: 'none', error: 'No phone number' };
}

/** Best-effort push after claim (customer notified). */
export async function notifyCustomerPush(opts: {
  bookingReference: string;
  title: string;
  body: string;
}): Promise<void> {
  try {
    await supabase.functions.invoke('send-push', {
      body: {
        bookingReference: opts.bookingReference,
        title: opts.title,
        body: opts.body,
      },
    });
  } catch {
    /* optional */
  }
}
