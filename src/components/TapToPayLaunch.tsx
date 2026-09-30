import React, { useEffect, useState } from 'react';
import { AppState, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius } from '../theme/colors';
import { iphoneTapToPayStatus, warmUpTapToPay } from '../lib/squareTapToPay';
import { supabase } from '../lib/supabase';
import { TapToPaySetupModal } from './TapToPaySetupModal';

const INTRO_SEEN_KEY = 'tapToPayIphoneIntroSeen:v1';

/**
 * Tap to Pay on iPhone at the app level (review checklist):
 *  - 1.5: prepare Tap to Pay when the app launches and returns to the
 *    foreground, so checkout starts quickly;
 *  - 3.1–3.3: tell every eligible user about Tap to Pay on iPhone at least
 *    once, with a full-screen introduction (the recommended splash, 3.2),
 *    leading straight into setup.
 * Does nothing on Android or on builds without the Tap to Pay entitlement.
 */
export const TapToPayLaunch: React.FC = () => {
  const [introVisible, setIntroVisible] = useState(false);
  const [setupVisible, setSetupVisible] = useState(false);

  useEffect(() => {
    void warmUpTapToPay();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void warmUpTapToPay();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const key = `${INTRO_SEEN_KEY}:${user.id}`;
        if (await AsyncStorage.getItem(key)) return;
        const status = await iphoneTapToPayStatus();
        if (cancelled || status.state !== 'not_linked') return;
        await AsyncStorage.setItem(key, new Date().toISOString());
        setIntroVisible(true);
      } catch {
        /* the intro is a nicety; never block the app on it */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Modal visible={introVisible} animationType="fade" onRequestClose={() => setIntroVisible(false)} statusBarTranslucent>
        <SafeAreaProvider>
          <SafeAreaView style={styles.root}>
            <View style={styles.center}>
              <Text style={styles.kicker}>New</Text>
              <Text style={styles.title}>Tap to Pay on iPhone</Text>
              <Text style={styles.body}>
                Accept contactless cards, Apple Pay and other digital wallets right on your iPhone — no extra hardware
                needed.
              </Text>
              <Text style={styles.body}>Customers just hold their card or phone near the top of your iPhone at the end of the job.</Text>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.primary}
                onPress={() => {
                  setIntroVisible(false);
                  setSetupVisible(true);
                }}
              >
                <Text style={styles.primaryText}>Set up Tap to Pay on iPhone</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondary} onPress={() => setIntroVisible(false)}>
                <Text style={styles.secondaryText}>Not now</Text>
              </TouchableOpacity>
              <Text style={styles.small}>You can set it up any time in Settings → Card payments.</Text>
            </View>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
      <TapToPaySetupModal visible={setupVisible} onClose={() => setSetupVisible(false)} />
    </>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg.primary, padding: spacing.xl, justifyContent: 'space-between' },
  center: { flex: 1, justifyContent: 'center', gap: spacing.md },
  kicker: { color: colors.brand.orange, fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: colors.text.primary, fontSize: 32, fontWeight: '800' },
  body: { color: colors.text.secondary, fontSize: 17, lineHeight: 25 },
  actions: { gap: spacing.sm },
  primary: {
    minHeight: 56,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.brand.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  secondary: {
    minHeight: 50,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.text.primary, fontSize: 15, fontWeight: '700' },
  small: { color: colors.text.muted, fontSize: 12, textAlign: 'center', marginTop: 4 },
});
