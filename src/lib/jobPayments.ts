import { supabase } from './supabase';

export type ChargeLineInput = {
  title: string;
  laborDollars: number;
  partsDollars?: number;
};

export async function captureBookingPayment(
  bookingReference: string,
  opts?: {
    mode?: 'charge' | 'diagnostic_only' | 'no_show';
    lineItems?: ChargeLineInput[];
    techNotes?: string;
    customerAgreedOnSite?: boolean;
  }
) {
  const { data, error } = await supabase.functions.invoke('capture-booking-payment', {
    body: {
      bookingReference,
      mode: opts?.mode ?? 'charge',
      lineItems: opts?.lineItems,
      techNotes: opts?.techNotes,
      customerAgreedOnSite: opts?.customerAgreedOnSite,
    },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as {
    ok: boolean;
    capturedAmountDollars?: number;
    techPayoutDollars?: number;
    remainderDollars?: number;
    alreadyCaptured?: boolean;
    transferWarning?: string | null;
    message?: string;
  };
}

/** @deprecated Use captureBookingPayment with line items. */
export async function submitBookingQuote(
  bookingReference: string,
  lineItems: ChargeLineInput[],
  techNotes?: string
) {
  return captureBookingPayment(bookingReference, {
    mode: 'charge',
    lineItems,
    techNotes,
    customerAgreedOnSite: true,
  });
}
