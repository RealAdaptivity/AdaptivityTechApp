import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Linking, AppState, Platform,
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme/colors';
import {
  fetchMyJobCapacity,
  fetchMyTechSpecialties,
  fetchTechW9Status,
  updateMyJobCapacity,
  updateMyTechSpecialties,
  type TechJobCapacity,
  type TechW9Status,
} from '../lib/supabase';
import {
  CONTRACTOR_AGREEMENT_VERSION,
  fetchContractorAgreementStatus,
  type ContractorAgreementStatus,
} from '../lib/contractorAgreement';
import { fetchDisclosureStatus, type DisclosureStatus } from '../lib/vehicleInsuranceDisclosure';
import { getSignatureUrl } from '../lib/signatureUpload';
import { TECH_SPECIALTIES, type TechSpecialty } from '../lib/techSpecialties';
import {
  INVENTORY_SPECIALTY_KEYS,
  SPECIALTY_INVENTORY,
  loadInventoryChecks,
  saveInventoryChecks,
} from '../lib/techInventory';
import {
  addUnavailableWindow,
  listUnavailableWindows,
  removeUnavailableWindow,
  type UnavailableWindow,
} from '../lib/techUnavailable';
import { listOfflineJobPackets, type OfflineJobPacket } from '../lib/offlineJobPacket';
import { FORM_1099_NEC_NOTICE, FORM_1099_NEC_PLATFORM_NOTE } from '../content/taxForms';
import { ContractorAgreementSignModal } from '../components/ContractorAgreementSignModal';
import { VehicleInsuranceDisclosureModal } from '../components/VehicleInsuranceDisclosureModal';
import {
  ensureSquareAuthorized,
  prepareTapToPayOnIphone,
  tapToPayOnIphoneEnabled,
  showSquareSettings,
  squareLocationName,
  tapToPayAvailability,
} from '../lib/squareTapToPay';

const PORTAL_URL = 'https://adaptivityperformance.com/portal';

