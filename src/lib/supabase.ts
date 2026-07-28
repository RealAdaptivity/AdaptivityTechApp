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
  if (error) throw error;
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
  await ensureTechProfile();
  const { error } = await supabase
    .from('mechanic_details')
    .update({ job_capacity: capacity })
    .eq('profile_id', user.id);
  if (error) throw error;
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

export async function markTechW9Complete(): Promise<string> {
  const { data, error } = await supabase.rpc('mark_tech_w9_complete');
  if (error) throw error;
  return String(data);
}

export async function claimBookingRow(referenceCode: string, mechanicId: string) {
  const { data: detail } = await supabase
    .from('mechanic_details')
    .select('job_capacity, w9_completed_at')
    .eq('profile_id', mechanicId)
    .maybeSingle();

  if (!detail?.w9_completed_at) {
    throw new Error(
      'Complete IRS Form W-9 before your first job: open Settings → connect Stripe Express and submit your SSN or EIN (tax ID).'
    );
  }

  if (detail?.job_capacity === 'standalone') {
    const { data: active, error: activeErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('mechanic_id', mechanicId)
      .in('status', ['EN_ROUTE', 'ON_SITE'])
      .neq('reference_code', referenceCode)
      .limit(1);
    if (activeErr) throw activeErr;
    if (active && active.length > 0) {
      throw new Error(
        'Standalone mode: finish your active job first, or switch to Multi-job in Settings.'
      );
    }
  }

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'EN_ROUTE', mechanic_id: mechanicId, eta_minutes: 12, distance_miles: 5 })
    .eq('reference_code', referenceCode);
  if (error) throw error;
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
  const { error } = await supabase.from('bookings').update(patch).eq('reference_code', referenceCode);
  if (error) throw error;
}

export async function cancelJobWithHold(referenceCode: string) {
  const { data, error } = await supabase.functions.invoke('cancel-booking-hold', {
    body: { bookingReference: referenceCode, releaseJob: true },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export function subscribeDispatchBookings(onChange: () => void) {
  return supabase
    .channel('tech-dispatch')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => onChange())
    .subscribe();
}
