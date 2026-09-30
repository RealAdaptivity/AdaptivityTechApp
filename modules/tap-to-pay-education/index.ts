import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type Native = {
  isAvailable(): boolean;
  showHowToTap(): Promise<boolean>;
};

const native = Platform.OS === 'ios' ? requireOptionalNativeModule<Native>('TapToPayEducation') : null;

/** True on iOS 18+ builds that include this module. */
export function appleEducationAvailable(): boolean {
  try {
    return Boolean(native?.isAvailable());
  } catch {
    return false;
  }
}

/** Show Apple's "how to tap" education. Resolves false when unavailable. */
export async function showAppleHowToTap(): Promise<boolean> {
  if (!native) return false;
  return native.showHowToTap();
}
