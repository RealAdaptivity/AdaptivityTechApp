import { Platform } from 'react-native';
import { supabase } from './supabase';

/** Signatures for both tech documents live in this bucket. Its policies key on
 *  the first path segment being the signer's own id. */
export const SIGNATURE_BUCKET = 'contractor-agreements';

/** Upload a PNG captured from the signature pad (a local file URI). */
export async function uploadSignaturePng(path: string, fileUri: string): Promise<void> {
  const bytes = await (await fetch(fileUri)).arrayBuffer();
  if (!bytes.byteLength) throw new Error('Draw your signature before submitting');
  const { error } = await supabase.storage.from(SIGNATURE_BUCKET).upload(path, bytes, {
    contentType: 'image/png',
    upsert: true,
  });
  if (error) throw new Error(error.message || 'Could not upload your signature');
}

export async function getSignatureUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(SIGNATURE_BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export function deviceUserAgent(): string {
  // Recorded with the signature, like the browser user agent on the web.
  return `AdaptivityTechApp/${Platform.OS} ${String(Platform.Version)}`.slice(0, 400);
}
