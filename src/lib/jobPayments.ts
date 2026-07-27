import { supabase } from './supabase';

export async function captureBookingPayment(bookingReference: string) {
  const { data, error } = await supabase.functions.invoke('capture-booking-payment', {
    body: { bookingReference },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as {
    ok: boolean;
    capturedAmountDollars?: number;
    techPayoutDollars?: number;
    alreadyCaptured?: boolean;
  };
}
