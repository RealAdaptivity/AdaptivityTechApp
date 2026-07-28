import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme/colors';
import {
  claimBookingRow,
  cancelJobWithHold,
  fetchDispatchBookings,
  fetchMyTechSpecialties,
  subscribeDispatchBookings,
  supabase,
  updateBookingRow,
  type DispatchBooking,
} from '../lib/supabase';
import { captureBookingPayment } from '../lib/jobPayments';
import { pushTechGpsToBooking } from '../lib/locationDispatch';
import { openOnTheWaySms } from '../lib/onTheWaySms';
import { techCanClaimServices } from '../lib/jobSpecialtyMatch';

type LineDraft = { title: string; laborDollars: string; partsDollars: string };
type JobPhase = 'en_route' | 'on_site' | 'complete';

export const JobsScreen: React.FC = () => {
  const [filter, setFilter] = useState<'available' | 'active'>('available');
  const [jobs, setJobs] = useState<DispatchBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<DispatchBooking | null>(null);
  const [jobPhase, setJobPhase] = useState<JobPhase>('en_route');
  const [mechanicId, setMechanicId] = useState<string | null>(null);
  const [mySpecialties, setMySpecialties] = useState<string[]>(['mechanical']);
  const [busy, setBusy] = useState(false);
  const [techNotes, setTechNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ title: '', laborDollars: '', partsDollars: '' }]);

  const loadJobs = useCallback(async () => {
    try {
      const rows = await fetchDispatchBookings();
      setJobs(rows.filter((j) => j.status !== 'COMPLETED' && j.status !== 'CANCELED'));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load dispatch board.';
      Alert.alert('Dispatch Error', message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setMechanicId(data.session?.user?.id ?? null);
    });
    void fetchMyTechSpecialties().then(setMySpecialties);
    loadJobs();
    const channel = subscribeDispatchBookings(() => {
      loadJobs();
    });
    return () => {
      channel.unsubscribe();
    };
  }, [loadJobs]);

  useEffect(() => {
    if (!activeJob) return;
    const fresh = jobs.find((j) => j.referenceCode === activeJob.referenceCode);
    if (fresh && fresh.status !== activeJob.status) {
      setActiveJob(fresh);
      if (fresh.status === 'COMPLETED') setJobPhase('complete');
      if (fresh.status === 'ON_SITE') setJobPhase('on_site');
    }
  }, [jobs, activeJob]);

  useEffect(() => {
    if (!activeJob || jobPhase === 'complete') return;
    void pushTechGpsToBooking(activeJob.referenceCode);
    const id = setInterval(() => {
      void pushTechGpsToBooking(activeJob.referenceCode);
    }, 45_000);
    return () => clearInterval(id);
  }, [activeJob, jobPhase]);

  const handleCancelJob = async () => {
    if (!activeJob) return;
    Alert.alert(
      'Cancel job?',
      'This releases the customer card hold and marks the job canceled.',
      [
        { text: 'Keep job', style: 'cancel' },
        {
          text: 'Cancel job',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelJobWithHold(activeJob.referenceCode);
              setActiveJob(null);
              setFilter('available');
              await loadJobs();
            } catch (e: unknown) {
              Alert.alert('Cancel failed', e instanceof Error ? e.message : 'Unknown error');
            }
          },
        },
      ]
    );
  };

  const availableJobs = jobs.filter(
    (j) => j.status === 'UNASSIGNED' && techCanClaimServices(mySpecialties, j.services)
  );
  const myActive = jobs.find(
    (j) =>
      j.status !== 'UNASSIGNED' &&
      j.status !== 'COMPLETED' &&
      activeJob?.referenceCode === j.referenceCode
  );

  const textCustomerOnTheWay = async (job: DispatchBooking) => {
    const ok = await openOnTheWaySms({
      phone: job.phone,
      customerName: job.customer,
      referenceCode: job.referenceCode,
      etaMinutes: job.etaMinutes || 12,
    });
    if (!ok) {
      Alert.alert(
        'No phone number',
        'This booking has no customer phone on file. Call or message them another way.'
      );
    }
  };

  const handleClaimJob = async (job: DispatchBooking) => {
    if (!mechanicId) {
      Alert.alert('Sign in required', 'Log in with your technician account to claim jobs.');
      return;
    }
    try {
      await claimBookingRow(job.referenceCode, mechanicId);
      const claimed = { ...job, status: 'EN_ROUTE' as const, etaMinutes: job.etaMinutes || 12 };
      setActiveJob(claimed);
      setFilter('active');
      setJobPhase('en_route');
      setLines([{ title: '', laborDollars: '', partsDollars: '' }]);
      setTechNotes('');
      await loadJobs();
      Alert.alert(
        'Job claimed',
        'Text the customer that you’re on the way — opens your Messages app.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Text customer', onPress: () => void textCustomerOnTheWay(claimed) },
        ]
      );
    } catch (e: unknown) {
      Alert.alert('Claim failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleArrived = async () => {
    if (!activeJob) return;
    setJobPhase('on_site');
    await updateBookingRow(activeJob.referenceCode, {
      status: 'ON_SITE',
      distance_miles: 0,
      eta_minutes: 0,
    });
    setActiveJob({ ...activeJob, status: 'ON_SITE' });
    await loadJobs();
  };

  const holdDollars = (activeJob?.holdAmountCents ?? 10000) / 100;
  const repairsSubtotal = lines.reduce(
    (s, l) => s + (Number(l.laborDollars) || 0) + (Number(l.partsDollars) || 0),
    0
  );
  const chargeTotal = holdDollars + repairsSubtotal;

  const finishJobUi = () => {
    setBusy(false);
    setTimeout(() => {
      setActiveJob(null);
      setFilter('available');
      setJobPhase('en_route');
      loadJobs();
    }, 2000);
  };

  const handleCharge = async () => {
    if (!activeJob) return;
    const lineItems = lines
      .map((l) => ({
        title: l.title.trim(),
        laborDollars: Number(l.laborDollars) || 0,
        partsDollars: Number(l.partsDollars) || 0,
      }))
      .filter((l) => l.title && l.laborDollars + l.partsDollars > 0);

    if (!lineItems.length) {
      Alert.alert('Set a price', 'Add labor/parts lines, or use Diagnostic only.');
      return;
    }

    setBusy(true);
    try {
      const result = await captureBookingPayment(activeJob.referenceCode, {
        mode: 'charge',
        lineItems,
        techNotes,
      });
      setJobPhase('complete');
      Alert.alert(
        'Charged',
        `Customer charged $${result.capturedAmountDollars?.toFixed(2) ?? '0.00'}. Your 70% share: $${result.techPayoutDollars?.toFixed(2) ?? '0.00'}.`
      );
      finishJobUi();
    } catch (e: unknown) {
      Alert.alert('Charge failed', e instanceof Error ? e.message : 'Could not charge');
      setBusy(false);
    }
  };

  const handleDiagnosticOnly = async () => {
    if (!activeJob) return;
    Alert.alert('Diagnostic only?', 'Charge the $100 visit and close with no repairs.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Charge $100',
        onPress: async () => {
          setBusy(true);
          try {
            const result = await captureBookingPayment(activeJob.referenceCode, {
              mode: 'diagnostic_only',
            });
            setJobPhase('complete');
            Alert.alert(
              'Diagnostic charged',
              `$${result.capturedAmountDollars?.toFixed(2)} · your 70%: $${result.techPayoutDollars?.toFixed(2)}`
            );
            finishJobUi();
          } catch (e: unknown) {
            Alert.alert('Failed', e instanceof Error ? e.message : 'Could not charge');
            setBusy(false);
          }
        },
      },
    ]);
  };

  const job = activeJob || myActive;

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.brand.orange} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'available' && styles.filterTabActive]}
          onPress={() => setFilter('available')}
        >
          <Text style={[styles.filterText, filter === 'available' && styles.filterTextActive]}>
            Available ({availableJobs.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'active' && styles.filterTabActive]}
          onPress={() => setFilter('active')}
        >
          <Text style={[styles.filterText, filter === 'active' && styles.filterTextActive]}>
            My Active Job
          </Text>
        </TouchableOpacity>
      </View>

      {filter === 'available' &&
        availableJobs.map((j) => (
          <View key={j.id} style={styles.jobCard}>
            <View style={styles.jobHeader}>
              <View>
                <Text style={styles.customerName}>{j.customer}</Text>
                <Text style={styles.customerPhone}>{j.phone}</Text>
              </View>
              <View style={styles.distanceBadge}>
                <Text style={styles.distanceText}>{j.distanceMiles.toFixed(1)} mi</Text>
              </View>
            </View>
            <Text style={styles.refCode}>{j.referenceCode}</Text>
            {j.quoteStatus === 'awaiting_diagnostic' && (
              <Text style={styles.diagBadge}>$100 HOLD — tech sets price on site</Text>
            )}
            <Text style={styles.vehicleText}>{j.vehicle}</Text>
            <Text style={styles.addressText}>{j.address}</Text>
            <View style={styles.servicesList}>
              {j.services.map((s) => (
                <Text key={s} style={styles.serviceItem}>
                  • {s}
                </Text>
              ))}
            </View>
            <View style={styles.jobFooter}>
              <Text style={styles.payoutText}>Hold: $100</Text>
              <TouchableOpacity style={styles.claimBtn} onPress={() => void handleClaimJob(j)}>
                <Text style={styles.claimBtnText}>Claim Dispatch →</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

      {filter === 'available' && availableJobs.length === 0 && (
        <Text style={styles.emptyText}>
          No unassigned jobs. New bookings from web & customer app appear here in realtime.
        </Text>
      )}

      {filter === 'active' && job && (
        <View style={styles.jobCard}>
          <Text style={styles.activeTitle}>Active Dispatch: {job.referenceCode}</Text>
          <Text style={styles.customerName}>{job.customer}</Text>
          <Text style={styles.addressText}>{job.address}</Text>
          <Text style={styles.hint}>
            Diagnose on site, set labor + parts, then charge. You keep 70%; Adaptivity 30%.
          </Text>

          {jobPhase === 'en_route' && (
            <>
              <TouchableOpacity
                style={styles.smsBtn}
                onPress={() => void textCustomerOnTheWay(job)}
              >
                <Text style={styles.claimBtnText}>Text customer — on the way</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.claimBtn} onPress={() => void handleArrived()}>
                <Text style={styles.claimBtnText}>Mark Arrived On-Site</Text>
              </TouchableOpacity>
            </>
          )}

          {jobPhase === 'on_site' && (
            <View style={styles.quoteBox}>
              <Text style={styles.quoteTitle}>Set price (labor + parts)</Text>
              {lines.map((line, idx) => (
                <View key={idx} style={styles.lineBlock}>
                  <TextInput
                    style={styles.input}
                    placeholder="Line title"
                    placeholderTextColor={colors.text.muted}
                    value={line.title}
                    onChangeText={(t) => {
                      const next = [...lines];
                      next[idx] = { ...next[idx], title: t };
                      setLines(next);
                    }}
                  />
                  <View style={styles.row2}>
                    <TextInput
                      style={[styles.input, styles.half]}
                      placeholder="Labor $"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="decimal-pad"
                      value={line.laborDollars}
                      onChangeText={(t) => {
                        const next = [...lines];
                        next[idx] = { ...next[idx], laborDollars: t };
                        setLines(next);
                      }}
                    />
                    <TextInput
                      style={[styles.input, styles.half]}
                      placeholder="Parts $"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="decimal-pad"
                      value={line.partsDollars}
                      onChangeText={(t) => {
                        const next = [...lines];
                        next[idx] = { ...next[idx], partsDollars: t };
                        setLines(next);
                      }}
                    />
                  </View>
                </View>
              ))}
              <TouchableOpacity
                onPress={() => setLines([...lines, { title: '', laborDollars: '', partsDollars: '' }])}
              >
                <Text style={styles.addLine}>+ Add line</Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]}
                placeholder="Notes (optional)"
                placeholderTextColor={colors.text.muted}
                multiline
                value={techNotes}
                onChangeText={setTechNotes}
              />
              <Text style={styles.hint}>
                Total ≈ ${chargeTotal.toFixed(2)} ($
                {holdDollars.toFixed(0)} diagnostic + ${repairsSubtotal.toFixed(2)} repairs)
              </Text>
              <TouchableOpacity
                style={[styles.completeBtn, busy && { opacity: 0.6 }]}
                disabled={busy}
                onPress={() => void handleCharge()}
              >
                <Text style={styles.claimBtnText}>
                  {busy ? 'Charging…' : `Charge customer $${chargeTotal.toFixed(2)}`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smsBtn, busy && { opacity: 0.6 }]}
                disabled={busy}
                onPress={() => void handleDiagnosticOnly()}
              >
                <Text style={styles.claimBtnText}>Diagnostic only ($100)</Text>
              </TouchableOpacity>
            </View>
          )}

          {jobPhase !== 'complete' && (
            <TouchableOpacity style={styles.cancelBtn} onPress={() => void handleCancelJob()}>
              <Text style={styles.cancelBtnText}>Cancel job & release hold</Text>
            </TouchableOpacity>
          )}
          {jobPhase === 'complete' && <Text style={styles.emptyText}>Job completed ✓</Text>}
        </View>
      )}

      {filter === 'active' && !job && (
        <Text style={styles.emptyText}>Claim a job from the Available tab to start dispatch.</Text>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  filterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  filterTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.primary,
    alignItems: 'center',
  },
  filterTabActive: { borderColor: colors.brand.orange, backgroundColor: colors.bg.input },
  filterText: { color: colors.text.muted, fontWeight: '600', fontSize: 12 },
  filterTextActive: { color: colors.brand.orange },
  jobCard: {
    backgroundColor: colors.bg.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  jobHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  customerName: { color: colors.text.primary, fontWeight: '800', fontSize: 16 },
  customerPhone: { color: colors.text.muted, fontSize: 12, marginTop: 2 },
  distanceBadge: {
    backgroundColor: colors.bg.input,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  distanceText: { color: colors.text.secondary, fontSize: 11, fontWeight: '700' },
  refCode: { color: colors.brand.orange, fontWeight: '800', fontSize: 12, marginBottom: 4 },
  diagBadge: { color: '#7dd3fc', fontWeight: '800', fontSize: 10, marginBottom: 6 },
  vehicleText: { color: colors.text.secondary, fontSize: 13, marginBottom: 4 },
  addressText: { color: colors.text.muted, fontSize: 12, marginBottom: spacing.sm },
  servicesList: { marginBottom: spacing.sm },
  serviceItem: { color: colors.text.secondary, fontSize: 11 },
  jobFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  payoutText: { color: colors.text.primary, fontWeight: '700' },
  claimBtn: {
    backgroundColor: colors.brand.orange,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  smsBtn: {
    backgroundColor: '#0369a1',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  completeBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  claimBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  cancelBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
    alignItems: 'center',
  },
  cancelBtnText: { color: '#fca5a5', fontWeight: '700', fontSize: 12 },
  emptyText: { color: colors.text.muted, textAlign: 'center', marginTop: spacing.lg, lineHeight: 20 },
  activeTitle: { color: colors.brand.orange, fontWeight: '800', marginBottom: spacing.sm },
  hint: { color: '#7dd3fc', fontSize: 12, lineHeight: 18, marginBottom: spacing.sm },
  quoteBox: {
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    backgroundColor: colors.bg.input,
    gap: spacing.sm,
  },
  quoteTitle: {
    color: colors.text.secondary,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  lineBlock: { gap: 6, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border.primary, paddingBottom: 8 },
  input: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text.primary,
    fontSize: 13,
  },
  row2: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  addLine: { color: colors.brand.orange, fontWeight: '800', fontSize: 12 },
});
