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

// ── Tap to Pay on iPhone ────────────────────────────────────────────────────
// Apple's review checklist drives what is here: the merchant's acceptance of
// the Tap to Pay on iPhone terms is read from Apple every time rather than
// stored (1.6), only an admin may accept them (3.8), the reader is warmed up
// at launch and on foreground (1.5), and setup shows its progress (3.9.1).

/** Apple asks apps to tell people on older iOS to update (1.4). */
export const TAP_TO_PAY_MIN_IOS = 17.6;

export function iosVersionTooOld(): boolean {
  if (Platform.OS !== 'ios') return false;
  const v = parseFloat(String(Platform.Version));
  return Number.isFinite(v) && v < TAP_TO_PAY_MIN_IOS;
}

export type IphoneTapToPayStatus =
  | { state: 'off' }
  | { state: 'unsupported'; reason: string }
  | { state: 'not_linked' }
  | { state: 'linked' };

/** Where this iPhone stands with Tap to Pay, straight from Apple / Square. */
export async function iphoneTapToPayStatus(): Promise<IphoneTapToPayStatus> {
  if (Platform.OS !== 'ios' || !tapToPayOnIphoneEnabled() || !tapToPayAvailability().available) {
    return { state: 'off' };
  }
  if (iosVersionTooOld()) {
    return {
      state: 'unsupported',
      reason: `Update this iPhone to iOS ${TAP_TO_PAY_MIN_IOS} or later to use Tap to Pay on iPhone.`,
    };
  }
  const s = requireSdk();
  const capable = await s.TapToPaySettings.isDeviceCapable().catch(() => false);
  if (!capable) {
    return { state: 'unsupported', reason: 'Tap to Pay on iPhone needs an iPhone XS or later.' };
  }
  await ensureSquareAuthorized();
  const linked = await s.TapToPaySettings.isAppleAccountLinked().catch(() => false);
  return { state: linked ? 'linked' : 'not_linked' };
}

/** Show Apple's Tap to Pay on iPhone Terms and Conditions and link this
 *  iPhone. Only call for an admin, or once an admin has accepted (3.8). */
export async function acceptTapToPayTerms(): Promise<void> {
  const s = requireSdk();
  await ensureSquareAuthorized();
  try {
    await s.TapToPaySettings.linkAppleAccount();
  } catch (e) {
    throw new Error(sdkErrorMessage(e, 'Tap to Pay on iPhone was not set up.'));
  }
}

export type TapToPayReaderState = { ready: boolean; label: string; percent: number | null };

function describeReader(reader: unknown): TapToPayReaderState {
  const r = (reader ?? {}) as {
    status?: { status?: unknown };
    firmwareInfo?: { updatePercentage?: unknown } | null;
  };
  const status = String(r.status?.status ?? '');
  const pct = Number(r.firmwareInfo?.updatePercentage);
  const percent = Number.isFinite(pct) && pct > 0 && pct < 100 ? Math.round(pct) : null;
  if (status === 'READY') return { ready: true, label: 'Tap to Pay on iPhone is ready.', percent: null };
  if (status === 'CONNECTING_TO_DEVICE' || status === 'CONNECTING_TO_SQUARE') {
    return { ready: false, label: 'Preparing Tap to Pay on iPhone…', percent };
  }
  if (status === 'READER_UNAVAILABLE' || status === 'FAULTY') {
    return { ready: false, label: 'Tap to Pay on iPhone isn’t ready yet. Keep the app open and connected.', percent };
  }
  return { ready: false, label: 'Preparing Tap to Pay on iPhone…', percent };
}

/** Follow the Tap to Pay reader while it is being configured (3.9.1).
 *  Returns an unsubscribe function. */
