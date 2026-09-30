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
  recordInPersonPayment,
  releaseJob,
  subscribeDispatchBookings,
  supabase,
  updateBookingRow,
  type DispatchBooking,
  type QuoteLineInput,
} from '../lib/supabase';
import { pushTechGpsToBooking } from '../lib/locationDispatch';
import { sendOnTheWaySmsAuto, sendChargeReceiptSmsAuto, notifyCustomerPush } from '../lib/sendSms';
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
import { fetchJobMessages, sendJobMessage, subscribeJobMessages, type JobMessage } from '../lib/jobChat';
import { clockIn, clockOut, fetchMyShiftStatus, shiftElapsedLabel, type ShiftStatus } from '../lib/techShifts';
import {
  DIAGNOSTIC_FEE_DOLLARS,
  SALES_TAX_RATE,
  TECH_LABOR_SHARE,
  TRAVEL_FEE_DOLLARS,
} from '../lib/pricing';

type LineDraft = { title: string; laborDollars: string; partsDollars: string };
type JobPhase = 'en_route' | 'on_site' | 'complete';
type JobsFilter = 'today' | 'available' | 'active' | 'completed';
type TaxMode = 'parts' | 'total' | 'none';

const EMPTY_LINE: LineDraft = { title: '', laborDollars: '', partsDollars: '' };

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
  const [techNotes, setTechNotes] = useState('');
  const [customerAgreed, setCustomerAgreed] = useState(false);
  const [lines, setLines] = useState<LineDraft[]>([EMPTY_LINE]);
  const [includeDiagnosticFee, setIncludeDiagnosticFee] = useState(false);
  const [mileageFee, setMileageFee] = useState('');
  const [taxMode, setTaxMode] = useState<TaxMode>('parts');
  const [partsPurchasedBy, setPartsPurchasedBy] = useState<'tech' | 'company'>('tech');
  const [shift, setShift] = useState<ShiftStatus>({ onShift: false, since: null });
  const [shiftBusy, setShiftBusy] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseBusy, setExpenseBusy] = useState(false);
  const [claims, setClaims] = useState<PartsExpenseClaim[]>([]);
  const [offlinePackets, setOfflinePackets] = useState<OfflineJobPacket[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [chatMessages, setChatMessages] = useState<JobMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

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

  // Every mobile visit carries the flat travel fee the customer saw at booking.
  const activeJobId = activeJob?.id;
  const activeJobLocation = activeJob?.locationType;
  useEffect(() => {
    setMileageFee(activeJobId && activeJobLocation !== 'shop' ? String(TRAVEL_FEE_DOLLARS) : '');
  }, [activeJobId, activeJobLocation]);

  useEffect(() => {
    if (!activeJob || jobPhase === 'complete') return;
    void pushTechGpsToBooking(activeJob.referenceCode);
    const id = setInterval(() => void pushTechGpsToBooking(activeJob.referenceCode), 45_000);
    return () => clearInterval(id);
  }, [activeJob, jobPhase]);

  useEffect(() => {
    if (!activeJob?.id || jobPhase === 'complete') {
      setChatMessages([]);
      return;
    }
    const loadChat = async () => {
      try {
        setChatMessages(await fetchJobMessages(activeJob.id));
      } catch {
        /* chat table may be missing */
      }
    };
    void loadChat();
    const channel = subscribeJobMessages(activeJob.id, () => void loadChat());
    return () => {
      void channel.unsubscribe();
    };
  }, [activeJob?.id, jobPhase]);

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

  const handleSendChat = async () => {
    if (!activeJob?.id || !chatDraft.trim()) return;
    setChatBusy(true);
    try {
      await sendJobMessage(activeJob.id, chatDraft);
      setChatDraft('');
      setChatMessages(await fetchJobMessages(activeJob.id));
    } catch (e: unknown) {
      Alert.alert('Chat', e instanceof Error ? e.message : 'Could not send');
    } finally {
      setChatBusy(false);
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

  const resetInvoice = () => {
    setLines([EMPTY_LINE]);
    setTechNotes('');
    setCustomerAgreed(false);
    setIncludeDiagnosticFee(false);
    setTaxMode('parts');
    setPartsPurchasedBy('tech');
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
      resetInvoice();
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

  // ── Invoice math (same as the web portal) ──
  const laborSubtotal = lines.reduce((s, l) => s + (Number(l.laborDollars) || 0), 0);
  const partsSubtotal = lines.reduce((s, l) => s + (Number(l.partsDollars) || 0), 0);
  const mileageTotal = Number(mileageFee) || 0;
  const quotedDollars = (activeJob?.holdAmountCents ?? DIAGNOSTIC_FEE_DOLLARS * 100) / 100;
  const appliedDiagnosticDollars = includeDiagnosticFee ? quotedDollars : 0;
  const subtotalBeforeTax = appliedDiagnosticDollars + laborSubtotal + partsSubtotal + mileageTotal;
  const taxableBase = taxMode === 'parts' ? partsSubtotal : taxMode === 'total' ? subtotalBeforeTax : 0;
  const salesTaxDollars = Math.round(taxableBase * SALES_TAX_RATE * 100) / 100;
  const chargeTotal = subtotalBeforeTax + salesTaxDollars;
  const techLaborShare =
    Math.round((appliedDiagnosticDollars + laborSubtotal + mileageTotal) * TECH_LABOR_SHARE * 100) / 100;
  const techPartsShare = partsPurchasedBy === 'tech' ? partsSubtotal : 0;
  const techPayout = techLaborShare + techPartsShare;

  const finishJob = () => {
    setBusy(false);
    setTimeout(() => {
      setActiveJob(null);
      setFilter('available');
      setJobPhase('en_route');
      resetInvoice();
      void loadJobs();
    }, 2500);
  };

  const handleCollected = async () => {
    if (!activeJob) return;
    if (!customerAgreed) {
      setMessage('⚠️ Check the box confirming the customer agreed to the on-site price.');
      return;
    }
    const lineItems: QuoteLineInput[] = lines
      .map((l) => {
        const labor = Number(l.laborDollars) || 0;
        const parts = Number(l.partsDollars) || 0;
        let title = l.title.trim();
        if (!title && (labor > 0 || parts > 0)) {
          title = labor > 0 && parts > 0 ? 'Mechanical Labor & Parts' : labor > 0 ? 'Mechanical Labor' : 'Replacement Parts';
        }
        return { title, laborDollars: labor, partsDollars: parts };
      })
      .filter((l) => l.title && (l.laborDollars > 0 || (l.partsDollars ?? 0) > 0));

    if (!lineItems.length && !includeDiagnosticFee) {
      setMessage(
        `⚠️ Enter a labor or parts amount (or add the $${quotedDollars.toFixed(0)} diagnostic fee) before closing.`
      );
      return;
    }
    if (includeDiagnosticFee) {
      lineItems.unshift({ title: 'Mobile Diagnostic', laborDollars: appliedDiagnosticDollars, partsDollars: 0 });
    }
    if (mileageTotal > 0) {
      lineItems.push({ title: 'Mileage / Travel Fee', laborDollars: mileageTotal, partsDollars: 0 });
    }

    setBusy(true);
    setMessage(null);
    try {
      const result = await recordInPersonPayment(activeJob.referenceCode, { lineItems, salesTaxDollars });
      setJobPhase('complete');
      setMessage(`${money(result.collectedDollars)} recorded as collected in person — job closed.`);
      await sendChargeReceiptSmsAuto({
        phone: activeJob.phone || '',
        customerName: activeJob.customer,
        referenceCode: activeJob.referenceCode,
        amountDollars: result.collectedDollars,
        kind: 'charge',
        lines: lineItems.filter((l) => l.title !== 'Mobile Diagnostic'),
        diagnosticDollars: appliedDiagnosticDollars,
        salesTaxDollars,
      });
      finishJob();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Could not record the payment');
      setBusy(false);
    }
  };

  const handleDiagnosticOnly = () => {
    if (!activeJob) return;
    Alert.alert(
      'Diagnostic only?',
      `Record ${money(quotedDollars)} diagnostic collected in person and close the job?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Record ${money(quotedDollars)}`,
          onPress: async () => {
            setBusy(true);
            setMessage(null);
            try {
              const result = await recordInPersonPayment(activeJob.referenceCode, {
                totalCollectedDollars: quotedDollars,
              });
              setJobPhase('complete');
              setMessage(`Diagnostic ${money(result.collectedDollars)} recorded as collected in person.`);
              await sendChargeReceiptSmsAuto({
                phone: activeJob.phone || '',
                customerName: activeJob.customer,
                referenceCode: activeJob.referenceCode,
                amountDollars: result.collectedDollars,
                kind: 'diagnostic_only',
              });
              finishJob();
            } catch (e: unknown) {
              setMessage(e instanceof Error ? e.message : 'Could not record the diagnostic');
              setBusy(false);
            }
          },
        },
      ]
    );
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
            await recordInPersonPayment(activeJob.referenceCode, { totalCollectedDollars: 0 });
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

  const setLine = (idx: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const renderContactRow = (job: DispatchBooking, smsBody: string) => (
    <View style={styles.actionRow}>
      <TouchableOpacity
        style={[styles.actionBtn, styles.callBtn, !job.phone && styles.dim]}
        disabled={!job.phone}
        onPress={() => callCustomer(job.phone)}
      >
        <Text style={styles.btnText}>📞 Call</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.actionBtn, styles.textBtn, !job.phone && styles.dim]}
        disabled={!job.phone}
        onPress={() => textCustomer(job.phone, smsBody)}
      >
        <Text style={styles.btnText}>💬 Text</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.actionBtn, styles.navBtn]} onPress={() => openNavigate(job.address)}>
        <Text style={styles.btnText}>🧭 Navigate</Text>
      </TouchableOpacity>
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

  const toggle = (on: boolean, onStyle: object) => [styles.toggle, on && onStyle];

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

          {jobPhase !== 'complete' && !!job.id && (
            <View style={styles.box}>
              <Text style={styles.boxTitle}>Customer chat</Text>
              {chatMessages.length === 0 ? (
                <Text style={styles.hint}>No messages yet — ask about gate codes or parking.</Text>
              ) : (
                chatMessages.map((m) => {
                  const mine = mechanicId && m.senderId === mechanicId;
                  return (
                    <View key={m.id} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                      <Text style={styles.bubbleBody}>{m.body}</Text>
                      <Text style={styles.bubbleTime}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </Text>
                    </View>
                  );
                })
              )}
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Message…"
                  placeholderTextColor={colors.text.muted}
                  value={chatDraft}
                  onChangeText={setChatDraft}
                  maxLength={2000}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, (chatBusy || !chatDraft.trim()) && styles.dim]}
                  disabled={chatBusy || !chatDraft.trim()}
                  onPress={() => void handleSendChat()}
                >
                  <Text style={styles.btnText}>Send</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {jobPhase === 'on_site' && (
            <View style={styles.invoice}>
              <View style={styles.invoiceHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.invoiceTitle}>On-site invoice</Text>
                  <Text style={styles.muted}>Collect on Square, then record it here to close the job.</Text>
                </View>
                <Text style={styles.totalBadge}>{money(chargeTotal)}</Text>
              </View>

              {/* 1. Diagnostic fee */}
              <View style={styles.box}>
                <View style={styles.spread}>
                  <Text style={styles.boxLabel}>🔍 Mobile diagnostic ({money(quotedDollars)} on file)</Text>
                  <Text style={styles.mono}>{includeDiagnosticFee ? money(quotedDollars) : 'WAIVED'}</Text>
                </View>
                <View style={styles.row}>
                  <TouchableOpacity
                    style={toggle(!includeDiagnosticFee, styles.toggleGreen)}
                    onPress={() => setIncludeDiagnosticFee(false)}
                  >
                    <Text style={styles.toggleText}>✓ Waive diag fee</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={toggle(includeDiagnosticFee, styles.toggleOrange)}
                    onPress={() => setIncludeDiagnosticFee(true)}
                  >
                    <Text style={styles.toggleText}>+ Charge ${quotedDollars.toFixed(0)} diag</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.small}>
                  {!includeDiagnosticFee
                    ? `Free diagnostic with repair — the ${money(quotedDollars)} diagnostic is credited toward the repair.`
                    : `The ${money(quotedDollars)} diagnostic visit fee is charged on top of labor & parts.`}
                </Text>
              </View>

              {/* 2. Repair lines */}
              <View style={styles.spread}>
                <Text style={styles.boxTitle}>Repair lines (labor & parts)</Text>
                <TouchableOpacity onPress={() => setLines((p) => [...p, EMPTY_LINE])}>
                  <Text style={styles.addLine}>+ Add line</Text>
                </TouchableOpacity>
              </View>
              {lines.map((line, idx) => (
                <View key={idx} style={styles.lineBlock}>
                  <TextInput
                    style={styles.input}
                    placeholder="Line title (e.g. Front Brake Pads & Rotors)"
                    placeholderTextColor={colors.text.muted}
                    value={line.title}
                    onChangeText={(t) => setLine(idx, { title: t })}
                  />
                  <View style={styles.row}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Labor $"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="decimal-pad"
                      value={line.laborDollars}
                      onChangeText={(t) => setLine(idx, { laborDollars: t })}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Parts $"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="decimal-pad"
                      value={line.partsDollars}
                      onChangeText={(t) => setLine(idx, { partsDollars: t })}
                    />
                  </View>
                  {lines.length > 1 && (
                    <TouchableOpacity onPress={() => setLines((p) => p.filter((_, i) => i !== idx))}>
                      <Text style={styles.removeLine}>Remove line</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {/* 3. Travel fee */}
              <Text style={styles.boxTitle}>Travel fee — flat on mobile visits</Text>
              <Text style={styles.small}>
                Filled in from what the customer saw when booking. Clear it for members — their membership covers
                travel.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={colors.text.muted}
                keyboardType="decimal-pad"
                value={mileageFee}
                onChangeText={setMileageFee}
              />

              {/* 4. Sales tax */}
              <View style={styles.box}>
                <View style={styles.spread}>
                  <Text style={styles.boxLabel}>🏛️ Texas sales tax (8.25%)</Text>
                  <Text style={[styles.mono, { color: '#fcd34d' }]}>+{money(salesTaxDollars)}</Text>
                </View>
                <View style={styles.row}>
                  {(
                    [
                      ['parts', 'Parts'],
                      ['total', 'Total'],
                      ['none', 'Exempt'],
                    ] as const
                  ).map(([mode, label]) => (
                    <TouchableOpacity
                      key={mode}
                      style={toggle(taxMode === mode, styles.toggleOrange)}
                      onPress={() => setTaxMode(mode)}
                    >
                      <Text style={styles.toggleText}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 5. Who bought the parts */}
              {partsSubtotal > 0 && (
                <View style={styles.box}>
                  <View style={styles.spread}>
                    <Text style={styles.boxLabel}>📦 Parts out-of-pocket</Text>
                    <Text style={[styles.small, { color: colors.brand.orange }]}>
                      {partsPurchasedBy === 'tech' ? '100% reimbursed to you' : 'Company supplied'}
                    </Text>
                  </View>
                  <View style={styles.row}>
                    <TouchableOpacity
                      style={toggle(partsPurchasedBy === 'tech', styles.toggleGreen)}
                      onPress={() => setPartsPurchasedBy('tech')}
                    >
                      <Text style={styles.toggleText}>I bought parts</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={toggle(partsPurchasedBy === 'company', styles.toggleOrange)}
                      onPress={() => setPartsPurchasedBy('company')}
                    >
                      <Text style={styles.toggleText}>Company paid</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <TextInput
                style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                placeholder="Tech invoice notes (optional)"
                placeholderTextColor={colors.text.muted}
                multiline
                value={techNotes}
                onChangeText={setTechNotes}
              />

              {/* Summary */}
              <View style={styles.summary}>
                <Text style={styles.summaryTitle}>Itemized summary</Text>
                <SummaryRow label="Diagnostic fee" value={includeDiagnosticFee ? money(quotedDollars) : 'WAIVED'} />
                {laborSubtotal > 0 && <SummaryRow label="Labor subtotal" value={money(laborSubtotal)} />}
                {partsSubtotal > 0 && (
                  <SummaryRow
                    label={`Parts subtotal (${partsPurchasedBy === 'tech' ? '100% to tech' : 'company paid'})`}
                    value={money(partsSubtotal)}
                  />
                )}
                {mileageTotal > 0 && <SummaryRow label="Mileage / travel" value={money(mileageTotal)} />}
                {salesTaxDollars > 0 && <SummaryRow label="Texas sales tax (8.25%)" value={`+${money(salesTaxDollars)}`} />}
                <View style={[styles.spread, styles.summaryTotal]}>
                  <Text style={styles.summaryTotalLabel}>Customer total</Text>
                  <Text style={[styles.summaryTotalLabel, { color: '#34d399' }]}>{money(chargeTotal)}</Text>
                </View>
                <View style={styles.spread}>
                  <Text style={styles.payoutLabel}>👨‍🔧 Your payout</Text>
                  <Text style={styles.payoutLabel}>{money(techPayout)} (+ tips)</Text>
                </View>
                {partsSubtotal > 0 && (
                  <Text style={[styles.small, { textAlign: 'right' }]}>
                    ({money(techLaborShare)} labor 70% + {money(techPartsShare)} parts{' '}
                    {partsPurchasedBy === 'tech' ? '100%' : '0%'})
                  </Text>
                )}
              </View>

              <TouchableOpacity style={styles.agreeRow} onPress={() => setCustomerAgreed((v) => !v)} activeOpacity={0.8}>
                <Text style={styles.agreeBox}>{customerAgreed ? '☑' : '☐'}</Text>
                <Text style={styles.agreeText}>
                  Customer agreed on site to {money(chargeTotal)} and paid it on Square
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.completeBtn, (busy || !customerAgreed) && styles.dim]}
                disabled={busy || !customerAgreed}
                onPress={() => void handleCollected()}
              >
                <Text style={styles.btnText}>{busy ? 'Recording…' : `Collected ${money(chargeTotal)} — close job`}</Text>
              </TouchableOpacity>
              <View style={styles.row}>
                <TouchableOpacity
                  style={[styles.secondaryBtn, { flex: 1 }, busy && styles.dim]}
                  disabled={busy}
                  onPress={handleDiagnosticOnly}
                >
                  <Text style={styles.btnText}>Diag only (${quotedDollars.toFixed(0)})</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.noShowBtn, { flex: 1 }, busy && styles.dim]}
                  disabled={busy}
                  onPress={handleNoShow}
                >
                  <Text style={[styles.btnText, { color: '#fde68a' }]}>No-show (no charge)</Text>
                </TouchableOpacity>
              </View>
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

          {jobPhase === 'complete' && <Text style={styles.doneText}>Job complete. Returning to board…</Text>}

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

const SummaryRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.spread}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={styles.mono}>{value}</Text>
  </View>
);

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
  actionBtn: { flex: 1, ...btnBase, marginTop: 0 },
  callBtn: { backgroundColor: '#059669' },
  textBtn: { backgroundColor: '#7c3aed' },
  navBtn: { backgroundColor: '#1d4ed8' },
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
  sendBtn: { backgroundColor: '#1d4ed8', borderRadius: borderRadius.md, paddingHorizontal: 14, paddingVertical: 10 },
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
  boxLabel: { color: colors.text.secondary, fontWeight: '700', fontSize: 12, flex: 1 },
  hint: { color: '#7dd3fc', fontSize: 12, lineHeight: 17 },
  small: { color: colors.text.muted, fontSize: 10, lineHeight: 14 },
  mono: { color: colors.text.primary, fontFamily: 'monospace', fontSize: 12, fontWeight: '700' },
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
  bubble: { borderRadius: borderRadius.sm, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '90%' },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: 'rgba(249,115,22,0.2)' },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.06)' },
  bubbleBody: { color: colors.text.secondary, fontSize: 12 },
  bubbleTime: { color: colors.text.muted, fontSize: 9, marginTop: 2 },

  invoice: {
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.3)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    backgroundColor: colors.bg.secondary,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  invoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
    paddingBottom: spacing.sm,
  },
  invoiceTitle: { color: colors.text.primary, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  totalBadge: {
    color: '#34d399',
    fontSize: 13,
    fontWeight: '900',
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  toggle: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  toggleGreen: { backgroundColor: '#059669', borderColor: '#10b981' },
  toggleOrange: { backgroundColor: colors.brand.orange, borderColor: colors.brand.orange },
  toggleText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  lineBlock: {
    gap: 6,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.bg.card,
  },
  addLine: { color: colors.brand.orange, fontWeight: '800', fontSize: 12 },
  removeLine: { color: '#fca5a5', fontSize: 11, fontWeight: '700', textAlign: 'right' },
  summary: {
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    backgroundColor: 'rgba(16,185,129,0.05)',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    gap: 6,
  },
  summaryTitle: { color: '#6ee7b7', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  summaryLabel: { color: colors.text.secondary, fontSize: 12, flex: 1 },
  summaryTotal: { borderTopWidth: 1, borderTopColor: colors.border.primary, paddingTop: 6 },
  summaryTotalLabel: { color: colors.text.primary, fontSize: 14, fontWeight: '900' },
  payoutLabel: { color: '#fdba74', fontSize: 12, fontWeight: '800' },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  agreeBox: { color: colors.brand.orange, fontSize: 18, lineHeight: 20 },
  agreeText: { flex: 1, color: colors.text.secondary, fontSize: 12, lineHeight: 18 },

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
