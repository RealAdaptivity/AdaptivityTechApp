import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Linking, ActivityIndicator, AppState,
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme/colors';
import {
  fetchTechConnectStatus,
  openExpressDashboard,
  openStripePayoutSetup,
  resetStaleStripeConnectLink,
  type TechConnectStatus,
} from '../lib/stripePayouts';
import { openExternalUrl } from '../lib/openExternalUrl';
import { errorMessage } from '../lib/errorMessage';
import {
  fetchMyJobCapacity,
  fetchMyTechSpecialties,
  fetchTechW9Status,
  fetchTechYearToDateCompensation,
  fetchContractorAgreementStatus,
  markContractorAgreementSigned,
  markTechW9Complete,
  updateMyJobCapacity,
  updateMyTechSpecialties,
  type TechJobCapacity,
  type TechW9Status,
  type ContractorAgreementStatus,
} from '../lib/supabase';
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
  const [specialties, setSpecialties] = useState<TechSpecialty[]>(['mechanical']);
  const [savingSpecialties, setSavingSpecialties] = useState(false);
  const [jobCapacity, setJobCapacity] = useState<TechJobCapacity>('multi');
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [w9, setW9] = useState<TechW9Status | null>(null);
  const [w9Busy, setW9Busy] = useState(false);
  const [agreement, setAgreement] = useState<ContractorAgreementStatus | null>(null);
  const [agreementBusy, setAgreementBusy] = useState(false);
  const [ytd, setYtd] = useState<{
    year: number;
    totalDollars: number;
    meetsNecThreshold: boolean;
  } | null>(null);
  const [inventorySpecialty, setInventorySpecialty] = useState(INVENTORY_SPECIALTY_KEYS[0] || 'brakes');
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  const [savingInventory, setSavingInventory] = useState(false);
  const [unavailable, setUnavailable] = useState<UnavailableWindow[]>([]);
  const [unavailStart, setUnavailStart] = useState('');
  const [unavailEnd, setUnavailEnd] = useState('');
  const [unavailReason, setUnavailReason] = useState('');
  const [unavailBusy, setUnavailBusy] = useState(false);
  const [offlinePackets, setOfflinePackets] = useState<OfflineJobPacket[]>([]);
  const taxYear = String(new Date().getFullYear());

  const refreshUnavailable = useCallback(async () => {
    try {
      setUnavailable(await listUnavailableWindows());
    } catch {
      setUnavailable([]);
    }
  }, []);

  const loadInventory = useCallback(async (specialty: string) => {
    try {
      setCheckedItems(await loadInventoryChecks(specialty));
    } catch {
      setCheckedItems([]);
    }
  }, []);

  useEffect(() => {
    void fetchMyTechSpecialties().then((list) =>
      setSpecialties(list as TechSpecialty[])
    );
    void fetchMyJobCapacity().then(setJobCapacity);
    void fetchTechW9Status().then(setW9);
    void fetchContractorAgreementStatus().then(setAgreement);
    void fetchTechYearToDateCompensation()
      .then((r) =>
        setYtd({
          year: r.year,
          totalDollars: r.totalDollars,
          meetsNecThreshold: r.meetsNecThreshold,
        })
      )
      .catch(() => setYtd(null));
    void refreshUnavailable();
    void listOfflineJobPackets().then(setOfflinePackets);
  }, [refreshUnavailable]);

  useEffect(() => {
    void loadInventory(inventorySpecialty);
  }, [inventorySpecialty, loadInventory]);

  const saveJobCapacity = async (capacity: TechJobCapacity) => {
    setSavingCapacity(true);
    try {
      await updateMyJobCapacity(capacity);
      setJobCapacity(capacity);
      Alert.alert(
        'Saved',
        capacity === 'multi'
          ? 'Multi-job: you can claim several active dispatches.'
          : 'Standalone: one active job at a time. Change anytime.'
      );
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e && 'message' in e
            ? String((e as { message: unknown }).message)
            : 'Unknown error';
      Alert.alert('Could not save', msg);
    } finally {
      setSavingCapacity(false);
    }
  };

  const toggleSpecialty = (id: TechSpecialty) => {
    setSpecialties((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((s) => s !== id);
        return next.length ? next : prev;
      }
      return [...prev, id];
    });
  };

  const saveSpecialties = async () => {
    setSavingSpecialties(true);
    try {
      await updateMyTechSpecialties(specialties);
      Alert.alert('Saved', 'Your trade specialties update which jobs you see on the board.');
    } catch (e: unknown) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSavingSpecialties(false);
    }
  };

  const toggleInventoryItem = (item: string) => {
    setCheckedItems((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  const saveInventory = async () => {
    setSavingInventory(true);
    try {
      await saveInventoryChecks(inventorySpecialty, checkedItems);
      Alert.alert('Saved', 'Inventory checklist updated.');
    } catch (e: unknown) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSavingInventory(false);
    }
  };

  const handleAddUnavailable = async () => {
    if (!unavailStart.trim() || !unavailEnd.trim()) {
      Alert.alert('Missing times', 'Enter start and end as ISO dates (e.g. 2026-07-29T09:00:00).');
      return;
    }
    setUnavailBusy(true);
    try {
      await addUnavailableWindow({
        startsAt: new Date(unavailStart.trim()).toISOString(),
        endsAt: new Date(unavailEnd.trim()).toISOString(),
        reason: unavailReason,
      });
      setUnavailStart('');
      setUnavailEnd('');
      setUnavailReason('');
      await refreshUnavailable();
    } catch (e: unknown) {
      Alert.alert('Could not add', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setUnavailBusy(false);
    }
  };

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
      setW9(await fetchTechW9Status());
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
      await openExternalUrl(onboardingUrl, 'Stripe onboarding');
      await refreshStripe();
    } catch (e: unknown) {
      const msg = errorMessage(e, 'Could not open Stripe onboarding.');
      Alert.alert(
        'Stripe setup',
        /technician profile required/i.test(msg)
          ? 'This login is not an approved tech account. Use your approved technician login.'
          : msg
      );
    } finally {
      setLinking(false);
    }
  };

  const handleResetStripeLink = () => {
    Alert.alert(
      'Reset Stripe link',
      'Clears a saved test-mode Connect account so you can start Live onboarding. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setLinking(true);
              try {
                await resetStaleStripeConnectLink();
                setStripeExpressId(null);
                setConnectStatus(null);
                setBankName('Link Stripe for instant debit payouts');
                await refreshStripe();
                Alert.alert('Reset done', 'Tap Connect Stripe Express to start Live onboarding.');
              } catch (e: unknown) {
                Alert.alert(
                  'Reset failed',
                  e instanceof Error ? e.message : 'Could not reset Stripe link.'
                );
              } finally {
                setLinking(false);
              }
            })();
          },
        },
      ]
    );
  };

  const handleExpressDashboard = async () => {
    setOpeningDash(true);
    try {
      const result = await openExpressDashboard();
      await openExternalUrl(result.loginUrl, 'Stripe Express');
      if (result.openedOnboarding) {
        Alert.alert(
          'Finish onboarding first',
          'No Live Express account yet — opened Stripe setup instead. Complete it, then come back for the Dashboard.'
        );
      }
      await refreshStripe();
    } catch (e: unknown) {
      Alert.alert(
        'Express Dashboard',
        errorMessage(e, 'Could not open Express Dashboard. Tap Connect Stripe Express first.')
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
          <Text style={styles.cardEmoji}>🛠️</Text>
          <View>
            <Text style={styles.cardTitle}>Your trade specialties</Text>
            <Text style={styles.cardSubtitle}>
              Pick every trade you cover — mechanical, tires, glass, body, detail, mods, audio, tint, wrap/PPF, performance. Jobs match your trades.
            </Text>
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
        <TouchableOpacity
          style={styles.updateButton}
          onPress={() => void saveSpecialties()}
          disabled={savingSpecialties}
        >
          <Text style={styles.updateText}>
            {savingSpecialties ? 'Saving…' : 'Save specialties'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>🧰</Text>
          <View>
            <Text style={styles.cardTitle}>Van inventory checklist</Text>
            <Text style={styles.cardSubtitle}>
              Check off stock for each specialty before you roll out.
            </Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={styles.specialtyGrid}>
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
        <TouchableOpacity
          style={styles.updateButton}
          onPress={() => void saveInventory()}
          disabled={savingInventory}
        >
          <Text style={styles.updateText}>
            {savingInventory ? 'Saving…' : 'Save inventory check'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>🚫</Text>
          <View>
            <Text style={styles.cardTitle}>Unavailable windows</Text>
            <Text style={styles.cardSubtitle}>
              Block times you cannot take jobs (ISO datetime, e.g. 2026-07-29T09:00).
            </Text>
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
                onPress={() => {
                  void (async () => {
                    try {
                      await removeUnavailableWindow(w.id);
                      await refreshUnavailable();
                    } catch (e: unknown) {
                      Alert.alert('Remove failed', e instanceof Error ? e.message : 'Unknown error');
                    }
                  })();
                }}
              >
                <Text style={[styles.linkText, { color: colors.status.error }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        <Text style={styles.inputLabel}>Starts at</Text>
        <TextInput
          style={styles.input}
          value={unavailStart}
          onChangeText={setUnavailStart}
          placeholder="2026-07-29T09:00"
          placeholderTextColor={colors.text.muted}
          autoCapitalize="none"
        />
        <Text style={styles.inputLabel}>Ends at</Text>
        <TextInput
          style={styles.input}
          value={unavailEnd}
          onChangeText={setUnavailEnd}
          placeholder="2026-07-29T17:00"
          placeholderTextColor={colors.text.muted}
          autoCapitalize="none"
        />
        <Text style={styles.inputLabel}>Reason (optional)</Text>
        <TextInput
          style={styles.input}
          value={unavailReason}
          onChangeText={setUnavailReason}
          placeholder="Vacation, shop day…"
          placeholderTextColor={colors.text.muted}
        />
        <TouchableOpacity
          style={styles.updateButton}
          disabled={unavailBusy}
          onPress={() => void handleAddUnavailable()}
        >
          <Text style={styles.updateText}>{unavailBusy ? 'Saving…' : 'Add window'}</Text>
        </TouchableOpacity>
      </View>

      {offlinePackets.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEmoji}>📦</Text>
            <View>
              <Text style={styles.cardTitle}>Offline packet</Text>
              <Text style={styles.cardSubtitle}>
                Cached active jobs for when the board is unreachable.
              </Text>
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
                {p.services.length > 0 && (
                  <Text style={styles.taxSubtitle}>{p.services.join(' · ')}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>📋</Text>
          <View>
            <Text style={styles.cardTitle}>Work style</Text>
            <Text style={styles.cardSubtitle}>
              Multi-job = several active dispatches. Standalone = one job at a time. Change anytime.
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.specialtyChip, jobCapacity === 'multi' && styles.specialtyChipOn, { marginBottom: 8 }]}
          onPress={() => void saveJobCapacity('multi')}
          disabled={savingCapacity}
          activeOpacity={0.8}
        >
          <Text style={[styles.specialtyChipText, jobCapacity === 'multi' && styles.specialtyChipTextOn]}>
            {jobCapacity === 'multi' ? '✓ ' : ''}Multi-job
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.specialtyChip, jobCapacity === 'standalone' && styles.specialtyChipOn]}
          onPress={() => void saveJobCapacity('standalone')}
          disabled={savingCapacity}
          activeOpacity={0.8}
        >
          <Text style={[styles.specialtyChipText, jobCapacity === 'standalone' && styles.specialtyChipTextOn]}>
            {jobCapacity === 'standalone' ? '✓ ' : ''}Standalone (single)
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>🧾</Text>
          <View>
            <Text style={styles.cardTitle}>IRS Form W-9 (required)</Text>
            <Text style={styles.cardSubtitle}>
              Submit your SSN or EIN in Stripe Express before claiming your first job. We use that for 1099s and do not store your SSN in our database.
            </Text>
          </View>
        </View>
        <Text style={styles.statusText}>
          {w9?.completed
            ? `W-9 / tax ID on file${w9.completedAt ? ` · ${new Date(w9.completedAt).toLocaleDateString()}` : ''}`
            : 'Not complete — finish Stripe tax ID, then mark below.'}
        </Text>
        {!w9?.completed && (
          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: spacing.md }]}
            disabled={w9Busy || !(connectStatus?.detailsSubmitted || connectStatus?.taxIdProvided)}
            onPress={() => {
              void (async () => {
                setW9Busy(true);
                try {
                  await markTechW9Complete();
                  setW9(await fetchTechW9Status());
                  Alert.alert('W-9 complete', 'You can claim dispatch jobs now.');
                } catch (e: unknown) {
                  Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
                } finally {
                  setW9Busy(false);
                }
              })();
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              {w9Busy ? 'Saving…' : 'I submitted tax ID in Stripe — mark W-9 complete'}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={{ marginTop: spacing.sm }}
          onPress={() => void Linking.openURL('https://www.irs.gov/pub/irs-pdf/fw9.pdf')}
        >
          <Text style={styles.linkText}>Download blank IRS Form W-9 (PDF)</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>📜</Text>
          <View>
            <Text style={styles.cardTitle}>Contractor Agreement (required)</Text>
            <Text style={styles.cardSubtitle}>
              Accept 1099 contractor terms (liability, workers’ comp notice, tax forms, payouts) before claiming jobs.
              Print/save the PDF from the web tech portal Settings anytime.
            </Text>
          </View>
        </View>
        <Text style={styles.statusText}>
          {agreement?.signed
            ? `Accepted${agreement.signedAt ? ` · ${new Date(agreement.signedAt).toLocaleDateString()}` : ''}`
            : 'Not accepted yet'}
        </Text>
        {!agreement?.signed && (
          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: spacing.md }]}
            disabled={agreementBusy}
            onPress={() => {
              Alert.alert(
                'Accept agreement?',
                'You are an independent contractor (1099), not an employee. You are responsible for liability/insurance on customer vehicles, Texas workers’ comp is not provided by Adaptivity, and you must complete W-9 via Stripe. Accept to continue.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'I accept',
                    onPress: () => {
                      void (async () => {
                        setAgreementBusy(true);
                        try {
                          const signedAt = await markContractorAgreementSigned();
                          setAgreement({ signed: true, signedAt });
                          Alert.alert('Accepted', 'You can claim jobs once W-9 is also complete.');
                        } catch (e: unknown) {
                          Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
                        } finally {
                          setAgreementBusy(false);
                        }
                      })();
                    },
                  },
                ]
              );
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              {agreementBusy ? 'Saving…' : 'I accept the Independent Contractor Agreement'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

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

        {stripeExpressId && connectStatus?.detailsSubmitted ? (
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
        {!connectStatus?.readyForPayouts && (
          <TouchableOpacity
            style={[styles.updateButton, { marginTop: spacing.sm }]}
            activeOpacity={0.8}
            onPress={handleResetStripeLink}
            disabled={linking}
          >
            <Text style={styles.updateText}>Reset Stripe link (test→Live)</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>📄</Text>
          <View>
            <Text style={styles.cardTitle}>Form 1099-NEC</Text>
            <Text style={styles.cardSubtitle}>
              If Adaptivity pays you $600 or more in a calendar year, we must file Form 1099-NEC with the IRS and send you a copy by January 31 of the following year.
            </Text>
          </View>
        </View>

        <View style={styles.taxRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.taxTitle}>{taxYear} YTD compensation</Text>
            <Text style={styles.taxSubtitle}>Your 70% job share toward the $600 threshold</Text>
          </View>
          <Text style={styles.taxTitle}>
            {ytd ? `$${ytd.totalDollars.toFixed(2)}` : '—'}
          </Text>
        </View>
        <Text style={[styles.taxSubtitle, { marginBottom: spacing.md }]}>
          {ytd?.meetsNecThreshold
            ? 'At or above $600 — Adaptivity will file 1099-NEC and furnish your copy by Jan 31 next year.'
            : 'Under $600 so far this year — no 1099-NEC until the threshold is met.'}
        </Text>

        <View style={styles.taxRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.taxTitle}>W-9 / tax ID</Text>
            <Text
              style={[
                styles.taxSubtitle,
                { color: w9?.completed ? colors.status.success : colors.brand.orange },
              ]}
            >
              {w9?.completed ? 'On file via Stripe Express' : 'Required before first job — see section above'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={{ marginTop: spacing.sm }}
          onPress={() => void Linking.openURL('https://www.irs.gov/forms-pubs/about-form-1099-nec')}
        >
          <Text style={styles.linkText}>IRS: About Form 1099-NEC</Text>
        </TouchableOpacity>
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
