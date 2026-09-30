import { supabase } from './supabase';

/** A technician must be clocked in to claim a job. The rule is enforced in
 *  claim_booking_for_current_tech, not here — this is just the UI's view of it. */
export type ShiftStatus = {
  onShift: boolean;
  /** When the open shift started, or null when clocked out. */
  since: string | null;
};

export async function fetchMyShiftStatus(): Promise<ShiftStatus> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { onShift: false, since: null };

  const { data, error } = await supabase
    .from('tech_shifts')
    .select('clocked_in_at')
    .eq('profile_id', user.id)
    .is('clocked_out_at', null)
    .maybeSingle();
  if (error) throw error;
  return { onShift: Boolean(data), since: (data?.clocked_in_at as string | undefined) ?? null };
}

export async function clockIn(): Promise<string> {
  const { data, error } = await supabase.rpc('tech_clock_in');
  if (error) throw new Error(error.message);
  return data as string;
}

export async function clockOut(): Promise<string> {
  const { data, error } = await supabase.rpc('tech_clock_out');
  if (error) throw new Error(error.message);
  return data as string;
}

/** Hours worked so far on the open shift, for the portal header. */
export function shiftElapsedLabel(since: string | null): string {
  if (!since) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
