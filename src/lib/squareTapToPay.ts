import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import { invokeEdgeFunction } from './edgeFunctionErrors';

/**
 * Card payments with Square's Mobile Payments SDK: Tap to Pay on iPhone and
 * Android (and any Square reader the tech pairs).
 *
 * The SDK is a native module, so it only exists in a build made after it was
 * added (not in Expo Go or an older install). Everything here loads it lazily
 * and reports "not available" instead of crashing.
 *
 * Authorization: the access token and location come from the
 * square-mobile-auth edge function each time the SDK needs authorizing — the
 * token is never stored by the app.
 */

type Sdk = typeof import('mobile-payments-sdk-react-native');

let sdk: Sdk | null | undefined;

function loadSdk(): Sdk | null {
  if (sdk !== undefined) return sdk;
  try {
    sdk = NativeModules.MobilePaymentsSdkReactNative
      ? (require('mobile-payments-sdk-react-native') as Sdk)
      : null;
  } catch {
    sdk = null;
  }
  return sdk;
}

/** The Square application id baked into this build (see app.config.js). */
export function squareApplicationId(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as { squareApplicationId?: string };
  return extra.squareApplicationId?.trim() || '';
}

/** Whether this build carries Apple's Tap to Pay on iPhone entitlement. Off
 *  until Apple approves it for distribution; iPhones then take cards with a
 *  paired Square reader instead. Android needs no entitlement. */
export function tapToPayOnIphoneEnabled(): boolean {
  const extra = (Constants.expoConfig?.extra ?? {}) as { squareTapToPayOnIphone?: boolean };
  return extra.squareTapToPayOnIphone === true;
}

/** Tap to Pay on the phone itself: always offered on Android, on iPhone only
 *  when the build has the entitlement. */
export function phoneTapToPayOffered(): boolean {
  return Platform.OS === 'android' || (Platform.OS === 'ios' && tapToPayOnIphoneEnabled());
}

export type TapToPayAvailability =
  | { available: true }
  | { available: false; reason: string };

export function tapToPayAvailability(): TapToPayAvailability {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { available: false, reason: 'Card payments work in the phone app only.' };
  }
  if (!squareApplicationId()) {
    return { available: false, reason: 'Card payments are not set up in this build yet.' };
  }
  if (!loadSdk()) {
    return { available: false, reason: 'Update the app to take card payments.' };
  }
  return { available: true };
}

function requireSdk(): Sdk {
  const status = tapToPayAvailability();
  if (!status.available) throw new Error(status.reason);
  return loadSdk()!;
}

function sdkErrorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    const msg = (e as { message: string }).message.trim();
    if (msg) return msg;
  }
  return fallback;
}

/** Authorize the SDK for our Square location if it is not already. */
export async function ensureSquareAuthorized(): Promise<void> {
  const s = requireSdk();
  const state = String(await s.getAuthorizationState());
  if (state === s.AuthorizationState.AUTHORIZED) return;
  const creds = await invokeEdgeFunction<{ accessToken: string; locationId: string }>('square-mobile-auth', {});
  try {
    await s.authorize(creds.accessToken, creds.locationId);
  } catch (e) {
    throw new Error(sdkErrorMessage(e, 'Could not connect to Square.'));
  }
}

export async function squareLocationName(): Promise<string | null> {
  const s = loadSdk();
  if (!s) return null;
  try {
    const state = String(await s.getAuthorizationState());
    if (state !== s.AuthorizationState.AUTHORIZED) return null;
    const loc = await s.getAuthorizedLocation();
    return loc?.name ? String(loc.name) : null;
  } catch {
    return null;
  }
}

/**
 * iPhone only: Apple requires the Square account to accept Tap to Pay on
 * iPhone terms once per device (Apple shows the screen). Android needs no
 * step — the SDK offers Tap to Pay when the phone supports it.
 */
export async function prepareTapToPayOnIphone(): Promise<void> {
  if (Platform.OS !== 'ios' || !tapToPayOnIphoneEnabled()) return;
  const s = requireSdk();
  const capable = await s.TapToPaySettings.isDeviceCapable().catch(() => false);
  if (!capable) {
    throw new Error('This iPhone does not support Tap to Pay (iPhone XS or newer on a current iOS is needed).');
  }
  const linked = await s.TapToPaySettings.isAppleAccountLinked().catch(() => false);
  if (linked) return;
  try {
    await s.TapToPaySettings.linkAppleAccount();
  } catch (e) {
    throw new Error(sdkErrorMessage(e, 'Tap to Pay on iPhone was not set up.'));
  }
}

/** Square's own screen for pairing readers and checking Tap to Pay. */
export async function showSquareSettings(): Promise<void> {
  const s = requireSdk();
  await ensureSquareAuthorized();
  try {
    await s.showSettings();
  } catch (e) {
    throw new Error(sdkErrorMessage(e, 'Could not open Square settings.'));
  }
}

function attemptId(): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}

export type CardPaymentResult = { paymentId: string; amountCents: number };

/**
 * Take a card payment for exactly `amountCents`. The customer taps their card
 * or phone on the tech's phone (or a paired reader). Resolves with Square's
 * payment id once the payment has completed.
 */
export async function takeCardPayment(opts: {
  amountCents: number;
  referenceCode: string;
  note: string;
}): Promise<CardPaymentResult> {
  const s = requireSdk();
  if (!Number.isInteger(opts.amountCents) || opts.amountCents <= 0) {
    throw new Error('Enter what the customer is paying.');
  }
  await ensureSquareAuthorized();
  await prepareTapToPayOnIphone();

  try {
    const payment = await s.startPayment(
      {
        amountMoney: { amount: opts.amountCents, currencyCode: s.CurrencyCode.USD },
        processingMode: s.ProcessingMode.ONLINE_ONLY,
        allowCardSurcharge: false,
        autocomplete: true,
        paymentAttemptId: attemptId(),
        referenceId: opts.referenceCode,
        note: opts.note.slice(0, 500),
      },
      {
        mode: s.PromptMode.DEFAULT,
        // Without the iPhone entitlement, offer paired readers only.
        additionalMethods: phoneTapToPayOffered() ? [s.AdditionalPaymentMethodType.TAP_TO_PAY] : [],
      }
    );
    const id = String(payment?.id ?? '').trim();
    if (!id) throw new Error('Square did not return a payment id.');
    return { paymentId: id, amountCents: Number(payment.amountMoney?.amount ?? opts.amountCents) };
  } catch (e) {
    throw new Error(sdkErrorMessage(e, 'The card payment did not go through.'));
  }
}
