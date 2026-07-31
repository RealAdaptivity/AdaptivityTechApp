import { Linking } from 'react-native';
import { errorMessage } from './errorMessage';

/** Open Stripe / external HTTPS URLs; surface real errors on Android. */
export async function openExternalUrl(url: string, label = 'link'): Promise<void> {
  const trimmed = url?.trim();
  if (!trimmed?.startsWith('http')) {
    throw new Error(`Invalid ${label} URL from server.`);
  }
  try {
    await Linking.openURL(trimmed);
  } catch (e: unknown) {
    throw new Error(
      `${errorMessage(e, `Could not open ${label}`)} — try the website portal instead: Settings → Connect on adaptivityperformance.com/portal`
    );
  }
}
