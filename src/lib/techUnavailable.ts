import { supabase } from './supabase';

export type UnavailableWindow = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

export async function listUnavailableWindows(techId?: string): Promise<UnavailableWindow[]> {
  let uid = techId;
  if (!uid) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid) return [];
  const { data, error } = await supabase
    .from('tech_unavailable_windows')
    .select('id, starts_at, ends_at, reason')
    .eq('tech_id', uid)
    .gte('ends_at', new Date().toISOString())
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id as string,
    startsAt: r.starts_at as string,
    endsAt: r.ends_at as string,
    reason: (r.reason as string | null) ?? null,
  }));
}

export async function addUnavailableWindow(params: {
  startsAt: string;
  endsAt: string;
  reason?: string;
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in required');
  const { error } = await supabase.from('tech_unavailable_windows').insert({
    tech_id: user.id,
    starts_at: params.startsAt,
    ends_at: params.endsAt,
    reason: params.reason?.trim() || null,
  });
  if (error) throw error;
}

export async function removeUnavailableWindow(id: string): Promise<void> {
  const { error } = await supabase.from('tech_unavailable_windows').delete().eq('id', id);
  if (error) throw error;
}
