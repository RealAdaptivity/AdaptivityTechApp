import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, borderRadius } from '../theme/colors';
import {
  acceptTapToPayTerms,
  iphoneTapToPayStatus,
  watchTapToPayReader,
  type IphoneTapToPayStatus,
  type TapToPayReaderState,
} from '../lib/squareTapToPay';
import {
  fetchMyRole,
  fetchTermsAcceptedForBusiness,
  recordTermsAcceptedForBusiness,
} from '../lib/tapToPayOrg';
import { SheetModal } from './SheetModal';
import { useTapToPayEducation } from './TapToPayEducationModal';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called once Tap to Pay on iPhone is enabled and ready on this iPhone. */
  onReady?: () => void;
};

type Step =
  | { kind: 'loading' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'needs_admin' }
  | { kind: 'can_enable'; isAdmin: boolean; businessAccepted: boolean }
  | { kind: 'preparing' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

/**
 * Enabling Tap to Pay on iPhone, as Apple's review checklist asks:
 *  - a clear action to accept the Terms and Conditions (3.5), reachable from
 *    Settings and from checkout (3.6, 3.7);
 *  - only an admin accepts them; others are told to contact an admin (3.8);
 *  - progress is shown while the iPhone is configured (3.9.1);
 *  - once enabled, merchants are taught how to use it (3.9, 4.2).
 */
export const TapToPaySetupModal: React.FC<Props> = ({ visible, onClose, onReady }) => {
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [reader, setReader] = useState<TapToPayReaderState | null>(null);
  const education = useTapToPayEducation();

  const load = useCallback(async () => {
    setStep({ kind: 'loading' });
    try {
      const status: IphoneTapToPayStatus = await iphoneTapToPayStatus();
      if (status.state === 'off') {
        setStep({ kind: 'unsupported', reason: 'Tap to Pay on iPhone isn’t available in this version of the app.' });
      } else if (status.state === 'unsupported') {
        setStep({ kind: 'unsupported', reason: status.reason });
      } else if (status.state === 'linked') {
        setStep({ kind: 'preparing' });
      } else {
        const [role, businessAccepted] = await Promise.all([
          fetchMyRole().catch(() => null),
          fetchTermsAcceptedForBusiness().catch(() => false),
        ]);
        const isAdmin = role === 'admin';
        setStep(isAdmin || businessAccepted ? { kind: 'can_enable', isAdmin, businessAccepted } : { kind: 'needs_admin' });
      }
    } catch (e) {
      setStep({ kind: 'error', message: e instanceof Error ? e.message : 'Could not check Tap to Pay on iPhone.' });
    }
  }, []);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  // Configuration progress (3.9.1): follow the reader until it is ready.
  useEffect(() => {
    if (!visible || step.kind !== 'preparing') return;
    setReader(null);
    const stop = watchTapToPayReader((state) => {
      setReader(state);
      if (state.ready) setStep({ kind: 'ready' });
    });
    return stop;
  }, [visible, step.kind]);

  useEffect(() => {
    if (step.kind === 'ready') onReady?.();
  }, [step.kind, onReady]);

  const enable = async (isAdmin: boolean, businessAccepted: boolean) => {
    setBusy(true);
    try {
      await acceptTapToPayTerms();
      if (isAdmin && !businessAccepted) await recordTermsAcceptedForBusiness().catch(() => undefined);
      setStep({ kind: 'preparing' });
    } catch (e) {
      setStep({ kind: 'error', message: e instanceof Error ? e.message : 'Tap to Pay on iPhone was not set up.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetModal visible={visible} onClose={onClose} title="Tap to Pay on iPhone">
      <ScrollView contentContainerStyle={styles.scroll}>
        {step.kind === 'loading' && <ActivityIndicator color={colors.brand.orange} style={{ marginTop: 40 }} />}

        {step.kind === 'unsupported' && (
          <>
            <Text style={styles.title}>Not available on this iPhone</Text>
            <Text style={styles.body}>{step.reason}</Text>
            <Text style={styles.body}>You can still take cards with a paired Square reader.</Text>
            <Primary label="OK" onPress={onClose} />
          </>
        )}

        {step.kind === 'needs_admin' && (
          <>
            <Text style={styles.title}>Ask an admin to turn it on</Text>
            <Text style={styles.body}>
              Tap to Pay on iPhone has to be enabled for Adaptivity Performance by an administrator, who accepts
              Apple’s Terms and Conditions for the business. Contact dispatch or the owner to enable it, then come back
              here to finish setting up this iPhone.
            </Text>
            <Secondary label="Check again" onPress={() => void load()} />
            <Primary label="OK" onPress={onClose} />
          </>
        )}

        {step.kind === 'can_enable' && (
          <>
            <Text style={styles.title}>Accept payments with your iPhone</Text>
            <Text style={styles.body}>
              Take contactless cards, Apple Pay and other digital wallets right on this iPhone — no extra hardware.
            </Text>
            <Text style={styles.body}>
              {step.isAdmin && !step.businessAccepted
                ? 'As an administrator, you’ll review and accept Apple’s Tap to Pay on iPhone Terms and Conditions for the business. Your Apple Account is used to do this.'
                : 'Adaptivity Performance has already enabled Tap to Pay on iPhone. Continue to finish setting up this iPhone with your Apple Account.'}
            </Text>
            <Primary
              label={step.isAdmin && !step.businessAccepted ? 'Review and accept Terms and Conditions' : 'Enable Tap to Pay on iPhone'}
              busy={busy}
              onPress={() => void enable(step.isAdmin, step.businessAccepted)}
            />
            <Secondary label="Not now" onPress={onClose} />
          </>
        )}

        {step.kind === 'preparing' && (
          <>
            <Text style={styles.title}>Setting up Tap to Pay on iPhone</Text>
            <View style={styles.progressRow}>
              <ActivityIndicator color={colors.brand.orange} />
              <Text style={styles.body}>
                {reader?.label ?? 'Preparing Tap to Pay on iPhone…'}
                {reader?.percent != null ? ` ${reader.percent}%` : ''}
              </Text>
            </View>
            {reader?.percent != null && (
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${reader.percent}%` }]} />
              </View>
            )}
            <Text style={styles.small}>Keep the app open and connected to the internet. This can take a minute the first time.</Text>
          </>
        )}

        {step.kind === 'ready' && (
          <>
            <Text style={styles.title}>You’re ready to take payments</Text>
            <Text style={styles.body}>
              Tap to Pay on iPhone is set up. At the end of a job, tap “Get paid”, then “Tap to Pay on iPhone”, and have
              the customer hold their card or phone near the top of your iPhone.
            </Text>
            <Primary label="Learn how to take payments" onPress={education.open} />
            <Secondary label="Done" onPress={onClose} />
          </>
        )}

        {step.kind === 'error' && (
          <>
            <Text style={styles.title}>Tap to Pay on iPhone wasn’t set up</Text>
            <Text style={styles.body}>{step.message}</Text>
            <Primary label="Try again" onPress={() => void load()} />
            <Secondary label="Close" onPress={onClose} />
          </>
        )}
      </ScrollView>
      {education.element}
    </SheetModal>
  );
};

const Primary: React.FC<{ label: string; onPress: () => void; busy?: boolean }> = ({ label, onPress, busy }) => (
  <TouchableOpacity style={[styles.primary, busy && { opacity: 0.6 }]} disabled={busy} onPress={onPress}>
    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{label}</Text>}
  </TouchableOpacity>
);

const Secondary: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <TouchableOpacity style={styles.secondary} onPress={onPress}>
    <Text style={styles.secondaryText}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text.primary, fontSize: 22, fontWeight: '800' },
  body: { color: colors.text.secondary, fontSize: 15, lineHeight: 22, flexShrink: 1 },
  small: { color: colors.text.muted, fontSize: 12, lineHeight: 17 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.bg.card, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.brand.orange },
  primary: {
    minHeight: 54,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.brand.orange,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  secondary: {
    minHeight: 50,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.text.primary, fontSize: 15, fontWeight: '700' },
});