interface SettingsScreenProps {
  onLogout: () => void;
  /** Bumped when a document is signed elsewhere (the banners above the tabs). */
  refreshKey?: number;
  onDocumentsChanged?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onLogout, refreshKey, onDocumentsChanged }) => {
  const [specialties, setSpecialties] = useState<TechSpecialty[]>(['mechanical']);
  const [savingSpecialties, setSavingSpecialties] = useState(false);
  const [jobCapacity, setJobCapacity] = useState<TechJobCapacity>('multi');
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [w9, setW9] = useState<TechW9Status | null>(null);
  const [agreement, setAgreement] = useState<ContractorAgreementStatus | null>(null);
  const [disclosure, setDisclosure] = useState<DisclosureStatus | null>(null);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [inventorySpecialty, setInventorySpecialty] = useState(INVENTORY_SPECIALTY_KEYS[0] || 'brakes');
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  const [savingInventory, setSavingInventory] = useState(false);
  const [unavailable, setUnavailable] = useState<UnavailableWindow[]>([]);
  const [unavailStart, setUnavailStart] = useState('');
  const [unavailEnd, setUnavailEnd] = useState('');
  const [unavailReason, setUnavailReason] = useState('');
  const [unavailBusy, setUnavailBusy] = useState(false);
  const [offlinePackets, setOfflinePackets] = useState<OfflineJobPacket[]>([]);
  const [squareLocation, setSquareLocation] = useState<string | null>(null);
  const [squareBusy, setSquareBusy] = useState(false);
  const cardPayments = tapToPayAvailability();

  const refreshDocuments = useCallback(async () => {
    const [w, a, d] = await Promise.all([
      fetchTechW9Status().catch(() => null),
      fetchContractorAgreementStatus().catch(() => null),
      fetchDisclosureStatus().catch(() => null),
    ]);
    setW9(w);
    setAgreement(a);
    setDisclosure(d);
  }, []);

  const refreshUnavailable = useCallback(async () => {
    try {
      setUnavailable(await listUnavailableWindows());
    } catch {
      setUnavailable([]);
    }
  }, []);

  useEffect(() => {
    void refreshDocuments();
  }, [refreshDocuments, refreshKey]);

  useEffect(() => {
    void fetchMyTechSpecialties().then((list) => setSpecialties(list as TechSpecialty[]));
    void fetchMyJobCapacity().then(setJobCapacity);
    void refreshUnavailable();
    void listOfflineJobPackets().then(setOfflinePackets);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshDocuments();
    });
    return () => sub.remove();
  }, [refreshUnavailable, refreshDocuments]);

  useEffect(() => {
    void loadInventoryChecks(inventorySpecialty)
      .then(setCheckedItems)
      .catch(() => setCheckedItems([]));
  }, [inventorySpecialty]);

  const saveJobCapacity = async (capacity: TechJobCapacity) => {
    setSavingCapacity(true);
    try {
      await updateMyJobCapacity(capacity);
      setJobCapacity(capacity);
      Alert.alert(
        'Saved',
        capacity === 'multi'
          ? 'Saved — you can claim multiple active jobs.'
          : 'Saved — one active job at a time. Change anytime.'
      );
    } catch (e: unknown) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Could not save work style');
    } finally {
      setSavingCapacity(false);
    }
  };

  const toggleSpecialty = (id: TechSpecialty) => {
    setSpecialties((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((s) => s !== id);
        return next.length ? next : ['mechanical'];
      }
      return [...prev, id];
    });
  };

  const saveSpecialties = async () => {
    setSavingSpecialties(true);
    try {
      await updateMyTechSpecialties(specialties);
      Alert.alert('Saved', 'Specialties saved — job board filters to your trades.');
    } catch (e: unknown) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Could not save specialties');
    } finally {
      setSavingSpecialties(false);
    }
  };

  const toggleInventoryItem = (item: string) => {
    setCheckedItems((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]));
  };

  const saveInventory = async () => {
    setSavingInventory(true);
    try {
      await saveInventoryChecks(inventorySpecialty, checkedItems);
      Alert.alert('Saved', 'Checklist saved.');
    } catch (e: unknown) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingInventory(false);
    }
  };

  const handleAddUnavailable = async () => {
    const start = new Date(unavailStart.trim().replace(' ', 'T'));
    const end = new Date(unavailEnd.trim().replace(' ', 'T'));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      Alert.alert('Check the times', 'Enter start and end like 2026-10-03 09:00.');
      return;
    }
    if (end <= start) {
      Alert.alert('Check the times', 'The end has to be after the start.');
      return;
    }
    setUnavailBusy(true);
    try {
      await addUnavailableWindow({ startsAt: start.toISOString(), endsAt: end.toISOString(), reason: unavailReason });
      setUnavailStart('');
      setUnavailEnd('');
      setUnavailReason('');
      await refreshUnavailable();
    } catch (e: unknown) {
      Alert.alert('Could not add window', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setUnavailBusy(false);
    }
  };

  useEffect(() => {
    if (cardPayments.available) void squareLocationName().then(setSquareLocation);
  }, [cardPayments.available]);

  const runSquare = async (action: () => Promise<void>, done?: string) => {
    setSquareBusy(true);
    try {
      await action();
      setSquareLocation(await squareLocationName());
      if (done) Alert.alert('Card payments', done);
    } catch (e: unknown) {
      Alert.alert('Card payments', e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSquareBusy(false);
    }
  };

  const viewSignature = async (path: string | null) => {
    const url = await getSignatureUrl(path);
    if (url) void Linking.openURL(url);
    else Alert.alert('Not available', 'Could not open the signature on file.');
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of Adaptivity Tech Dispatch?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: onLogout },
    ]);
  };

  const agreementCurrent = Boolean(agreement?.signed && agreement.signaturePath);
  const agreementStale = Boolean(agreement?.signedAt) && agreement?.agreementVersion !== CONTRACTOR_AGREEMENT_VERSION;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Required documents */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>📜</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Independent Contractor Agreement</Text>
            <Text style={styles.cardSubtitle}>
              Digitally sign the 1099 contractor terms (liability, workers’ comp, tax, payouts). Required before
              claiming your first job. We store your name, signature image, and timestamp for Adaptivity records.
            </Text>
          </View>
        </View>
        <Text style={[styles.statusText, { color: agreementCurrent ? colors.status.success : '#fcd34d' }]}>
          {agreement === null
            ? 'Checking agreement status…'
            : agreementCurrent
              ? `Signed${agreement.signerName ? ` by ${agreement.signerName}` : ''}${
                  agreement.signedAt ? ` · ${new Date(agreement.signedAt).toLocaleString()}` : ''
                } · ${agreement.agreementVersion}`
              : agreementStale
                ? `The agreement has been updated since you signed${
                    agreement.agreementVersion ? ` (you signed ${agreement.agreementVersion})` : ''
                  }. Read and sign the current version to keep claiming jobs.`
                : agreement.signedAt && !agreement.signaturePath
                  ? 'Accepted earlier without a drawn signature. Complete the digital signature so we have a signed copy on file.'
                  : 'Not signed yet. Read the agreement, type your legal name, draw your signature, and save.'}
        </Text>
        {!agreementCurrent && (
          <TouchableOpacity style={styles.primaryButton} onPress={() => setAgreementOpen(true)}>
            <Text style={styles.primaryButtonText}>
              {agreementStale ? 'Review and sign the updated agreement →' : 'Sign agreement digitally →'}
            </Text>
          </TouchableOpacity>
        )}
        {!!agreement?.signaturePath && (
          <TouchableOpacity style={styles.updateButton} onPress={() => void viewSignature(agreement.signaturePath)}>
            <Text style={styles.updateText}>View my signature on file</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={{ marginTop: spacing.sm }} onPress={() => void Linking.openURL(PORTAL_URL)}>
          <Text style={styles.linkText}>Print / save the signed PDF from the web portal</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>🚗</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Vehicle insurance disclosure</Text>
            <Text style={styles.cardSubtitle}>
              Your personal vehicle, plate, insurer and policy — required before field dispatch and again whenever
              the policy renews.
            </Text>
          </View>
        </View>
        <Text style={[styles.statusText, { color: disclosure?.current ? colors.status.success : '#fcd34d' }]}>
          {disclosure === null
            ? 'Checking disclosure status…'
            : disclosure.current
              ? `On file · ${disclosure.values?.vehicleDescription || 'vehicle'} · ${
                  disclosure.values?.insuranceCarrier || 'carrier'
                } · expires ${disclosure.policyExpiresOn}`
              : disclosure.policyExpired
                ? `The policy you disclosed expired on ${disclosure.policyExpiresOn}. File your renewed policy.`
                : disclosure.staleVersion
                  ? 'The disclosure has been updated since you signed it. Sign the current version.'
                  : 'Not filed yet.'}
        </Text>
        <TouchableOpacity
          style={disclosure?.current ? styles.updateButton : styles.primaryButton}
          onPress={() => setDisclosureOpen(true)}
        >
          <Text style={disclosure?.current ? styles.updateText : styles.primaryButtonText}>
            {disclosure?.signedAt ? 'Update my insurance details →' : 'Read & sign the disclosure →'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>💳</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Card payments (Square Tap to Pay)</Text>
            <Text style={styles.cardSubtitle}>
              Customers tap their card or phone on your phone at the end of the job. Set it up once before your
              first card payment.
            </Text>
          </View>
        </View>
        <Text
          style={[styles.statusText, { color: cardPayments.available && squareLocation ? colors.status.success : '#fcd34d' }]}
        >
          {!cardPayments.available
            ? cardPayments.reason
            : squareLocation
              ? `Connected to Square · ${squareLocation}`
              : 'Not connected to Square yet on this phone.'}
        </Text>
        {cardPayments.available && (
          <>
            <TouchableOpacity
              style={[styles.primaryButton, squareBusy && { opacity: 0.6 }]}
              disabled={squareBusy}
              onPress={() =>
                void runSquare(
                  async () => {
                    await ensureSquareAuthorized();
                    await prepareTapToPayOnIphone();
                  },
                  Platform.OS === 'ios'
                    ? tapToPayOnIphoneEnabled()
                      ? 'Tap to Pay on iPhone is ready.'
                      : 'Connected. Pair a Square reader below to take cards — Tap to Pay on iPhone is coming soon.'
                    : 'Connected. Tap to Pay is offered when this phone supports it (NFC on).'
                )
              }
            >
              <Text style={styles.primaryButtonText}>
                {squareBusy
                  ? 'Working…'
                  : Platform.OS === 'ios' && tapToPayOnIphoneEnabled()
                    ? 'Set up Tap to Pay on iPhone'
                    : 'Connect to Square'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.updateButton}
              disabled={squareBusy}
              onPress={() => void runSquare(showSquareSettings)}
            >
              <Text style={styles.updateText}>Square settings & card readers</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>🧾</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>IRS Form W-9 (required before first job)</Text>
            <Text style={styles.cardSubtitle}>
              Every mechanic must give Adaptivity a completed Form W-9 before claiming a dispatch, so we can issue
              1099s. Download the blank form, fill it in, and hand or send it to dispatch. Your Social Security
              number is never entered into this app and is not stored in our database.
            </Text>
          </View>
        </View>
        <Text style={[styles.statusText, { color: w9?.completed ? colors.status.success : '#fcd34d' }]}>
          {w9 === null
            ? 'Checking W-9 status…'
            : w9.completed
              ? `W-9 / tax ID on file${w9.completedAt ? ` · ${new Date(w9.completedAt).toLocaleDateString()}` : ''}. You can claim jobs.`
              : 'Not on file yet. Send your completed W-9 to dispatch — they record it once received. It cannot be self-certified from this app.'}
        </Text>
        <TouchableOpacity
          style={{ marginTop: spacing.sm }}
          onPress={() => void Linking.openURL('https://www.irs.gov/pub/irs-pdf/fw9.pdf')}
        >
          <Text style={styles.linkText}>Download blank IRS Form W-9 (PDF)</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>🛠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Your trade specialties</Text>
            <Text style={styles.cardSubtitle}>Pick every trade you cover. Available jobs match these specialties.</Text>
          </View>
        </View>
        <View style={styles.specialtyGrid}>
          {TECH_SPECIALTIES.map((s) => {
            const on = specialties.includes(s.id);
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.specialtyChip, on && styles.specialtyChipOn]}
                onPress={() => toggleSpecialty(s.id)}
                activeOpacity={0.8}
              >
                <Text style={[styles.specialtyChipText, on && styles.specialtyChipTextOn]}>
                  {on ? '✓ ' : ''}
                  {s.shortLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={() => void saveSpecialties()} disabled={savingSpecialties}>
          <Text style={styles.primaryButtonText}>{savingSpecialties ? 'Saving…' : 'Save specialties'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>📋</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Work style</Text>
            <Text style={styles.cardSubtitle}>
              Choose whether you take multiple jobs or stay standalone on one job. You can change this anytime.
            </Text>
          </View>
        </View>
        {(
          [
            ['multi', 'Multi-job', 'Claim several active dispatches at once'],
            ['standalone', 'Standalone (single)', 'One active job until you finish or release it'],
          ] as const
        ).map(([value, title, detail]) => {
          const on = jobCapacity === value;
          return (
            <TouchableOpacity
              key={value}
              style={[styles.inventoryRow, on && styles.inventoryRowOn]}
              onPress={() => void saveJobCapacity(value)}
              disabled={savingCapacity}
              activeOpacity={0.8}
            >
              <Text style={[styles.taxTitle, on && { color: colors.brand.orange }]}>
                {on ? '✓ ' : ''}
                {title}
              </Text>
              <Text style={styles.taxSubtitle}>{detail}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>🧰</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Inventory checklist</Text>
            <Text style={styles.cardSubtitle}>Van stock checklist by specialty — synced to your account.</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={[styles.specialtyGrid, { flexWrap: 'nowrap' }]}>
            {INVENTORY_SPECIALTY_KEYS.map((key) => {
              const on = inventorySpecialty === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.specialtyChip, on && styles.specialtyChipOn]}
                  onPress={() => setInventorySpecialty(key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.specialtyChipText, on && styles.specialtyChipTextOn]}>
                    {key.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
        {(SPECIALTY_INVENTORY[inventorySpecialty] || []).map((item) => {
          const on = checkedItems.includes(item);
          return (
            <TouchableOpacity
              key={item}
              style={[styles.inventoryRow, on && styles.inventoryRowOn]}
              onPress={() => toggleInventoryItem(item)}
              activeOpacity={0.8}
            >
              <Text style={[styles.specialtyChipText, on && styles.specialtyChipTextOn]}>
                {on ? '☑ ' : '☐ '}
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={styles.updateButton} onPress={() => void saveInventory()} disabled={savingInventory}>
          <Text style={styles.updateText}>{savingInventory ? 'Saving…' : 'Save checklist'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>🚫</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Unavailable windows</Text>
            <Text style={styles.cardSubtitle}>Block times you cannot take jobs (vacation, shop day, etc.).</Text>
          </View>
        </View>
        {unavailable.length === 0 ? (
          <Text style={styles.statusText}>No upcoming unavailable windows.</Text>
        ) : (
          unavailable.map((w) => (
            <View key={w.id} style={styles.unavailRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.taxTitle}>
                  {new Date(w.startsAt).toLocaleString()} → {new Date(w.endsAt).toLocaleString()}
                </Text>
                {!!w.reason && <Text style={styles.taxSubtitle}>{w.reason}</Text>}
              </View>
              <TouchableOpacity
                onPress={() =>
                  void removeUnavailableWindow(w.id)
                    .then(refreshUnavailable)
                    .catch((e: unknown) =>
                      Alert.alert('Remove failed', e instanceof Error ? e.message : 'Unknown error')
                    )
                }
              >
                <Text style={[styles.linkText, { color: colors.status.error }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        <Text style={styles.inputLabel}>Starts</Text>
        <TextInput
          style={styles.input}
          value={unavailStart}
          onChangeText={setUnavailStart}
          placeholder="2026-10-03 09:00"
          placeholderTextColor={colors.text.muted}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
        />
        <Text style={styles.inputLabel}>Ends</Text>
        <TextInput
          style={styles.input}
          value={unavailEnd}
          onChangeText={setUnavailEnd}
          placeholder="2026-10-03 17:00"
          placeholderTextColor={colors.text.muted}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
        />
        <Text style={styles.inputLabel}>Reason (optional)</Text>
        <TextInput
          style={styles.input}
          value={unavailReason}
          onChangeText={setUnavailReason}
          placeholder="Vacation, shop day…"
          placeholderTextColor={colors.text.muted}
        />
        <TouchableOpacity style={styles.updateButton} disabled={unavailBusy} onPress={() => void handleAddUnavailable()}>
          <Text style={styles.updateText}>{unavailBusy ? 'Saving…' : 'Add unavailable window'}</Text>
        </TouchableOpacity>
      </View>

      {offlinePackets.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEmoji}>📦</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Offline packet</Text>
              <Text style={styles.cardSubtitle}>Cached active jobs for when the board is unreachable.</Text>
            </View>
          </View>
          {offlinePackets.map((p) => (
            <View key={p.id} style={styles.unavailRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.taxTitle}>
                  {p.referenceCode} · {p.customer}
                </Text>
                <Text style={styles.taxSubtitle}>
                  {p.vehicle} · {p.address}
                </Text>
                <Text style={styles.taxSubtitle}>{p.phone}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>📄</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Form 1099-NEC</Text>
            <Text style={styles.cardSubtitle}>{FORM_1099_NEC_NOTICE}</Text>
          </View>
        </View>
        <Text style={styles.taxSubtitle}>{FORM_1099_NEC_PLATFORM_NOTE}</Text>
        <TouchableOpacity
          style={{ marginTop: spacing.sm }}
          onPress={() => void Linking.openURL('https://www.irs.gov/forms-pubs/about-form-1099-nec')}
        >
          <Text style={styles.linkText}>IRS: About Form 1099-NEC</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={styles.logoutText}>🚪 Sign out of Adaptivity Tech</Text>
      </TouchableOpacity>

      <ContractorAgreementSignModal
        visible={agreementOpen}
        onClose={() => setAgreementOpen(false)}
        onSigned={() => {
          void refreshDocuments();
          onDocumentsChanged?.();
        }}
      />
      <VehicleInsuranceDisclosureModal
        visible={disclosureOpen}
        onClose={() => setDisclosureOpen(false)}
        initialValues={disclosure?.values}
        onSigned={() => {
          void refreshDocuments();
          onDocumentsChanged?.();
        }}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: spacing.lg, paddingBottom: spacing["3xl"] },
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
    marginBottom: spacing.md,
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
  linkText: { fontSize: 12, color: colors.brand.orange, textDecorationLine: 'underline' },
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
  specialtyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  specialtyChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.bg.input,
  },
  specialtyChipOn: {
    borderColor: colors.brand.orange,
    backgroundColor: 'rgba(249,115,22,0.15)',
  },
  specialtyChipText: { color: colors.text.muted, fontWeight: '700', fontSize: 12 },
  specialtyChipTextOn: { color: colors.brand.orange },
  inventoryRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.bg.input,
    marginBottom: 6,
  },
  inventoryRowOn: {
    borderColor: colors.brand.orange,
    backgroundColor: 'rgba(249,115,22,0.12)',
  },
  unavailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
    marginBottom: 4,
  },
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
