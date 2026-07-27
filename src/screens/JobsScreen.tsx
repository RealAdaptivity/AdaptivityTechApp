import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme/colors';
import {
  claimBookingRow,
  cancelJobWithHold,
  fetchDispatchBookings,
  subscribeDispatchBookings,
  supabase,
  updateBookingRow,
  type DispatchBooking,
} from '../lib/supabase';
import { captureBookingPayment } from '../lib/jobPayments';
import { pushTechGpsToBooking } from '../lib/locationDispatch';

interface JobsScreenProps {}

export const JobsScreen: React.FC<JobsScreenProps> = () => {
  const [filter, setFilter] = useState<'available' | 'active'>('available');
  const [jobs, setJobs] = useState<DispatchBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<DispatchBooking | null>(null);
  const [jobStatus, setJobStatus] = useState<'en_route' | 'on_site' | 'complete'>('en_route');
  const [mechanicId, setMechanicId] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const rows = await fetchDispatchBookings();
      setJobs(rows.filter(j => j.status !== 'COMPLETED' && j.status !== 'CANCELED'));
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
    loadJobs();
    const channel = subscribeDispatchBookings(() => {
      loadJobs();
    });
    return () => {
      channel.unsubscribe();
    };
  }, [loadJobs]);

  useEffect(() => {
    if (!activeJob || jobStatus === 'complete') return;
    void pushTechGpsToBooking(activeJob.referenceCode);
    const id = setInterval(() => {
      void pushTechGpsToBooking(activeJob.referenceCode);
    }, 45_000);
    return () => clearInterval(id);
  }, [activeJob, jobStatus]);

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

  const availableJobs = jobs.filter(j => j.status === 'UNASSIGNED');
  const myActive = jobs.find(
    j => j.status !== 'UNASSIGNED' && j.status !== 'COMPLETED' && activeJob?.referenceCode === j.referenceCode
  );

  const handleClaimJob = async (job: DispatchBooking) => {
    if (!mechanicId) {
      Alert.alert('Sign in required', 'Log in with your technician account to claim jobs.');
      return;
    }
    try {
      await claimBookingRow(job.referenceCode, mechanicId);
      setActiveJob(job);
      setFilter('active');
      setJobStatus('en_route');
      await loadJobs();
    } catch (e: unknown) {
      Alert.alert('Claim failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleArrived = async () => {
    if (!activeJob) return;
    setJobStatus('on_site');
    await updateBookingRow(activeJob.referenceCode, { status: 'ON_SITE', distance_miles: 0, eta_minutes: 0 });
    await loadJobs();
  };

  const handleComplete = async () => {
    if (!activeJob) return;
    setJobStatus('complete');
    try {
      const result = await captureBookingPayment(activeJob.referenceCode);
      const msg = result.alreadyCaptured
        ? 'Payment was already captured for this job.'
        : `Customer charged $${result.capturedAmountDollars?.toFixed(2) ?? '0.00'}. Your 70% share ($${result.techPayoutDollars?.toFixed(2) ?? '0.00'}) is transferring.`;
      Alert.alert('Job complete', msg);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Could not capture payment';
      await updateBookingRow(activeJob.referenceCode, { status: 'COMPLETED' });
      Alert.alert(
        'Job marked complete',
        `${message} If this booking has no card hold, no charge applies.`
      );
    }
    setTimeout(() => {
      setActiveJob(null);
      setFilter('available');
      setJobStatus('en_route');
      loadJobs();
    }, 2000);
  };

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
            📋 Available ({availableJobs.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'active' && styles.filterTabActive]}
          onPress={() => setFilter('active')}
        >
          <Text style={[styles.filterText, filter === 'active' && styles.filterTextActive]}>
            🔧 My Active Job
          </Text>
        </TouchableOpacity>
      </View>

      {filter === 'available' && availableJobs.map(job => (
        <View key={job.id} style={styles.jobCard}>
          <View style={styles.jobHeader}>
            <View>
              <Text style={styles.customerName}>{job.customer}</Text>
              <Text style={styles.customerPhone}>📞 {job.phone}</Text>
            </View>
            <View style={styles.distanceBadge}>
              <Text style={styles.distanceText}>📍 {job.distanceMiles.toFixed(1)} mi</Text>
            </View>
          </View>
          <Text style={styles.refCode}>{job.referenceCode}</Text>
          <Text style={styles.vehicleText}>🚗 {job.vehicle}</Text>
          <Text style={styles.addressText}>{job.address}</Text>
          <View style={styles.servicesList}>
            {job.services.map(s => (
              <Text key={s} style={styles.serviceItem}>• {s}</Text>
            ))}
          </View>
          <View style={styles.jobFooter}>
            <Text style={styles.payoutText}>Job Total: ${job.total}</Text>
            <TouchableOpacity style={styles.claimBtn} onPress={() => handleClaimJob(job)}>
              <Text style={styles.claimBtnText}>Claim Dispatch →</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {filter === 'available' && availableJobs.length === 0 && (
        <Text style={styles.emptyText}>No unassigned jobs. New bookings from web & customer app appear here in realtime.</Text>
      )}

      {filter === 'active' && (activeJob || myActive) && (
        <View style={styles.jobCard}>
          <Text style={styles.activeTitle}>Active Dispatch: {(activeJob || myActive)!.referenceCode}</Text>
          <Text style={styles.customerName}>{(activeJob || myActive)!.customer}</Text>
          <Text style={styles.addressText}>{(activeJob || myActive)!.address}</Text>
          {jobStatus === 'en_route' && (
            <TouchableOpacity style={styles.claimBtn} onPress={handleArrived}>
              <Text style={styles.claimBtnText}>Mark Arrived On-Site</Text>
            </TouchableOpacity>
          )}
          {jobStatus === 'on_site' && (
            <TouchableOpacity style={styles.claimBtn} onPress={handleComplete}>
              <Text style={styles.claimBtnText}>Complete Job</Text>
            </TouchableOpacity>
          )}
          {jobStatus !== 'complete' && (
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelJob}>
              <Text style={styles.cancelBtnText}>Cancel job & release hold</Text>
            </TouchableOpacity>
          )}
          {jobStatus === 'complete' && <Text style={styles.emptyText}>Job completed ✓</Text>}
        </View>
      )}

      {filter === 'active' && !activeJob && !myActive && (
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
  vehicleText: { color: colors.text.secondary, fontSize: 13, marginBottom: 4 },
  addressText: { color: colors.text.muted, fontSize: 12, marginBottom: spacing.sm },
  servicesList: { marginBottom: spacing.sm },
  serviceItem: { color: colors.text.secondary, fontSize: 11 },
  jobFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  payoutText: { color: colors.text.primary, fontWeight: '700' },
  claimBtn: {
    backgroundColor: colors.brand.orange,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
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
});
