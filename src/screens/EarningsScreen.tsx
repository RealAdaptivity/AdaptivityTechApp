import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme/colors';
import {
  fetchTechPayoutHistory,
  fetchTechPayoutPreview,
  triggerInstantCashOut,
  type TechPayoutPreview,
  type TechPayoutRow,
} from '../lib/stripePayouts';
import { countsTowardLedgerPending, formatTechPayoutLabel } from '../lib/payoutStatusLabels';

function formatPayoutStatus(row: TechPayoutRow): string {
  const label = formatTechPayoutLabel(row.payoutStatus, row.paymentStatus);
  if (row.payoutStatus === 'instant_paid' || (row.payoutStatus === 'paid' && row.payoutMethod === 'instant')) {
    return `⚡ ${label}`;
  }
  if (row.payoutStatus === 'paid') return `✅ ${label}`;
  if (row.payoutStatus === 'failed') return `❌ ${label}`;
  if (label.includes('progress') || label.includes('Waiting')) return `⏳ ${label}`;
  return label;
}

export const EarningsScreen: React.FC = () => {
  const [rows, setRows] = useState<TechPayoutRow[]>([]);
  const [preview, setPreview] = useState<TechPayoutPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [cashingOut, setCashingOut] = useState(false);
  const [method, setMethod] = useState<'instant' | 'standard'>('standard');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, balancePreview] = await Promise.all([
        fetchTechPayoutHistory(),
        fetchTechPayoutPreview().catch(() => null),
      ]);
      setRows(data);
      setPreview(balancePreview);
      if (balancePreview?.canStandardCashOut) setMethod('standard');
      else if (balancePreview?.canInstantCashOut) setMethod('instant');
    } catch {
      setRows([]);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const availableBalance = rows
    .filter(
      (r) =>
        r.techTransferCents &&
        countsTowardLedgerPending(r.payoutStatus, r.paymentStatus)
    )
    .reduce((sum, r) => sum + (r.techTransferCents ?? 0), 0) / 100;

  const stripeCashOut = preview?.cashOutEligibleDollars ?? 0;
  const connectTotal = preview?.connectTotalDollars ?? stripeCashOut;
  const pendingOnConnect = preview?.pendingDollars ?? 0;
  const availableDollars = preview?.availableDollars ?? (preview?.availableCents ?? 0) / 100;
  const instantDollars = preview?.instantEligibleDollars ?? availableDollars;
  const canCashOut =
    method === 'instant' ? preview?.canInstantCashOut === true : preview?.canStandardCashOut === true;

  const weeklyTotal = rows
    .filter((r) => r.payoutStatus.includes('paid') || r.payoutStatus === 'paid')
    .reduce((sum, r) => sum + (r.techTransferCents ?? 0), 0) / 100;

  const handleCashOut = async () => {
    setCashingOut(true);
    try {
      const result = await triggerInstantCashOut(method);
      Alert.alert('Cash out started', result.message);
      await load();
    } catch (e: unknown) {
      Alert.alert(
        'Cash out unavailable',
        e instanceof Error ? e.message : 'Could not start cash out. Check Settings for Stripe Express.'
      );
    } finally {
      setCashingOut(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Cash out balance (Connect available)</Text>
        <Text style={styles.balanceAmount}>
          {loading ? '—' : `$${stripeCashOut.toFixed(2)}`}
        </Text>
        {!loading && connectTotal > stripeCashOut && (
          <Text style={styles.settlingHint}>
            On Connect: ${connectTotal.toFixed(2)}
            {pendingOnConnect > 0 ? ` (settling $${pendingOnConnect.toFixed(2)})` : ''}
          </Text>
        )}
        {preview?.stripeAccountId ? (
          <Text style={styles.accountId} numberOfLines={1}>{preview.stripeAccountId}</Text>
        ) : null}
        <Text style={styles.ledgerHint}>
          Ledger pending: {loading ? '—' : `$${availableBalance.toFixed(2)}`}
        </Text>
        {preview?.hint ? (
          <Text style={styles.hintText}>{preview.hint}</Text>
        ) : null}

        <Text style={styles.methodTitle}>How do you want to get paid?</Text>
        <Text style={styles.methodIntro}>
          Your 70% job share hits Stripe first. Then cash out Standard (bank) or Instant (debit).
        </Text>
        <TouchableOpacity
          style={[styles.methodOption, method === 'standard' && styles.methodSelected]}
          onPress={() => setMethod('standard')}
          activeOpacity={0.8}
        >
          <Text style={styles.methodName}>Standard — bank deposit</Text>
          <Text style={styles.methodMeta}>
            ~2 business days to your bank. No Stripe Instant fee — best if you’re not in a rush.
            Available: ${availableDollars.toFixed(2)}.
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.methodOption, method === 'instant' && styles.methodSelected]}
          onPress={() => setMethod('instant')}
          activeOpacity={0.8}
        >
          <Text style={styles.methodName}>Instant — debit card</Text>
          <Text style={styles.methodMeta}>
            ~30 minutes to your debit card. Stripe Instant fee ~1% (min ~$0.50) — e.g. $300 → ~$3 fee.
            {!preview?.hasDebitCardForInstant
              ? ' Add a debit card in Settings first.'
              : ` Up to $${instantDollars.toFixed(2)}.`}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.cashOutButton, (cashingOut || !canCashOut) && styles.cashOutDisabled]}
          activeOpacity={0.8}
          onPress={handleCashOut}
          disabled={cashingOut || loading || !canCashOut}
        >
          {cashingOut ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.cashOutText}>
              {method === 'instant' ? '⚡ Cash out Instant' : 'Cash out to bank'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Recent job payouts</Text>
      {loading ? (
        <ActivityIndicator color={colors.brand.orange} style={{ marginTop: 24 }} />
      ) : rows.length === 0 ? (
        <Text style={styles.emptyText}>Completed paid jobs will appear here.</Text>
      ) : (
        rows.map((job) => (
          <View key={job.id} style={styles.jobRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.jobCustomer}>
                {job.bookingReference ?? 'Job'} • ${((job.techTransferCents ?? 0) / 100).toFixed(2)} tech share
              </Text>
              <Text style={styles.jobVehicle}>{formatPayoutStatus(job)}</Text>
            </View>
            <Text style={styles.jobPayout}>
              ${((job.techTransferCents ?? 0) / 100).toFixed(2)}
            </Text>
          </View>
        ))
      )}

      <View style={styles.weeklyCard}>
        <Text style={styles.weeklyLabel}>Paid out (recent)</Text>
        <Text style={styles.weeklyAmount}>${weeklyTotal.toFixed(2)}</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: spacing.lg, paddingBottom: 100 },
  balanceCard: {
    backgroundColor: colors.bg.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  balanceLabel: { fontSize: 13, color: colors.text.secondary, marginBottom: 4 },
  balanceAmount: { fontSize: 36, fontWeight: '800', color: colors.status.success, marginBottom: 4 },
  ledgerHint: { fontSize: 12, color: colors.text.muted, marginBottom: spacing.md },
  settlingHint: { fontSize: 12, color: colors.status.info, marginBottom: 4 },
  accountId: { fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: colors.text.muted, marginBottom: spacing.sm },
  hintText: { fontSize: 12, color: colors.text.secondary, marginBottom: spacing.lg, lineHeight: 18 },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  bankIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bg.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankEmoji: { fontSize: 22 },
  bankName: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
  bankStatus: { fontSize: 12, color: colors.status.success, marginTop: 2 },
  methodTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  methodIntro: {
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 17,
    marginBottom: spacing.sm,
  },
  methodOption: {
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.bg.input,
  },
  methodSelected: {
    borderColor: colors.brand.orange,
    backgroundColor: 'rgba(249, 115, 22, 0.08)',
  },
  methodName: { fontSize: 14, fontWeight: '700', color: colors.text.primary },
  methodMeta: { fontSize: 12, color: colors.text.muted, marginTop: 4, lineHeight: 17 },
  cashOutButton: {
    backgroundColor: colors.brand.orange,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  cashOutDisabled: { opacity: 0.7 },
  cashOutText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text.primary, marginBottom: spacing.md },
  emptyText: { fontSize: 13, color: colors.text.muted },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  jobCustomer: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
  jobVehicle: { fontSize: 12, color: colors.text.muted, marginTop: 2 },
  jobPayout: { fontSize: 16, fontWeight: '700', color: colors.status.success },
  weeklyCard: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.bg.input,
    alignItems: 'center',
  },
  weeklyLabel: { fontSize: 12, color: colors.text.muted },
  weeklyAmount: { fontSize: 24, fontWeight: '800', color: colors.text.primary, marginTop: 4 },
});
