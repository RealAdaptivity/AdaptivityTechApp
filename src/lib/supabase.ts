import 'react-native-url-polyfill/auto';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/supabasePublic';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Keep auth tokens fresh while the app is foregrounded (Supabase RN guidance).
AppState.addEventListener('change', (state: AppStateStatus) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});

export type JobStatus = 'UNASSIGNED' | 'EN_ROUTE' | 'ON_SITE' | 'COMPLETED' | 'CANCELED';

export type DispatchBooking = {
  id: string;
  referenceCode: string;
  customer: string;
  phone: string;
  address: string;
  vehicle: string;
  services: string[];
  total: number;
  status: JobStatus;
  distanceMiles: number;
  etaMinutes: number;
  quoteStatus: string;
  holdAmountCents: number | null;
  paymentStatus: string;
  preferredDate: string | null;
  preferredTimeWindow: string | null;
  customerNotes: string | null;
  mechanicId: string | null;
  /** 'shop' is a drop-off at a partner shop, where travel doesn't apply. */
  locationType: 'mobile' | 'shop';
  customerEmail: string | null;
  /** The customer's own words about the problem, from the booking form. */
  issueDescription: string | null;
  vin: string | null;
};

function mapRow(row: Record<string, unknown>): DispatchBooking {
  const services = Array.isArray(row.services) ? (row.services as string[]) : [];
  return {
    id: row.id as string,
    referenceCode: row.reference_code as string,
    customer: row.customer_name as string,
    phone: row.customer_phone as string,
    address: row.customer_address as string,
    vehicle: row.vehicle_description as string,
    services,
    total: Number(row.total_estimate),
    status: row.status as JobStatus,
    distanceMiles: Number(row.distance_miles),
    etaMinutes: Number(row.eta_minutes),
    quoteStatus: (row.quote_status as string) || 'none',
    holdAmountCents: (row.hold_amount_cents as number | null) ?? null,
    paymentStatus: (row.payment_status as string) || 'none',
    preferredDate: (row.preferred_date as string | null) ?? null,
    preferredTimeWindow: (row.preferred_time_window as string | null) ?? null,
    customerNotes: (row.customer_notes as string | null) ?? null,
    mechanicId: (row.mechanic_id as string | null) ?? null,
    locationType: row.location_type === 'shop' ? 'shop' : 'mobile',
    customerEmail: (row.customer_email as string | null) ?? null,
    issueDescription: (row.issue_description as string | null) ?? null,
    vin: (row.vin as string | null) ?? null,
  };
}

export async function signInTech(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function ensureTechProfile(vanNumber?: string, specialties?: string[]) {
  const payload: Record<string, unknown> = {
    p_van_number: vanNumber?.trim() || 'Mobile Unit',
  };
  if (specialties?.length) {
    payload.p_specialties = specialties;
  }
  const { error } = await supabase.rpc('ensure_tech_profile', payload);
  if (error) {
    const err = new Error(error.message || 'Could not register technician profile');
    (err as Error & { code?: string }).code = error.code;
    throw err;
  }
}

/** True if this account already has a mechanic_details row (can dispatch). */
export async function hasMechanicDetails(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('mechanic_details')
    .select('profile_id')
    .eq('profile_id', user.id)
    .maybeSingle();
  return Boolean(data?.profile_id);
}

export async function fetchMyTechSpecialties(): Promise<string[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return ['mechanical'];
  const { data } = await supabase
    .from('mechanic_details')
    .select('specialties')
    .eq('profile_id', user.id)
    .maybeSingle();
  const list = Array.isArray(data?.specialties) ? (data!.specialties as string[]) : [];
  return list.length ? list : ['mechanical'];
}

export async function updateMyTechSpecialties(specialties: string[]) {
  await ensureTechProfile(undefined, specialties);
}

export async function signUpTech(
  email: string,
  password: string,
  fullName: string,
  vanNumber?: string,
  specialties?: string[]
) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: 'tech',
        full_name: fullName,
        van_number: vanNumber,
        specialties: specialties?.length ? specialties : ['mechanical'],
      },
    },
  });
}

export async function fetchDispatchBookings(): Promise<DispatchBooking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapRow);
}

export type TechJobCapacity = 'multi' | 'standalone';

export async function fetchMyJobCapacity(): Promise<TechJobCapacity> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 'multi';
  const { data } = await supabase
    .from('mechanic_details')
    .select('job_capacity')
    .eq('profile_id', user.id)
    .maybeSingle();
  return data?.job_capacity === 'standalone' ? 'standalone' : 'multi';
}

export async function updateMyJobCapacity(capacity: TechJobCapacity) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase.rpc('set_my_job_capacity', {
    p_capacity: capacity,
  });
  if (error) throw new Error(error.message || 'Could not save work style');
  return (data as string) === 'standalone' ? 'standalone' : 'multi';
}

export type TechW9Status = {
  completed: boolean;
  completedAt: string | null;
  taxIdProvided: boolean;
};

export async function fetchTechW9Status(): Promise<TechW9Status> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { completed: false, completedAt: null, taxIdProvided: false };
  const { data } = await supabase
    .from('mechanic_details')
    .select('w9_completed_at, tax_id_provided')
    .eq('profile_id', user.id)
    .maybeSingle();
  return {
    completed: Boolean(data?.w9_completed_at),
    completedAt: (data?.w9_completed_at as string) || null,
    taxIdProvided: Boolean(data?.tax_id_provided),
  };
}

/**
 * Claim order matches the web portal: the claim-booking edge function first,
 * then the claim_booking_for_current_tech RPC, then a direct update. The
 * database enforces the real gates (clocked in, current contractor agreement,
 * W-9 on file, standalone capacity), so the app does not second-guess them.
 */
export async function claimBookingRow(referenceCode: string, mechanicId: string) {
  const cleanRef = referenceCode.trim();

  try {
    const { data } = await supabase.functions.invoke('claim-booking', {
      body: { bookingReference: cleanRef, mechanicId },
    });
    if ((data as { ok?: boolean } | null)?.ok) return;
  } catch (edgeErr) {
    console.warn('claim-booking edge function notice:', edgeErr);
  }

  const { error: rpcError } = await supabase.rpc('claim_booking_for_current_tech', {
    p_reference: cleanRef,
  });
  if (!rpcError) return;

  console.warn('claim_booking_for_current_tech RPC notice:', rpcError.message);
  const { error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'EN_ROUTE', mechanic_id: mechanicId, eta_minutes: 20, distance_miles: 8 })
    .ilike('reference_code', cleanRef);
  if (updateError) {
    throw new Error(rpcError.message || updateError.message || 'Could not claim job in database.');
  }
}

export async function updateBookingRow(
  referenceCode: string,
  patch: Partial<{
    status: JobStatus;
    distance_miles: number;
    eta_minutes: number;
    dispatch_lat: number;
    dispatch_lng: number;
  }>
) {
  const { error } = await supabase
    .from('bookings')
    .update(patch)
    .ilike('reference_code', referenceCode.trim());
  if (error) throw error;
}

/** Release a claimed job back to the open pool. Nothing to void — no card was held. */
export async function releaseJob(referenceCode: string) {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'UNASSIGNED', mechanic_id: null, updated_at: new Date().toISOString() })
    .ilike('reference_code', referenceCode.trim());
  if (error) throw error;
}

/** Name for the app header, from the tech's profile. */
export async function fetchMyDisplayName(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle();
  return (data?.full_name as string) || (data?.email as string) || user.email || null;
}

export function subscribeDispatchBookings(onChange: () => void) {
  return supabase
    .channel('tech-dispatch')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => onChange())
    .subscribe();
}
