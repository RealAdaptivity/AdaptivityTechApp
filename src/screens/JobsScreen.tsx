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
import {
  sendOnTheWaySmsAuto,
  sendChargeReceiptSmsAuto,
  notifyCustomerPush,
} from '../lib/sendSms';
import { uploadJobPhotoUri } from '../lib/jobPhotos';
import { specialtyMatchHint, techCanClaimServices } from '../lib/jobSpecialtyMatch';
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
import {
  fetchJobMessages,
  sendJobMessage,
  subscribeJobMessages,
  type JobMessage,
} from '../lib/jobChat';

type LineDraft = { title: string; laborDollars: string; partsDollars: string };
type JobPhase = 'en_route' | 'on_site' | 'complete';
type JobsFilter = 'today' | 'available' | 'active';

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

function isTodaysJob(j: DispatchBooking, today: string): boolean {
  return j.preferredDate === today || j.status === 'EN_ROUTE' || j.status === 'ON_SITE';
}

export const JobsScreen: React.FC = () => {
  const [filter, setFilter] = useState<JobsFilter>('available');
  const [jobs, setJobs] = useState<DispatchBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<DispatchBooking | null>(null);
  const [jobPhase, setJobPhase] = useState<JobPhase>('en_route');
  const [mechanicId, setMechanicId] = useState<string | null>(null);
  const [mySpecialties, setMySpecialties] = useState<string[]>(['mechanical']);
  const [busy, setBusy] = useState(false);
  const [techNotes, setTechNotes] = useState('');
  const [customerAgreed, setCustomerAgreed] = useState(false);
  const [lines, setLines] = useState<LineDraft[]>([{ title: '', laborDollars: '', partsDollars: '' }]);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseBusy, setExpenseBusy] = useState(false);
  const [claims, setClaims] = useState<PartsExpenseClaim[]>([]);
  const [offlinePackets, setOfflinePackets] = useState<OfflineJobPacket[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [chatMessages, setChatMessages] = useState<JobMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  const loadClaims = useCallback(async () => {
    try {
      setClaims(await fetchMyPartsExpenseClaims());
    } catch {
      /* table may be missing locally */
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const rows = await fetchDispatchBookings();
      const open = rows.filter((j) => j.status !== 'COMPLETED' && j.status !== 'CANCELED');
      setJobs(open);
      setLoadError(false);
      void syncOfflineJobPackets(open).then(() =>
        listOfflineJobPackets().then(setOfflinePackets)
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load dispatch board.';
      setLoadError(true);
      void listOfflineJobPackets().then(setOfflinePackets);
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
    void loadClaims();
    const channel = subscribeDispatchBookings(() => {
      loadJobs();
    });
    return () => {
      channel.unsubscribe();
    };
  }, [loadJobs, loadClaims]);

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
    if (activeJob || !mechanicId) return;
    const assigned = jobs.find(
      (job) =>
        job.mechanicId === mechanicId &&
        (job.status === 'EN_ROUTE' || job.status === 'ON_SITE') &&
        job.paymentStatus !== 'captured'
    );
    if (!assigned) return;
    setActiveJob(assigned);
    setFilter('active');
    setJobPhase(assigned.status === 'ON_SITE' ? 'on_site' : 'en_route');
  }, [jobs, mechanicId, activeJob]);

  useEffect(() => {
    if (!activeJob || jobPhase === 'complete') return;
    void pushTechGpsToBooking(activeJob.referenceCode);
    const id = setInterval(() => {
      void pushTechGpsToBooking(activeJob.referenceCode);
    }, 45_000);
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
      channel.unsubscribe();
    };
  }, [activeJob?.id, jobPhase]);

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

  const today = todayISODate();
  const availableJobs = jobs.filter(
    (j) => j.status === 'UNASSIGNED' && techCanClaimServices(mySpecialties, j.services)
  );
  const todayJobs = jobs.filter((j) => isTodaysJob(j, today));
  const myActive = jobs.find(
    (j) =>
      j.status !== 'UNASSIGNED' &&
      j.status !== 'COMPLETED' &&
      activeJob?.referenceCode === j.referenceCode
  );

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

  const renderJobCard = (j: DispatchBooking, opts?: { showClaim?: boolean }) => {
    const match = specialtyMatchHint(mySpecialties, j.services);
    return (
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
        {j.preferredDate ? (
          <Text style={styles.scheduleText}>Preferred: {j.preferredDate}</Text>
        ) : null}
        {j.quoteStatus === 'awaiting_diagnostic' && (
          <Text style={styles.diagBadge}>$85 HOLD — tech sets price on site</Text>
        )}
        <Text style={styles.vehicleText}>{j.vehicle}</Text>
        <Text style={styles.addressText}>{j.address}</Text>
        {match.chips.length > 0 && (
          <View style={styles.chipRow}>
            {match.chips.map((c) => (
              <View key={c} style={styles.chip}>
                <Text style={styles.chipText}>{c}</Text>
              </View>
            ))}
          </View>
        )}
        {!!match.hint && <Text style={styles.matchHint}>{match.hint}</Text>}
        <View style={styles.servicesList}>
          {j.services.map((s) => (
            <Text key={s} style={styles.serviceItem}>
              • {s}
            </Text>
          ))}
        </View>
        <View style={styles.jobFooter}>
          <Text style={styles.payoutText}>Hold: $85</Text>
          <TouchableOpacity style={styles.navBtn} onPress={() => openNavigate(j.address)}>
            <Text style={styles.claimBtnText}>Navigate</Text>
          </TouchableOpacity>
        </View>
        {opts?.showClaim !== false && j.status === 'UNASSIGNED' && (
          <TouchableOpacity style={styles.claimBtn} onPress={() => void handleClaimJob(j)}>
            <Text style={styles.claimBtnText}>Claim Dispatch →</Text>
          </TouchableOpacity>
        )}
        {j.status !== 'UNASSIGNED' && (
          <Text style={styles.statusPill}>{j.status.replace('_', ' ')}</Text>
        )}
      </View>
    );
  };

  const textCustomerOnTheWay = async (jobRow: DispatchBooking) => {
    const result = await sendOnTheWaySmsAuto({
      phone: jobRow.phone,
      customerName: jobRow.customer,
      referenceCode: jobRow.referenceCode,
      etaMinutes: jobRow.etaMinutes || 20,
    });
    if (!result.sent) {
      Alert.alert(
        'No phone number',
        'This booking has no customer phone on file. Call or message them another way.'
      );
      return;
    }
    if (result.via === 'twilio') {
      Alert.alert('Sent', 'On-the-way text sent automatically.');
    }
  };

  const handleAddJobPhoto = async () => {
    if (!activeJob) return;
    try {
      // Prefer expo-image-picker when installed; fall back to note if missing at runtime
      let ImagePicker: typeof import('expo-image-picker') | null = null;
      try {
        ImagePicker = await import('expo-image-picker');
      } catch {
        Alert.alert(
          'Install expo-image-picker',
          'Run npm install in the tech app, then retry Add job photo.'
        );
        return;
      }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!lib.granted) {
          Alert.alert('Permission needed', 'Allow camera or photo library to add job photos.');
          return;
        }
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      await uploadJobPhotoUri({
        bookingId: activeJob.id,
        uri: asset.uri,
        mimeType: asset.mimeType || 'image/jpeg',
        fileName: asset.fileName || undefined,
        kind: 'dvi',
      });
      Alert.alert('Uploaded', 'Job photo saved.');
    } catch (e: unknown) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Could not upload photo');
    }
  };

  const handleClaimJob = async (job: DispatchBooking) => {
    if (!mechanicId) {
      Alert.alert('Sign in required', 'Log in with your technician account to claim jobs.');
      return;
    }
    try {
      await claimBookingRow(job.referenceCode, mechanicId);
      const claimed = { ...job, status: 'EN_ROUTE' as const, etaMinutes: job.etaMinutes || 20 };
      setActiveJob(claimed);
      setFilter('active');
      setJobPhase('en_route');
      setLines([{ title: '', laborDollars: '', partsDollars: '' }]);
      setTechNotes('');
      void cacheOfflineJobPacket(claimed).then(() =>
        listOfflineJobPackets().then(setOfflinePackets)
      );
      await loadJobs();
      void notifyCustomerPush({
        bookingReference: job.referenceCode,
        title: 'Technician on the way',
        body: `Your Adaptivity tech claimed job ${job.referenceCode}.`,
      });
      Alert.alert(
        'Job claimed',
        'We’ll try to text the customer automatically. Tap Text if you want to send again.',
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

  const holdDollars = (activeJob?.holdAmountCents ?? 8500) / 100;
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
      Alert.alert('Set a price', 'Add labor/parts lines, or use Diagnostic only / No-show.');
      return;
    }
    if (!customerAgreed) {
      Alert.alert('Confirm agreement', 'Check that the customer agreed to this on-site price before charging.');
      return;
    }

    setBusy(true);
    try {
      const result = await captureBookingPayment(activeJob.referenceCode, {
        mode: 'charge',
        lineItems,
        techNotes,
        customerAgreedOnSite: true,
      });
      setJobPhase('complete');
      const amount = result.capturedAmountDollars ?? chargeTotal;
      const sms = await sendChargeReceiptSmsAuto({
        phone: activeJob.phone || '',
        customerName: activeJob.customer,
        referenceCode: activeJob.referenceCode,
        amountDollars: amount,
        kind: 'charge',
        lines: lineItems,
        diagnosticDollars: holdDollars,
      });
      Alert.alert(
        'Charged',
        `Customer charged $${amount.toFixed(2)}. Your 70% share: $${result.techPayoutDollars?.toFixed(2) ?? '0.00'}.${
          sms.via === 'twilio' ? ' Receipt SMS sent.' : sms.via === 'device' ? ' Opened SMS for receipt.' : ''
        }`
      );
      finishJobUi();
    } catch (e: unknown) {
      Alert.alert('Charge failed', e instanceof Error ? e.message : 'Could not charge');
      setBusy(false);
    }
  };

  const handleDiagnosticOnly = async () => {
    if (!activeJob) return;
    Alert.alert('Diagnostic only?', `Charge the $${holdDollars.toFixed(2)} visit and close with no repairs.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: `Charge $${holdDollars.toFixed(0)}`,
        onPress: async () => {
          setBusy(true);
          try {
            const result = await captureBookingPayment(activeJob.referenceCode, {
              mode: 'diagnostic_only',
            });
            setJobPhase('complete');
            const amount = result.capturedAmountDollars ?? 100;
            const sms = await sendChargeReceiptSmsAuto({
              phone: activeJob.phone || '',
              customerName: activeJob.customer,
              referenceCode: activeJob.referenceCode,
              amountDollars: amount,
              kind: 'diagnostic_only',
            });
            Alert.alert(
              'Diagnostic charged',
              `$${amount.toFixed(2)} · your 70%: $${result.techPayoutDollars?.toFixed(2)}${
                sms.via === 'twilio' ? ' · Receipt SMS sent.' : ''
              }`
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

  const handleNoShow = async () => {
    if (!activeJob) return;
    Alert.alert('No-show?', `Capture the $${holdDollars.toFixed(2)} diagnostic hold and close the job.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: `Capture $${holdDollars.toFixed(0)}`,
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const result = await captureBookingPayment(activeJob.referenceCode, {
              mode: 'no_show',
            });
            setJobPhase('complete');
            const amount = result.capturedAmountDollars ?? 100;
            const sms = await sendChargeReceiptSmsAuto({
              phone: activeJob.phone || '',
              customerName: activeJob.customer,
              referenceCode: activeJob.referenceCode,
              amountDollars: amount,
              kind: 'no_show',
            });
            Alert.alert(
              'No-show charged',
              `$${amount.toFixed(2)} · your 70%: $${result.techPayoutDollars?.toFixed(2)}${
                sms.via === 'twilio' ? ' · Receipt SMS sent.' : ''
              }`
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
        {([
          ['today', `Today (${todayJobs.length})`],
          ['available', `Available (${availableJobs.length})`],
          ['active', 'My Active'],
        ] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.filterTab, filter === key && styles.filterTabActive]}
            onPress={() => setFilter(key)}
          >
            <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filter === 'today' && (
        <>
          <Text style={styles.sectionLabel}>Today’s route — preferred today or in progress</Text>
          {todayJobs.length === 0 ? (
            <Text style={styles.emptyText}>No jobs scheduled for today.</Text>
          ) : (
            todayJobs.map((j) => renderJobCard(j, { showClaim: j.status === 'UNASSIGNED' }))
          )}
        </>
      )}

      {filter === 'available' &&
        availableJobs.map((j) => renderJobCard(j, { showClaim: true }))}

      {filter === 'available' && availableJobs.length === 0 && (
        <Text style={styles.emptyText}>
          No unassigned jobs. New bookings from web & customer app appear here in realtime.
        </Text>
      )}

      {(loadError || (filter === 'available' && availableJobs.length === 0)) &&
        offlinePackets.length > 0 && (
          <View style={styles.offlineBox}>
            <Text style={styles.sectionLabel}>Offline packet</Text>
            {loadError && (
              <Text style={styles.hint}>Board unreachable — showing cached active jobs.</Text>
            )}
            {offlinePackets.map((p) => (
              <View key={p.id} style={styles.offlineRow}>
                <Text style={styles.refCode}>{p.referenceCode}</Text>
                <Text style={styles.customerName}>{p.customer}</Text>
                <Text style={styles.vehicleText}>{p.vehicle}</Text>
                <Text style={styles.addressText}>{p.address}</Text>
                <Text style={styles.customerPhone}>{p.phone}</Text>
                {p.services.map((s) => (
                  <Text key={s} style={styles.serviceItem}>
                    • {s}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}

      {filter === 'active' && job && (
        <View style={styles.jobCard}>
          <Text style={styles.activeTitle}>Active Dispatch: {job.referenceCode}</Text>
          <Text style={styles.customerName}>{job.customer}</Text>
          <Text style={styles.addressText}>{job.address}</Text>
          <TouchableOpacity style={styles.navBtn} onPress={() => openNavigate(job.address)}>
            <Text style={styles.claimBtnText}>Navigate</Text>
          </TouchableOpacity>
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

          {jobPhase !== 'complete' && (
            <TouchableOpacity style={styles.smsBtn} onPress={() => void handleAddJobPhoto()}>
              <Text style={styles.claimBtnText}>Add job photo</Text>
            </TouchableOpacity>
          )}

          {jobPhase !== 'complete' && job.id && (
            <View style={styles.chatBox}>
              <Text style={styles.quoteTitle}>Job chat</Text>
              {chatMessages.length === 0 ? (
                <Text style={styles.hint}>No messages yet — ask about gate codes or parking.</Text>
              ) : (
                chatMessages.map((m) => {
                  const mine = mechanicId && m.senderId === mechanicId;
                  return (
                    <View
                      key={m.id}
                      style={[styles.chatBubble, mine ? styles.chatBubbleMine : styles.chatBubbleTheirs]}
                    >
                      <Text style={styles.chatBody}>{m.body}</Text>
                      <Text style={styles.chatTime}>
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                  );
                })
              )}
              <View style={styles.chatRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Message…"
                  placeholderTextColor={colors.text.muted}
                  value={chatDraft}
                  onChangeText={setChatDraft}
                  maxLength={2000}
                />
                <TouchableOpacity
                  style={[styles.navBtn, { marginTop: 0 }, (chatBusy || !chatDraft.trim()) && { opacity: 0.5 }]}
                  disabled={chatBusy || !chatDraft.trim()}
                  onPress={() => void handleSendChat()}
                >
                  <Text style={styles.claimBtnText}>Send</Text>
                </TouchableOpacity>
              </View>
            </View>
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
                Fill lines above, then review the itemized charge with the customer.
              </Text>

              <View style={styles.receiptPreview}>
                <Text style={styles.receiptTitle}>Itemized charge (show customer)</Text>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Mobile diagnostic visit</Text>
                  <Text style={styles.receiptAmt}>${holdDollars.toFixed(2)}</Text>
                </View>
                {lines
                  .map((l) => {
                    const labor = Number(l.laborDollars) || 0;
                    const parts = Number(l.partsDollars) || 0;
                    const title = l.title.trim();
                    if (!title || labor + parts <= 0) return null;
                    return { title, labor, parts, total: labor + parts };
                  })
                  .filter(Boolean)
                  .map((row, i) =>
                    row ? (
                      <View key={i} style={{ marginBottom: 6 }}>
                        <View style={styles.receiptRow}>
                          <Text style={styles.receiptLabel}>{row.title}</Text>
                          <Text style={styles.receiptAmt}>${row.total.toFixed(2)}</Text>
                        </View>
                        <Text style={styles.receiptSub}>
                          Labor ${row.labor.toFixed(2)}
                          {row.parts > 0 ? ` · Parts $${row.parts.toFixed(2)}` : ''}
                        </Text>
                      </View>
                    ) : null
                  )}
                {repairsSubtotal <= 0 && (
                  <Text style={styles.receiptWarn}>
                    Add repair lines, or use Diagnostic only / No-show.
                  </Text>
                )}
                <View style={[styles.receiptRow, styles.receiptTotalRow]}>
                  <Text style={styles.receiptTotalLabel}>Total to charge</Text>
                  <Text style={styles.receiptTotalAmt}>${chargeTotal.toFixed(2)}</Text>
                </View>
                <Text style={styles.receiptSub}>
                  Includes ${holdDollars.toFixed(0)} diagnostic
                  {repairsSubtotal > 0 ? ` + $${repairsSubtotal.toFixed(2)} repairs` : ''}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.agreeRow}
                onPress={() => setCustomerAgreed((v) => !v)}
                activeOpacity={0.8}
              >
                <Text style={styles.agreeBox}>{customerAgreed ? '☑' : '☐'}</Text>
                <Text style={styles.agreeText}>
                  Customer agreed on site to ${chargeTotal.toFixed(2)} before I charge
                </Text>
              </TouchableOpacity>
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
                <Text style={styles.claimBtnText}>Diagnostic only (${holdDollars.toFixed(0)})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.noShowBtn, busy && { opacity: 0.6 }]}
                disabled={busy}
                onPress={() => void handleNoShow()}
              >
                <Text style={styles.claimBtnText}>No-show — capture ${holdDollars.toFixed(0)}</Text>
              </TouchableOpacity>
            </View>
          )}

          {(jobPhase === 'on_site' || jobPhase === 'complete') && (
            <View style={styles.expenseBox}>
              <Text style={styles.quoteTitle}>Parts reimbursement</Text>
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
                style={[styles.smsBtn, expenseBusy && { opacity: 0.6 }]}
                disabled={expenseBusy}
                onPress={() => void handleSubmitExpense(job)}
              >
                <Text style={styles.claimBtnText}>
                  {expenseBusy ? 'Submitting…' : 'Submit parts claim'}
                </Text>
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

      {claims.length > 0 && (
        <View style={styles.claimsSection}>
          <Text style={styles.sectionLabel}>My parts claims</Text>
          {claims.slice(0, 8).map((c) => (
            <View key={c.id} style={styles.claimRow}>
              <Text style={styles.claimRowText}>
                ${(c.amountCents / 100).toFixed(2)} · {c.description}
              </Text>
              <Text style={styles.claimStatus}>{c.status}</Text>
            </View>
          ))}
        </View>
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
  filterText: { color: colors.text.muted, fontWeight: '600', fontSize: 11 },
  filterTextActive: { color: colors.brand.orange },
  sectionLabel: {
    color: colors.text.secondary,
    fontWeight: '800',
    fontSize: 12,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  scheduleText: { color: colors.text.muted, fontSize: 11, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  chip: {
    backgroundColor: 'rgba(249, 115, 22, 0.15)',
    borderRadius: borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: { color: colors.brand.orange, fontSize: 10, fontWeight: '700' },
  matchHint: { color: '#86efac', fontSize: 11, fontWeight: '600', marginBottom: 6 },
  navBtn: {
    backgroundColor: '#1d4ed8',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  statusPill: {
    color: colors.brand.orange,
    fontSize: 10,
    fontWeight: '800',
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  expenseBox: {
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    backgroundColor: colors.bg.input,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  claimsSection: { marginTop: spacing.lg },
  claimRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  claimRowText: { color: colors.text.secondary, fontSize: 12, flex: 1 },
  claimStatus: { color: colors.text.muted, fontSize: 11, fontWeight: '700' },
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
  noShowBtn: {
    backgroundColor: '#7f1d1d',
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
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: spacing.sm,
  },
  agreeBox: { color: colors.brand.orange, fontSize: 18, lineHeight: 22 },
  agreeText: { flex: 1, color: colors.text.secondary, fontSize: 12, lineHeight: 18 },
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
  receiptPreview: {
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    gap: 6,
  },
  receiptTitle: {
    color: '#6ee7b7',
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  receiptLabel: { flex: 1, color: colors.text.secondary, fontSize: 12 },
  receiptAmt: { color: colors.text.primary, fontFamily: 'monospace', fontSize: 12, fontWeight: '700' },
  receiptSub: { color: colors.text.muted, fontSize: 10, marginTop: 2 },
  receiptWarn: { color: '#fcd34d', fontSize: 10, lineHeight: 14 },
  receiptTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
    paddingTop: 8,
    marginTop: 4,
  },
  receiptTotalLabel: { color: colors.text.primary, fontWeight: '800', fontSize: 13 },
  receiptTotalAmt: { color: colors.text.primary, fontFamily: 'monospace', fontSize: 13, fontWeight: '800' },
  chatBox: {
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    backgroundColor: colors.bg.input,
    gap: 6,
    marginTop: spacing.sm,
  },
  chatBubble: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '90%',
  },
  chatBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(249,115,22,0.2)',
  },
  chatBubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chatBody: { color: colors.text.secondary, fontSize: 12 },
  chatTime: { color: colors.text.muted, fontSize: 9, marginTop: 2 },
  chatRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  offlineBox: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.bg.card,
  },
  offlineRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
});
