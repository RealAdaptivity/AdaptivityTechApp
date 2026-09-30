import { Linking, Platform } from 'react-native';
import { supabase } from './supabase';
import { invokeEdgeFunction } from './edgeFunctionErrors';
import { normalizePhoneForSms } from './onTheWaySms';
import type { CloseOut, PartsBy, TaxMode } from './closeOut';

/** Closing a job, the same way the web portal does: the customer's signature,
 *  then record_job_payment (or record-square-payment for a card), then the
 *  receipt. What comes back is what the database saved. */

export const SIGNATURE_BUCKET = 'booking-signatures';

/** Upload the customer's signature (a PNG file from the signature pad). */
export async function uploadCustomerSignature(bookingId: string, fileUri: string): Promise<string> {
  const bytes = await (await fetch(fileUri)).arrayBuffer();
  const path = `${bookingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const { error } = await supabase.storage
    .from(SIGNATURE_BUCKET)
    .upload(path, bytes, { contentType: 'image/png', upsert: false });
  if (error) throw new Error(`Could not save the signature: ${error.message}`);
  return path;
}

export type CloseOutOptions = {
  taxMode: TaxMode;
  partsBy: PartsBy;
  signaturePath?: string;
  signerName?: string;
  techNotes?: string;
  /** How a tech-confirmed payment was made. Card is set by the server. */
  paymentMethod?: 'cash' | 'zelle';
};

export type RecordedPayment = { totalCents: number; taxCents: number; techPayoutCents: number };

/** The p_payment body record_job_payment expects. */
export function closeOutPayload(closeOut: CloseOut, opts: CloseOutOptions) {
  return {
    kind: closeOut.kind,
    line_items: closeOut.lines.map((l) => ({
      title: l.title,
      labor_cents: l.laborCents,
      parts_cents: l.partsCents,
    })),
    diagnostic_cents: closeOut.diagnosticCents,
    travel_cents: closeOut.travelCents,
    tax_mode: opts.taxMode,
    parts_by: opts.partsBy,
    signature_path: opts.signaturePath ?? null,
    signer_name: opts.signerName ?? null,
    tech_notes: opts.techNotes ?? null,
    ...(opts.paymentMethod ? { payment_method: opts.paymentMethod } : {}),
  };
}

/** Paid by Zelle or in cash: the tech confirms, the database records. */
export async function recordJobPayment(
  bookingId: string,
  closeOut: CloseOut,
  opts: CloseOutOptions
): Promise<RecordedPayment> {
  const { data, error } = await supabase.rpc('record_job_payment', {
    p_booking_id: bookingId,
    p_payment: closeOutPayload(closeOut, opts),
  });
  if (error) throw new Error(error.message);
  const r = data as { total_cents: number; tax_cents: number; tech_payout_cents: number };
  return { totalCents: r.total_cents, taxCents: r.tax_cents, techPayoutCents: r.tech_payout_cents };
}

/** Paid by card with Tap to Pay: the server checks the payment with Square
 *  (completed, this job, exact total) before it closes the job. Safe to retry
 *  with the same payment id. */
export async function recordSquarePayment(
  bookingId: string,
  squarePaymentId: string,
  closeOut: CloseOut,
  opts: CloseOutOptions
): Promise<RecordedPayment> {
  return invokeEdgeFunction<RecordedPayment>('record-square-payment', {
    bookingId,
    squarePaymentId,
    payment: closeOutPayload(closeOut, opts),
  });
}

type ChannelResult = { status: 'sent' | 'skipped' | 'failed'; detail?: string; to?: string };

export type ReceiptSendResult = {
  sms?: ChannelResult;
  email?: ChannelResult;
  smsBody: string;
  subject: string;
  emailText: string;
};

export async function sendReceipt(
  bookingId: string,
  channels: ('sms' | 'email')[],
  contact: { phone?: string; email?: string }
): Promise<ReceiptSendResult> {
  return invokeEdgeFunction<ReceiptSendResult>('send-receipt', {
    bookingId,
    channels,
    phone: contact.phone || undefined,
    email: contact.email || undefined,
  });
}

/** Fallbacks while the business Twilio number or email sender is not set up:
 *  the same receipt, sent from the tech's own phone. */
export async function openDeviceSms(phone: string, body: string): Promise<boolean> {
  const to = normalizePhoneForSms(phone);
  if (!to) return false;
  const sep = Platform.OS === 'ios' ? '&' : '?';
  await Linking.openURL(`sms:${to}${sep}body=${encodeURIComponent(body)}`);
  return true;
}

export async function openDeviceEmail(email: string, subject: string, body: string): Promise<boolean> {
  if (!email.trim()) return false;
  await Linking.openURL(
    `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  );
  return true;
}
