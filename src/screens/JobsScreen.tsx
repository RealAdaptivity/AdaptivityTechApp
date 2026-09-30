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
  Linking,
  RefreshControl,
  Platform,
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme/colors';
import {
  claimBookingRow,
  fetchDispatchBookings,
  fetchMyTechSpecialties,
  releaseJob,
  subscribeDispatchBookings,
  supabase,
  updateBookingRow,
  type DispatchBooking,
} from '../lib/supabase';
import { pushTechGpsToBooking } from '../lib/locationDispatch';
import { sendOnTheWaySmsAuto, notifyCustomerPush } from '../lib/sendSms';
import { normalizePhoneForSms } from '../lib/onTheWaySms';
import { uploadJobPhotoUri } from '../lib/jobPhotos';
import { specialtyMatchHint } from '../lib/jobSpecialtyMatch';
import {
  fetchMyPartsExpenseClaims,
  submitPartsExpenseClaim,
  type PartsExpenseClaim,
} from '../lib/partsExpenses';
import {
  cacheOfflineJobPacket,
  listOfflineJobPackets,
  syncOfflineJobPackets,
  type OfflineJobPacket,
} from '../lib/offlineJobPacket';
import { clockIn, clockOut, fetchMyShiftStatus, shiftElapsedLabel, type ShiftStatus } from '../lib/techShifts';
import { DIAGNOSTIC_FEE_DOLLARS } from '../lib/pricing';
import { computeCloseOut } from '../lib/closeOut';
import { recordJobPayment } from '../lib/jobPayments';
import { GetPaidScreen } from '../components/GetPaidScreen';
import { MessageIcon, NavigateIcon, PhoneIcon } from '../components/ContactIcons';

type JobPhase = 'en_route' | 'on_site' | 'complete';
type JobsFilter = 'today' | 'available' | 'active' | 'completed';

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function googleMapsDirectionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

function openNavigate(address: string) {
  if (!address?.trim()) {
    Alert.alert('No address', 'This job has no customer address on file.');
    return;
  }
  void Linking.openURL(googleMapsDirectionsUrl(address.trim()));
}

function callCustomer(phone: string) {
  const to = normalizePhoneForSms(phone);
  if (to) void Linking.openURL(`tel:${to}`);
}

function textCustomer(phone: string, body: string) {
  const to = normalizePhoneForSms(phone);
  if (!to) return;
  const sep = Platform.OS === 'ios' ? '&' : '?';
  void Linking.openURL(`sms:${to}${sep}body=${encodeURIComponent(body)}`);
}

function isTodaysJob(j: DispatchBooking, today: string): boolean {
  return j.preferredDate === today || j.status === 'EN_ROUTE' || j.status === 'ON_SITE';
}

function isUnclaimed(j: DispatchBooking): boolean {
  return !j.mechanicId || j.status === 'UNASSIGNED';
}

function isFinished(j: DispatchBooking): boolean {
  return j.status === 'COMPLETED' || j.status === 'CANCELED';
}

const money = (n: number) => `$${n.toFixed(2)}`;