export function watchTapToPayReader(onChange: (state: TapToPayReaderState) => void): () => void {
  const s = loadSdk();
  if (!s) return () => undefined;
  const isTapToPay = (r: unknown) => String((r as { model?: unknown })?.model ?? '') === 'TAP_TO_PAY';
  const refresh = () => {
    void s
      .getReaders()
      .then((readers) => {
        const reader = (readers ?? []).find(isTapToPay);
        onChange(reader ? describeReader(reader) : { ready: false, label: 'Preparing Tap to Pay on iPhone…', percent: null });
      })
      .catch(() => undefined);
  };
  refresh();
  let stop: () => void = () => undefined;
  try {
    stop = s.setReaderChangedCallback((event) => {
      if (isTapToPay(event?.reader)) onChange(describeReader(event.reader));
      else refresh();
    });
  } catch {
    /* older SDK builds: polling below still updates the screen */
  }
  const timer = setInterval(refresh, 2000);
  return () => {
    clearInterval(timer);
    stop();
  };
}

/** Checkout on an iPhone whose Tap to Pay reader is still being configured:
 *  report progress (for the "getting ready" screen, 5.7) and resolve once it
 *  is ready. Rejects after `timeoutMs`. Resolves at once when it is ready. */
export function waitForTapToPayReady(
  onProgress: (state: TapToPayReaderState) => void,
  timeoutMs = 90_000
): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    let stop: () => void = () => undefined;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop();
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error('Tap to Pay on iPhone is still getting ready. Keep the app open and connected, then try again.')),
      timeoutMs
    );
    stop = watchTapToPayReader((state) => {
      onProgress(state);
      if (state.ready) finish();
    });
    if (done) stop();
  });
}

/** Get Tap to Pay ready before it is needed, so checkout starts fast (1.5).
 *  Quietly does nothing when this iPhone is not set up for it. */
export async function warmUpTapToPay(): Promise<void> {
  try {
    const status = await iphoneTapToPayStatus();
    if (status.state !== 'linked') return;
    const s = requireSdk();
    await s.getReaders();
  } catch {
    /* best effort */
  }
}

/** Thrown when an iPhone payment needs Tap to Pay set up first; checkout
 *  opens the setup flow instead of failing (3.7, 5.3). */
export class TapToPayNotLinkedError extends Error {
  constructor() {
    super('Set up Tap to Pay on iPhone first.');
    this.name = 'TapToPayNotLinkedError';
  }
}

/** True when this build uses Square's sandbox (test) application id. */
export function isSquareSandbox(): boolean {
  return squareApplicationId().startsWith('sandbox-');
}

/** Sandbox only: Square's floating test card reader, for completing a payment
 *  without a real card. Never shown in production builds. */
export async function showTestCardReader(): Promise<void> {
  if (!isSquareSandbox()) throw new Error('The test card reader is only available in test (sandbox) builds.');
  const s = requireSdk();
  await ensureSquareAuthorized();
  try {
    await s.showMockReaderUI();
  } catch (e) {
    throw new Error(sdkErrorMessage(e, 'Could not open the test card reader.'));
  }
}

export async function hideTestCardReader(): Promise<void> {
  const s = loadSdk();
  if (!s || !isSquareSandbox()) return;
  try {
    await s.hideMockReaderUI();
  } catch {
    /* already hidden */
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
  let offerPhoneTap = Platform.OS === 'android';
  if (Platform.OS === 'ios' && tapToPayOnIphoneEnabled()) {
    const status = await iphoneTapToPayStatus();
    if (status.state === 'not_linked') throw new TapToPayNotLinkedError();
    // Unsupported iPhone: take the card on a paired reader instead.
    offerPhoneTap = status.state === 'linked';
  }
  // Test builds: have Square's test card reader on screen to finish the payment.
  if (isSquareSandbox()) await s.showMockReaderUI().catch(() => undefined);

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
        // Without Tap to Pay on this phone, offer paired readers only.
        additionalMethods: offerPhoneTap ? [s.AdditionalPaymentMethodType.TAP_TO_PAY] : [],
      }
    );
    const id = String(payment?.id ?? '').trim();
    if (!id) throw new Error('Square did not return a payment id.');
    return { paymentId: id, amountCents: Number(payment.amountMoney?.amount ?? opts.amountCents) };
  } catch (e) {
    const msg = sdkErrorMessage(e, 'The card payment did not go through.');
    if (/osVersionNotSupported|OS_VERSION|os version/i.test(msg)) {
      throw new Error(`Update this iPhone to iOS ${TAP_TO_PAY_MIN_IOS} or later to use Tap to Pay on iPhone.`);
    }
    throw new Error(msg);
  }
}
