import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Linking, ActivityIndicator, AppState,
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme/colors';
import {
  fetchTechConnectStatus,
  openExpressDashboard,
  openStripePayoutSetup,
  type TechConnectStatus,
} from '../lib/stripePayouts';

interface SettingsScreenProps {
  onLogout: () => void;
}

function statusLabel(status: TechConnectStatus | null): string {
  if (!status) return 'Sign in to view payout status';
  if (status.readyForPayouts) return 'Ready for job payouts & instant cash out';
  if (status.detailsSubmitted) return 'Stripe reviewing — finish any requested items';
  if (status.accountId) return 'Finish Express onboarding to receive transfers';
  return 'Not linked yet';
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onLogout }) => {
  const [bankName, setBankName] = useState('Link Stripe for instant debit payouts');
  const [stripeExpressId, setStripeExpressId] = useState<string | null>(null);
  const [connectStatus, setConnectStatus] = useState<TechConnectStatus | null>(null);
  const [loadingStripe, setLoadingStripe] = useState(true);
  const [linking, setLinking] = useState(false);
  const [openingDash, setOpeningDash] = useState(false);
  const taxYear = '2025';

  const refreshStripe = useCallback(async () => {
    setLoadingStripe(true);
    try {
      const status = await fetchTechConnectStatus();
      setConnectStatus(status);
      const id = status?.accountId?.startsWith('acct_') ? status.accountId : null;
      setStripeExpressId(id);
      if (status?.hasDebitCardForInstant) {
        setBankName('Instant debit card on file');
      } else if (status?.readyForPayouts) {
        setBankName('Bank linked — add debit card in Stripe for Instant');
      } else if (id) {
        setBankName('Complete Stripe Express to unlock payouts');
      }
    } catch {
      setConnectStatus(null);
      setStripeExpressId(null);
    } finally {
      setLoadingStripe(false);
    }
  }, []);

  useEffect(() => {
    refreshStripe();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshStripe();
    });
    return () => sub.remove();
  }, [refreshStripe]);

  const handleStripeLink = async () => {
    setLinking(true);
    try {
      const { onboardingUrl } = await openStripePayoutSetup();
      await Linking.openURL(onboardingUrl);
    } catch (e: unknown) {
      Alert.alert(
        'Stripe setup',
        e instanceof Error ? e.message : 'Could not open Stripe onboarding.'
      );
    } finally {
      setLinking(false);
    }
  };

  const handleExpressDashboard = async () => {
    setOpeningDash(true);
    try {
      const { loginUrl } = await openExpressDashboard();
      await Linking.openURL(loginUrl);
    } catch (e: unknown) {
      Alert.alert(
        'Express Dashboard',
        e instanceof Error
          ? e.message
          : 'Could not open Express Dashboard. Finish Connect Stripe first.'
      );
    } finally {
      setOpeningDash(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of Adaptivity Tech Dispatch?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: onLogout },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>🏦</Text>
          <View>
            <Text style={styles.cardTitle}>Direct Deposit & Instant Payouts</Text>
            <Text style={styles.cardSubtitle}>
              Standard: bank deposit in ~2 business days, no Instant fee. Instant: debit card in ~30 minutes, Stripe ~1% fee (min ~$0.50). Bank setup alone doesn’t add a debit card — open Express Dashboard → payout settings → Add debit card for Instant.
            </Text>
          </View>
        </View>

        <Text style={styles.inputLabel}>Payout status</Text>
        <View style={styles.readonlyInput}>
          {loadingStripe ? (
            <ActivityIndicator color={colors.brand.orange} />
          ) : (
            <Text style={styles.statusText}>{statusLabel(connectStatus)}</Text>
          )}
        </View>

        <Text style={styles.inputLabel}>Payout account label</Text>
        <TextInput
          style={styles.input}
          value={bankName}
          onChangeText={setBankName}
          placeholderTextColor={colors.text.muted}
        />

        <Text style={styles.inputLabel}>Stripe Express Account ID</Text>
        <View style={styles.readonlyInput}>
          {loadingStripe ? (
            <ActivityIndicator color={colors.brand.orange} />
          ) : (
            <Text style={styles.readonlyText}>{stripeExpressId ?? 'Not linked yet'}</Text>
          )}
        </View>

        {stripeExpressId ? (
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.8}
            onPress={handleExpressDashboard}
            disabled={openingDash}
          >
            {openingDash ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {connectStatus?.hasDebitCardForInstant
                  ? 'Open Express Dashboard →'
                  : 'Open Express Dashboard → add debit card'}
              </Text>
            )}
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.updateButton}
          activeOpacity={0.8}
          onPress={handleStripeLink}
          disabled={linking}
        >
          {linking ? (
            <ActivityIndicator color={colors.brand.orange} />
          ) : (
            <Text style={styles.updateText}>
              {stripeExpressId ? 'Update identity / bank setup →' : 'Connect Stripe Express →'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>📄</Text>
          <View>
            <Text style={styles.cardTitle}>1099-NEC Tax Documentation Vault</Text>
            <Text style={styles.cardSubtitle}>Annual contractor tax forms and IRS 1099 income statements.</Text>
          </View>
        </View>

        <View style={styles.taxRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.taxTitle}>Form 1099-NEC ({taxYear} Tax Year)</Text>
            <Text style={styles.taxSubtitle}>IRS Non-Employee Compensation Report</Text>
          </View>
          <TouchableOpacity style={styles.downloadButton} activeOpacity={0.8}>
            <Text style={styles.downloadText}>⬇ PDF</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.taxRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.taxTitle}>W-9 Taxpayer Verification</Text>
            <Text style={[styles.taxSubtitle, { color: colors.status.success }]}>Status: Verified & Filed</Text>
          </View>
          <TouchableOpacity style={styles.viewButton} activeOpacity={0.8}>
            <Text style={styles.viewText}>View W-9</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>🚛</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Technician Rig Audit Status</Text>
          </View>
          <View style={styles.aseBadge}>
            <Text style={styles.aseBadgeText}>ASE Master Verified</Text>
          </View>
        </View>

        <Text style={styles.rigDetail}>• Mobile Unit: 2023 Ford F-250 Super Duty (Rig #4)</Text>
        <Text style={styles.rigDetail}>• 8-Point Tool Audit: OBD-II Scanner, Hydraulic Jacks, Torque Wrenches</Text>
        <Text style={styles.rigDetail}>• Coverage Area: Justin, Northlake, Argyle, Haslet & DFW Radius</Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={styles.logoutText}>🚪 Sign Out of Adaptivity Tech</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: spacing.lg, paddingBottom: 100 },
  card: {
    backgroundColor: colors.bg.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  cardEmoji: { fontSize: 24 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text.primary },
  cardSubtitle: { fontSize: 12, color: colors.text.secondary, marginTop: 4, lineHeight: 17 },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.bg.input,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    color: colors.text.primary,
    fontSize: 14,
  },
  readonlyInput: {
    backgroundColor: colors.bg.input,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  readonlyText: { fontSize: 13, color: colors.text.muted, fontFamily: 'monospace' },
  statusText: { fontSize: 13, color: colors.text.secondary, lineHeight: 18 },
  primaryButton: {
    backgroundColor: colors.brand.orange,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  primaryButtonText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  updateButton: {
    backgroundColor: colors.bg.input,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.orange,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  updateText: { fontSize: 13, fontWeight: '600', color: colors.brand.orange },
  taxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.input,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  taxTitle: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
  taxSubtitle: { fontSize: 12, color: colors.text.muted, marginTop: 2 },
  downloadButton: {
    backgroundColor: colors.brand.orange,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
  },
  downloadText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  viewButton: {
    backgroundColor: colors.bg.card,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  viewText: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  aseBadge: {
    backgroundColor: colors.status.successBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.success,
  },
  aseBadgeText: { fontSize: 10, fontWeight: '700', color: colors.status.success },
  rigDetail: { fontSize: 13, color: colors.text.secondary, marginBottom: spacing.sm, lineHeight: 19 },
  logoutButton: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  logoutText: { fontSize: 15, fontWeight: '600', color: colors.status.error },
});
