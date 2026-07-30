import { supabase } from './supabase';

export type PartsExpenseClaim = {
  id: string;
  bookingId: string;
  techId: string;
  amountCents: number;
  description: string;
  receiptPath: string | null;
  status: string;
  createdAt: string;
};

function mapClaim(row: Record<string, unknown>): PartsExpenseClaim {
  return {
    id: row.id as string,
    bookingId: row.booking_id as string,
    techId: row.tech_id as string,
    amountCents: row.amount_cents as number,
    description: row.description as string,
    receiptPath: (row.receipt_path as string | null) ?? null,
    status: row.status as string,
    createdAt: row.created_at as string,
  };
}

export async function fetchMyPartsExpenseClaims(): Promise<PartsExpenseClaim[]> {
  const { data, error } = await supabase
    .from('parts_expense_claims')
    .select('id, booking_id, tech_id, amount_cents, description, receipt_path, status, created_at')
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  return (data || []).map((row) => mapClaim(row as Record<string, unknown>));
}

/** Optional receipt upload to job-photos bucket under expenses/… */
export async function uploadExpenseReceiptUri(opts: {
  bookingId: string;
  uri: string;
  mimeType?: string;
  fileName?: string;
}): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in required');

  const ext =
    opts.fileName?.split('.').pop()?.toLowerCase() ||
    (opts.mimeType?.includes('png') ? 'png' : 'jpg');
  const path = `expenses/${opts.bookingId}/${user.id}-${Date.now()}.${ext}`;

  const response = await fetch(opts.uri);
  const blob = await response.blob();

  const { error: upErr } = await supabase.storage.from('job-photos').upload(path, blob, {
    contentType: opts.mimeType || blob.type || 'image/jpeg',
    upsert: false,
  });
  if (upErr) throw upErr;
  return path;
}

export async function submitPartsExpenseClaim(opts: {
  bookingId: string;
  amountDollars: number;
  description: string;
  receiptPath?: string | null;
}): Promise<PartsExpenseClaim> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in required');

  const amountCents = Math.round(opts.amountDollars * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error('Enter a valid parts amount greater than $0');
  }
  const description = opts.description.trim();
  if (!description) throw new Error('Add a short description of the parts');

  const { data, error } = await supabase
    .from('parts_expense_claims')
    .insert({
      booking_id: opts.bookingId,
      tech_id: user.id,
      amount_cents: amountCents,
      description,
      receipt_path: opts.receiptPath?.trim() || null,
      status: 'submitted',
    })
    .select('id, booking_id, tech_id, amount_cents, description, receipt_path, status, created_at')
    .single();
  if (error) throw error;
  return mapClaim(data as Record<string, unknown>);
}