export const JobsScreen: React.FC = () => {
  const [filter, setFilter] = useState<JobsFilter>('available');
  const [jobs, setJobs] = useState<DispatchBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeJob, setActiveJob] = useState<DispatchBooking | null>(null);
  const [jobPhase, setJobPhase] = useState<JobPhase>('en_route');
  const [mechanicId, setMechanicId] = useState<string | null>(null);
  const [mySpecialties, setMySpecialties] = useState<string[]>(['mechanical']);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [shift, setShift] = useState<ShiftStatus>({ onShift: false, since: null });
  const [shiftBusy, setShiftBusy] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseBusy, setExpenseBusy] = useState(false);
  const [claims, setClaims] = useState<PartsExpenseClaim[]>([]);
  const [offlinePackets, setOfflinePackets] = useState<OfflineJobPacket[]>([]);
  const [loadError, setLoadError] = useState(false);

  const loadShift = useCallback(async () => {
    try {
      setShift(await fetchMyShiftStatus());
    } catch {
      /* the claim gate is the real enforcement; a failed read leaves the banner as-is */
    }
  }, []);

  const loadClaims = useCallback(async () => {
    try {
      setClaims(await fetchMyPartsExpenseClaims());
    } catch {
      /* table may be missing locally */
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const rows = (await fetchDispatchBookings()).filter((j) => j.status !== 'CANCELED');
      setJobs(rows);
      setLoadError(false);
      const open = rows.filter((j) => !isFinished(j));
      void syncOfflineJobPackets(open).then(() => listOfflineJobPackets().then(setOfflinePackets));
    } catch (e: unknown) {
      setLoadError(true);
      void listOfflineJobPackets().then(setOfflinePackets);
      setMessage(e instanceof Error ? e.message : 'Failed to load dispatch board.');
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadJobs(), loadShift()]);
    setRefreshing(false);
  }, [loadJobs, loadShift]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setMechanicId(data.session?.user?.id ?? null));
    void fetchMyTechSpecialties().then(setMySpecialties);
    void loadJobs();
    void loadShift();
    void loadClaims();
    const channel = subscribeDispatchBookings(() => void loadJobs());
    return () => {
      void channel.unsubscribe();
    };
  }, [loadJobs, loadShift, loadClaims]);

  // Keep the open job in step with the board (dispatch may change it).
  useEffect(() => {
    if (!activeJob) return;
    const fresh = jobs.find((j) => j.referenceCode === activeJob.referenceCode);
    if (!fresh) return;
    if (fresh.status !== activeJob.status || fresh.paymentStatus !== activeJob.paymentStatus) {
      setActiveJob(fresh);
      if (fresh.status === 'COMPLETED') setJobPhase('complete');
      if (fresh.status === 'ON_SITE') setJobPhase('on_site');
    }
  }, [jobs, activeJob]);

  // Reopen the tech's in-progress job after an app restart.
  useEffect(() => {
    if (!mechanicId || activeJob) return;
    const mine = jobs.find(
      (j) => j.mechanicId === mechanicId && (j.status === 'EN_ROUTE' || j.status === 'ON_SITE')
    );
    if (mine) {
      setActiveJob(mine);
      setFilter('active');
      setJobPhase(mine.status === 'ON_SITE' ? 'on_site' : 'en_route');
    }
  }, [jobs, mechanicId, activeJob]);

  useEffect(() => {
    if (!activeJob || jobPhase === 'complete') return;
    void pushTechGpsToBooking(activeJob.referenceCode);
    const id = setInterval(() => void pushTechGpsToBooking(activeJob.referenceCode), 45_000);
    return () => clearInterval(id);
  }, [activeJob, jobPhase]);

  const handleClock = async () => {
    setShiftBusy(true);
    setMessage(null);
    try {
      if (shift.onShift) {
        await clockOut();
        setMessage('Clocked out. You will not see new jobs until you clock back in.');
      } else {
        await clockIn();
        setMessage('Clocked in — you can claim jobs now.');
      }
      await loadShift();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Could not update your shift');
    } finally {
      setShiftBusy(false);
    }
  };

  const today = todayISODate();
  const available = jobs.filter((j) => isUnclaimed(j) && !isFinished(j));
  const todayJobs = jobs.filter((j) => {
    if (isFinished(j)) return false;
    const mine = Boolean(mechanicId && j.mechanicId === mechanicId);
    if (!mine && !isUnclaimed(j)) return false; // another tech's job
    return isTodaysJob(j, today);
  });
  const completedJobs = jobs.filter(
    (j) => j.status === 'COMPLETED' && (!mechanicId || j.mechanicId === mechanicId)
  );

  const textCustomerOnTheWay = async (job: DispatchBooking) => {
    const result = await sendOnTheWaySmsAuto({
      phone: job.phone,
      customerName: job.customer,
      referenceCode: job.referenceCode,
      etaMinutes: job.etaMinutes || 20,
    });
    if (!result.sent) setMessage('This booking has no customer phone on file.');
  };

  const handleClaim = async (job: DispatchBooking) => {
    let mechId = mechanicId;
    if (!mechId) {
      const { data } = await supabase.auth.getSession();
      mechId = data.session?.user?.id ?? null;
      if (mechId) setMechanicId(mechId);
    }
    if (!mechId) {
      Alert.alert('Sign in required', 'Please log in again to claim this job.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await claimBookingRow(job.referenceCode, mechId);
      const claimed: DispatchBooking = {
        ...job,
        status: 'EN_ROUTE',
        etaMinutes: job.etaMinutes || 20,
        mechanicId: mechId,
      };
      setActiveJob(claimed);
      setFilter('active');
      setJobPhase('en_route');
      void cacheOfflineJobPacket(claimed).then(() => listOfflineJobPackets().then(setOfflinePackets));
      await loadJobs();
      void notifyCustomerPush({
        bookingReference: job.referenceCode,
        title: 'Technician on the way',
        body: `Your Adaptivity tech claimed job ${job.referenceCode}.`,
      });
      setMessage('Job claimed! Tap “Text customer — on the way” or start navigation.');
    } catch (e: unknown) {
      setMessage(`Unable to claim job: ${e instanceof Error ? e.message : 'Claim failed'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleArrived = async () => {
    if (!activeJob) return;
    try {
      await updateBookingRow(activeJob.referenceCode, { status: 'ON_SITE', distance_miles: 0, eta_minutes: 0 });
      setJobPhase('on_site');
      setActiveJob({ ...activeJob, status: 'ON_SITE' });
      await loadJobs();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Could not mark arrived');
    }
  };

  const handleAddJobPhoto = async () => {
    if (!activeJob) return;
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!lib.granted) {
          Alert.alert('Permission needed', 'Allow camera or photo library to add job photos.');
          return;
        }
      }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      await uploadJobPhotoUri({
        bookingId: activeJob.id,
        uri: asset.uri,
        mimeType: asset.mimeType || 'image/jpeg',
        fileName: asset.fileName || undefined,
        kind: 'dvi',
      });
      setMessage('Job photo uploaded.');
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Photo upload failed');
    }
  };

  const quotedDollars = (activeJob?.holdAmountCents ?? DIAGNOSTIC_FEE_DOLLARS * 100) / 100;

  const finishJob = () => {
    setBusy(false);
    setTimeout(() => {
      setActiveJob(null);
      setFilter('completed');
      setJobPhase('en_route');
      void loadJobs();
    }, 1500);
  };

  // Closed from the Get paid screen (card or in person).
  const handlePaid = () => {
    setJobPhase('complete');
    void loadJobs();
  };

  const handleNoShow = () => {
    if (!activeJob) return;
    Alert.alert('Customer no-show?', 'Close the job with nothing collected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close — no charge',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setMessage(null);
          try {
            const noShow = computeCloseOut({
              kind: 'no_show',
              lines: [],
              diagnosticCents: 0,
              travelCents: 0,
              taxMode: 'none',
              partsBy: 'tech',
            });
            await recordJobPayment(activeJob.id, noShow, { taxMode: 'none', partsBy: 'tech' });
            setJobPhase('complete');
            setMessage('No-show recorded — job closed, nothing collected.');
            finishJob();
          } catch (e: unknown) {
            setMessage(e instanceof Error ? e.message : 'Could not close the job');
            setBusy(false);
          }
        },
      },
    ]);
  };

  const handleRelease = () => {
    if (!activeJob) return;
    Alert.alert('Cancel this job?', 'It will be released back to the open pool.', [
      { text: 'Keep job', style: 'cancel' },
      {
        text: 'Release job',
        style: 'destructive',
        onPress: async () => {
          try {
            await releaseJob(activeJob.referenceCode);
            setActiveJob(null);
            setFilter('available');
            await loadJobs();
          } catch (e: unknown) {
            setMessage(e instanceof Error ? e.message : 'Cancel failed');
          }
        },
      },
    ]);
  };

  const handleSubmitExpense = async (booking: DispatchBooking) => {
    setExpenseBusy(true);
    try {
      await submitPartsExpenseClaim({
        bookingId: booking.id,
        amountDollars: Number(expenseAmount),
        description: expenseDesc,
        receiptPath: null,
      });
      setExpenseAmount('');
      setExpenseDesc('');
      Alert.alert('Submitted', 'Parts reimbursement claim sent for review.');
      await loadClaims();
    } catch (e: unknown) {
      Alert.alert('Claim failed', e instanceof Error ? e.message : 'Could not submit claim');
    } finally {
      setExpenseBusy(false);
    }
  };

  const renderContactRow = (job: DispatchBooking, smsBody: string) => (
    <View style={styles.actionRow}>
      <ContactButton label="Call" Icon={PhoneIcon} disabled={!job.phone} onPress={() => callCustomer(job.phone)} />
      <ContactButton label="Text" Icon={MessageIcon} disabled={!job.phone} onPress={() => textCustomer(job.phone, smsBody)} />
      <ContactButton label="Navigate" Icon={NavigateIcon} onPress={() => openNavigate(job.address)} />
    </View>
  );

  const renderJobCard = (job: DispatchBooking) => {
    const match = specialtyMatchHint(mySpecialties, job.services);
    const due = (job.holdAmountCents ?? DIAGNOSTIC_FEE_DOLLARS * 100) / 100;
    return (
      <View key={job.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.customerName}>{job.customer}</Text>
            {!!job.phone && <Text style={styles.phone}>{job.phone}</Text>}
          </View>
          <Text style={styles.dueBadge}>${due.toFixed(0)} due on site</Text>
        </View>
        <Text style={styles.refCode}>#{job.referenceCode}</Text>
        <Text style={styles.vehicleText}>{job.vehicle}</Text>
        {!!job.preferredDate && (
          <Text style={styles.muted}>
            Preferred: {job.preferredDate}
            {job.preferredTimeWindow ? ` · ${job.preferredTimeWindow}` : ''}
          </Text>
        )}
        <Text style={styles.fieldLabel}>Customer address</Text>
        <Text style={styles.addressText}>{job.address}</Text>
        <Text style={styles.muted}>{job.services.join(' · ')}</Text>
        {!!job.customerNotes && <Text style={styles.notes}>“{job.customerNotes}”</Text>}
        {match.chips.length > 0 && (
          <View style={styles.chipRow}>
            {match.chips.map((c) => (
              <Text key={c} style={styles.chip}>
                {c}
              </Text>
            ))}
          </View>
        )}
        {!!match.hint && <Text style={styles.matchHint}>{match.hint}</Text>}
        {renderContactRow(
          job,
          `Hi ${job.customer || 'there'}, this is your Adaptivity technician regarding your service request.`
        )}
        {isUnclaimed(job) ? (
          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.dim]}
            disabled={busy}
            onPress={() => void handleClaim(job)}
          >
            <Text style={styles.btnText}>{busy ? 'Claiming…' : 'Claim job →'}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.statusPill}>{job.status.replace('_', ' ')}</Text>
        )}
      </View>
    );
  };

  const renderCompletedCard = (job: DispatchBooking) => (
    <View key={job.id} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.customerName}>{job.customer}</Text>
          <Text style={styles.refCode}>#{job.referenceCode}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.doneBadge}>✓ Completed</Text>
          {job.total > 0 && <Text style={styles.totalText}>{money(job.total)}</Text>}
        </View>
      </View>
      <Text style={styles.vehicleText}>{job.vehicle}</Text>
      {!!job.preferredDate && <Text style={styles.muted}>Date: {job.preferredDate}</Text>}
      <Text style={styles.addressText}>{job.address}</Text>
      <Text style={styles.muted}>{job.services.join(' · ')}</Text>
      <Text style={styles.paidLabel}>
        {job.paymentStatus === 'paid_in_person' ? '💵 Paid in person' : 'Archived'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.brand.orange} />
      </View>
    );
  }

  const job = activeJob;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.brand.orange} />
      }
    >
      {/* Shift */}
      <View style={[styles.shiftBar, shift.onShift ? styles.shiftOn : styles.shiftOff]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.shiftTitle, { color: shift.onShift ? '#6ee7b7' : '#fcd34d' }]}>
            {shift.onShift ? 'On shift' : 'Off shift'}
          </Text>
          <Text style={styles.shiftDetail}>
            {shift.onShift
              ? `Clocked in ${shiftElapsedLabel(shift.since)} ago. Clock out when you finish for the day.`
              : 'Clock in to see and claim jobs.'}
          </Text>
        </View>
        <TouchableOpacity
          style={[shift.onShift ? styles.clockOutBtn : styles.clockInBtn, shiftBusy && styles.dim]}
          disabled={shiftBusy}
          onPress={() => void handleClock()}
        >
          <Text style={[styles.btnText, shift.onShift && { color: colors.text.secondary }]}>
            {shiftBusy ? 'Saving…' : shift.onShift ? 'Clock out' : 'Clock in'}
          </Text>
        </TouchableOpacity>
      </View>

      {!!message && (
        <TouchableOpacity onPress={() => setMessage(null)} activeOpacity={0.8}>
          <Text style={styles.message}>{message}</Text>
        </TouchableOpacity>
      )}

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {(
          [
            ['today', `Today (${todayJobs.length})`],
            ['available', `Available (${available.length})`],
            ['active', 'Active'],
            ['completed', `Completed (${completedJobs.length})`],
          ] as const
        ).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.filterTab, filter === key && styles.filterTabActive]}
            onPress={() => setFilter(key)}
          >
            <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filter === 'today' && (
        <>
          <Text style={styles.sectionLabel}>Today’s route — preferred today or in progress</Text>
          {todayJobs.length === 0 ? (
            <Text style={styles.emptyText}>No jobs scheduled for today.</Text>
          ) : (
            todayJobs.map(renderJobCard)
          )}
        </>
      )}

      {filter === 'available' &&
        (!shift.onShift ? (
          <Text style={styles.warnBox}>
            Clock in to see open jobs. Jobs cannot be claimed while you are off shift.
          </Text>
        ) : available.length === 0 ? (
          <Text style={styles.emptyText}>No open jobs right now. New bookings appear here in realtime.</Text>
        ) : (
          available.map(renderJobCard)
        ))}

      {loadError && offlinePackets.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Offline packet</Text>
          <Text style={styles.hint}>Board unreachable — showing cached active jobs.</Text>
          {offlinePackets.map((p) => (
            <View key={p.id} style={styles.offlineRow}>
              <Text style={styles.refCode}>{p.referenceCode}</Text>
              <Text style={styles.customerName}>{p.customer}</Text>
              <Text style={styles.vehicleText}>{p.vehicle}</Text>
              <Text style={styles.addressText}>{p.address}</Text>
              <Text style={styles.phone}>{p.phone}</Text>
            </View>
          ))}
        </View>
      )}

      {filter === 'active' && job && (
        <View style={[styles.card, styles.activeCard]}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.customerName, { fontSize: 18 }]}>{job.customer}</Text>
              <Text style={job.phone ? styles.phoneAccent : styles.muted}>{job.phone || 'No phone on file'}</Text>
            </View>
            <Text style={styles.dueBadge}>{money(quotedDollars)} due on site</Text>
          </View>
          <Text style={styles.refCode}>#{job.referenceCode}</Text>
          <Text style={styles.fieldLabel}>Customer address</Text>
          <Text style={styles.addressText}>{job.address}</Text>
          <Text style={styles.muted}>{job.services.join(' · ')}</Text>
          {!!job.customerNotes && <Text style={styles.notes}>“{job.customerNotes}”</Text>}
          <Text style={styles.amberHint}>
            {money(quotedDollars)} diagnostic due on site — you set labor + parts after diagnosis.
          </Text>

          {renderContactRow(
            job,
            `Hi ${job.customer || 'there'}, this is your Adaptivity Performance technician. I am on my way to your location!`
          )}

          {jobPhase === 'en_route' && (
            <>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => void textCustomerOnTheWay(job)}>
                <Text style={styles.btnText}>Text customer — on the way</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => void handleArrived()}>
                <Text style={styles.btnText}>Mark arrived on-site</Text>
              </TouchableOpacity>
            </>
          )}

          {jobPhase !== 'complete' && (
            <TouchableOpacity style={styles.ghostBtn} onPress={() => void handleAddJobPhoto()}>
              <Text style={styles.ghostText}>📷 Add job photo</Text>
            </TouchableOpacity>
          )}

          {jobPhase === 'on_site' && (
            <View style={styles.invoice}>
              <Text style={styles.invoiceTitle}>Get paid</Text>
              <Text style={styles.muted}>
                Show the customer the itemized receipt, have them sign, then take the card with Tap to Pay — or
                record cash / Square app.
              </Text>
              <TouchableOpacity style={styles.completeBtn} disabled={busy} onPress={() => setPayOpen(true)}>
                <Text style={styles.btnText}>💳 Get paid</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.noShowBtn, busy && styles.dim]} disabled={busy} onPress={handleNoShow}>
                <Text style={[styles.btnText, { color: '#fde68a' }]}>Customer no-show (no charge)</Text>
              </TouchableOpacity>
            </View>
          )}

          {(jobPhase === 'on_site' || jobPhase === 'complete') && (
            <View style={styles.box}>
              <Text style={styles.boxTitle}>Parts reimbursement</Text>
              <TextInput
                style={styles.input}
                placeholder="Amount $"
                placeholderTextColor={colors.text.muted}
                keyboardType="decimal-pad"
                value={expenseAmount}
                onChangeText={setExpenseAmount}
              />
              <TextInput
                style={styles.input}
                placeholder="Description (e.g. brake pads)"
                placeholderTextColor={colors.text.muted}
                value={expenseDesc}
                onChangeText={setExpenseDesc}
              />
              <TouchableOpacity
                style={[styles.secondaryBtn, expenseBusy && styles.dim]}
                disabled={expenseBusy}
                onPress={() => void handleSubmitExpense(job)}
              >
                <Text style={styles.btnText}>{expenseBusy ? 'Submitting…' : 'Submit parts claim'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {jobPhase === 'complete' && <Text style={styles.doneText}>Job complete ✓</Text>}

          <GetPaidScreen
            key={job.id}
            job={job}
            visible={payOpen}
            onClose={() => {
              setPayOpen(false);
              if (jobPhase === 'complete') finishJob();
            }}
            onClosed={handlePaid}
          />

          {jobPhase !== 'complete' && (
            <TouchableOpacity style={styles.cancelBtn} onPress={handleRelease}>
              <Text style={styles.cancelText}>Cancel job</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {filter === 'active' && !job && (
        <Text style={styles.emptyText}>Claim a job from Available to start dispatch.</Text>
      )}

      {filter === 'completed' && (
        <>
          <Text style={styles.sectionLabel}>Completed & invoiced jobs ({completedJobs.length})</Text>
          {completedJobs.length === 0 ? (
            <Text style={styles.emptyText}>
              No completed jobs yet. Jobs you complete will appear here for reference.
            </Text>
          ) : (
            completedJobs.map(renderCompletedCard)
          )}
        </>
      )}

      {claims.length > 0 && (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={styles.sectionLabel}>My parts claims</Text>
          {claims.slice(0, 8).map((c) => (
            <View key={c.id} style={styles.claimRow}>
              <Text style={styles.claimText}>
                {money(c.amountCents / 100)} · {c.description}
              </Text>
              <Text style={styles.claimStatus}>{c.status}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const btnBase = {
  paddingHorizontal: spacing.md,
  paddingVertical: 11,
  borderRadius: borderRadius.md,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  marginTop: spacing.sm,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: spacing.md, paddingBottom: spacing['3xl'] },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  dim: { opacity: 0.5 },

  shiftBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  shiftOn: { borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.1)' },
  shiftOff: { borderColor: 'rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.1)' },
  shiftTitle: { fontSize: 13, fontWeight: '800' },
  shiftDetail: { color: colors.text.secondary, fontSize: 11, lineHeight: 16, marginTop: 2 },
  clockInBtn: { backgroundColor: colors.status.success, borderRadius: borderRadius.md, paddingHorizontal: 16, paddingVertical: 11 },
  clockOutBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: borderRadius.md,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },

  message: {
    color: '#fcd34d',
    fontSize: 12,
    lineHeight: 17,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  warnBox: {
    color: '#fcd34d',
    fontSize: 12,
    lineHeight: 17,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: borderRadius.sm,
    padding: spacing.md,
  },

  filterRow: { gap: spacing.sm, marginBottom: spacing.md, paddingRight: spacing.md },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  filterTabActive: { borderColor: colors.brand.orange, backgroundColor: colors.brand.orange },
  filterText: { color: colors.text.muted, fontWeight: '800', fontSize: 11, textTransform: 'uppercase' },
  filterTextActive: { color: '#fff' },
  sectionLabel: {
    color: colors.text.secondary,
    fontWeight: '800',
    fontSize: 11,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  emptyText: { color: colors.text.muted, textAlign: 'center', marginTop: spacing.lg, lineHeight: 20, fontSize: 13 },

  card: {
    backgroundColor: colors.bg.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  activeCard: { borderColor: 'rgba(249,115,22,0.35)' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: 4 },
  customerName: { color: colors.text.primary, fontWeight: '800', fontSize: 15 },
  phone: { color: colors.text.muted, fontSize: 12, marginTop: 2 },
  phoneAccent: { color: colors.brand.orange, fontSize: 12, fontWeight: '700', marginTop: 2 },
  dueBadge: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  refCode: { color: colors.brand.orange, fontWeight: '800', fontSize: 11, marginBottom: 4 },
  vehicleText: { color: colors.text.secondary, fontSize: 13, marginBottom: 2 },
  fieldLabel: { color: colors.text.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginTop: 6 },
  addressText: { color: colors.text.primary, fontSize: 12, marginBottom: 2 },
  muted: { color: colors.text.muted, fontSize: 11, lineHeight: 16 },
  notes: { color: colors.text.secondary, fontSize: 11, fontStyle: 'italic', marginTop: 4 },
  amberHint: { color: 'rgba(251,191,36,0.9)', fontSize: 11, marginTop: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: {
    color: '#fdba74',
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: 'rgba(249,115,22,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  matchHint: { color: '#86efac', fontSize: 11, fontWeight: '600', marginTop: 4 },
  statusPill: { color: colors.brand.orange, fontSize: 10, fontWeight: '800', marginTop: spacing.sm, textTransform: 'uppercase' },
  doneBadge: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '900',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  totalText: { color: colors.text.primary, fontWeight: '900', fontFamily: 'monospace', fontSize: 13, marginTop: 4 },
  paidLabel: { color: 'rgba(52,211,153,0.9)', fontSize: 10, fontWeight: '800', marginTop: spacing.sm, textTransform: 'uppercase' },

  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  contactBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.orange,
    backgroundColor: 'rgba(249,115,22,0.1)',
  },
  contactText: { color: colors.text.primary, fontWeight: '800', fontSize: 12 },
  primaryBtn: { ...btnBase, backgroundColor: colors.brand.orange },
  secondaryBtn: { ...btnBase, backgroundColor: 'rgba(255,255,255,0.1)' },
  completeBtn: { ...btnBase, backgroundColor: '#059669', paddingVertical: 14 },
  noShowBtn: {
    ...btnBase,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  ghostBtn: { ...btnBase, borderWidth: 1, borderColor: colors.border.primary, backgroundColor: 'rgba(255,255,255,0.04)' },
  ghostText: { color: colors.text.secondary, fontWeight: '700', fontSize: 12 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  cancelBtn: {
    ...btnBase,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.4)',
  },
  cancelText: { color: '#fda4af', fontWeight: '700', fontSize: 12 },
  doneText: { color: '#34d399', fontSize: 12, marginTop: spacing.sm, textAlign: 'center' },

  box: {
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  boxTitle: { color: colors.text.secondary, fontWeight: '800', fontSize: 11, textTransform: 'uppercase' },
  hint: { color: '#7dd3fc', fontSize: 12, lineHeight: 17 },
  small: { color: colors.text.muted, fontSize: 10, lineHeight: 14 },
  input: {
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: colors.text.primary,
    fontSize: 13,
  },

  invoice: {
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.3)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    backgroundColor: colors.bg.secondary,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  invoiceTitle: { color: colors.text.primary, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },

  offlineRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border.primary },
  claimRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  claimText: { color: colors.text.secondary, fontSize: 12, flex: 1 },
  claimStatus: { color: colors.text.muted, fontSize: 11, fontWeight: '700' },
});

const ContactButton: React.FC<{
  label: string;
  Icon: React.FC<{ size?: number; color: string }>;
  onPress: () => void;
  disabled?: boolean;
}> = ({ label, Icon, onPress, disabled }) => (
  <TouchableOpacity
    style={[styles.contactBtn, disabled && styles.dim]}
    disabled={disabled}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
  >
    <Icon color={colors.brand.orange} />
    <Text style={styles.contactText}>{label}</Text>
  </TouchableOpacity>
);
