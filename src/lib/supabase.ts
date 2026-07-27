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
  };
}

export async function signInTech(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function ensureTechProfile(vanNumber?: string) {
  const { error } = await supabase.rpc('ensure_tech_profile', {
    p_van_number: vanNumber?.trim() || 'Mobile Unit',
    p_role_title: 'ASE Technician',
  });
  if (error) throw error;
}

export async function signUpTech(email: string, password: string, fullName: string, vanNumber?: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: 'tech',
        full_name: fullName,
        van_number: vanNumber,
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

export async function claimBookingRow(referenceCode: string, mechanicId: string) {
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
