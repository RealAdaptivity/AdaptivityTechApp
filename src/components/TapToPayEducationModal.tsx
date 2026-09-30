import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { appleEducationAvailable, showAppleHowToTap } from '../../modules/tap-to-pay-education';
import { colors, spacing, borderRadius } from '../theme/colors';
import { SheetModal } from './SheetModal';

type Props = { visible: boolean; onClose: () => void };

/**
 * How to take payments with Tap to Pay on iPhone (review requirements 4.1–4.8).
 *
 * On iOS 18+ Apple's own ProximityReaderDiscovery screens are shown — Apple
 * requires that where available, and it covers contactless cards, Apple Pay
 * and wallets, PIN entry and fallbacks. On older iOS these pages cover the
 * same ground. Reachable after setup and from Settings at any time (4.3).
 */
const PAGES: { title: string; body: string[] }[] = [
  {
    title: 'Accept contactless cards',
    body: [
      'Start the payment in the app. When your iPhone shows “Hold Here”, have the customer hold their contactless card flat against the top of your iPhone, near the camera.',
      'Keep it there until the check mark appears.',
    ],
  },
  {
    title: 'Accept Apple Pay and other digital wallets',
    body: [
      'Customers can pay with Apple Pay, Google Wallet and other wallets the same way.',
      'They hold their phone or watch near the top of your iPhone and confirm on their own device.',
    ],
  },
  {
    title: 'PIN entry and accessibility',
    body: [
      'Some cards ask for a PIN. Hand the customer your iPhone to enter it on the secure PIN screen; you never see the PIN.',
      'The PIN screen supports accessibility options, including VoiceOver, for customers who need them.',
    ],
  },
  {
    title: 'If a card can’t be read',
    body: [
      'Ask the customer to try again, holding the card still and flat at the top of your iPhone.',
      'If it still can’t be read, use a paired Square card reader, or record the payment another way (cash or the Square app).',
    ],
  },
];

/** Opens Apple's education on iOS 18+, otherwise the pages below. Render
 *  `element` once in the screen that uses it. */
export function useTapToPayEducation(): { open: () => void; element: React.ReactElement } {
  const [visible, setVisible] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const open = useCallback(() => {
    setNote(null);
    if (!appleEducationAvailable()) {
      setVisible(true);
      return;
    }
    void showAppleHowToTap()
      .then((shown) => {
        if (!shown) setVisible(true);
      })
      .catch((e: unknown) => {
        setNote(`Apple’s guide couldn’t open (${e instanceof Error ? e.message : String(e)}). Here’s the same guide:`);
        setVisible(true);
      });
  }, []);
  const element = <TapToPayEducationModal visible={visible} note={note} onClose={() => setVisible(false)} />;
  return { open, element };
}

const TapToPayEducationModal: React.FC<Props & { note: string | null }> = ({ visible, note, onClose }) => {
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (visible) setPage(0);
  }, [visible]);

  const last = page === PAGES.length - 1;
  const current = PAGES[page];

  return (
    <SheetModal visible={visible} onClose={onClose} title="How to use Tap to Pay on iPhone">
      <ScrollView contentContainerStyle={styles.scroll}>
        {!!note && <Text style={styles.note}>{note}</Text>}
        <Text style={styles.step}>
          {page + 1} of {PAGES.length}
        </Text>
        <Text style={styles.title}>{current.title}</Text>
        {current.body.map((line) => (
          <Text key={line} style={styles.body}>
            {line}
          </Text>
        ))}
        <View style={styles.row}>
          {page > 0 && (
            <TouchableOpacity style={styles.secondary} onPress={() => setPage((p) => p - 1)}>
              <Text style={styles.secondaryText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.primary} onPress={() => (last ? onClose() : setPage((p) => p + 1))}>
            <Text style={styles.primaryText}>{last ? 'Done' : 'Next'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SheetModal>
  );
};

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md },
  note: { color: colors.text.muted, fontSize: 12 },
  step: { color: colors.brand.orange, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: colors.text.primary, fontSize: 22, fontWeight: '800' },
  body: { color: colors.text.secondary, fontSize: 15, lineHeight: 22 },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  primary: {
    flex: 1,
    minHeight: 52,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.brand.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondary: {
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.text.primary, fontSize: 15, fontWeight: '700' },
});
