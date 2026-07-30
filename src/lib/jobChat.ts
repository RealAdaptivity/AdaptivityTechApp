import { supabase } from './supabase';

export type JobMessage = {
  id: string;
  bookingId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export async function fetchJobMessages(bookingId: string): Promise<JobMessage[]> {
  const { data, error } = await supabase
    .from('job_messages')
    .select('id, booking_id, sender_id, body, created_at')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id as string,
    bookingId: r.booking_id as string,
    senderId: r.sender_id as string,
    body: r.body as string,
    createdAt: r.created_at as string,
  }));
}

export async function sendJobMessage(bookingId: string, body: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to chat');
  const trimmed = body.trim().slice(0, 2000);
  if (!trimmed) throw new Error('Message is empty');
  const { error } = await supabase.from('job_messages').insert({
    booking_id: bookingId,
    sender_id: user.id,
    body: trimmed,
  });
  if (error) throw error;
}

export function subscribeJobMessages(bookingId: string, onChange: () => void) {
  return supabase
    .channel(`job_messages:${bookingId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'job_messages', filter: `booking_id=eq.${bookingId}` },
      () => onChange()
    )
    .subscribe();
}
