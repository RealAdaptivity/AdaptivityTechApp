import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme/colors';
import type { DispatchBooking } from '../lib/supabase';
import { DIAGNOSTIC_FEE_DOLLARS, TRAVEL_FEE_DOLLARS } from '../lib/pricing';
import {
  closeOutProblem,
  computeCloseOut,
  formatCents,
  type LineDraft,
  type PartsBy,
  type TaxMode,
} from '../lib/closeOut';
import {
  openDeviceEmail,
  openDeviceSms,
  recordJobPayment,
  recordSquarePayment,
  sendReceipt,
  uploadCustomerSignature,
  type CloseOutOptions,
  type ReceiptSendResult,
} from '../lib/jobPayments';
import { fetchZelleConfig, type ZelleConfig } from '../lib/zelle';
import { QrCode } from './QrCode';
import {
  iphoneTapToPayStatus,
  phoneTapToPayOffered,
  takeCardPayment,
  tapToPayAvailability,
  TapToPayNotLinkedError,
} from '../lib/squareTapToPay';
import { TapToPaySetupModal } from './TapToPaySetupModal';
import { SheetModal } from './SheetModal';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';

type Mode = 'charge' | 'diagnostic_only';
type DiagChoice = 'auto' | 'collect' | 'credit';

const EMPTY_LINE: LineDraft = { title: '', labor: '', parts: '' };

type Props = {
  job: DispatchBooking;
  visible: boolean;
  onClose: () => void;
  /** The job is closed in the database (board should refresh). */
  onClosed: () => void;
};

type PayMethod = 'card' | 'zelle' | 'cash';
type OfflineMethod = 'zelle' | 'cash' | 'square_app';

const METHOD_TAB: Record<PayMethod, string> = { card: 'Card', zelle: 'Zelle', cash: 'Cash' };
const METHOD_LABEL: Record<PayMethod, string> = { card: 'by card', zelle: 'by Zelle', cash: 'in cash' };
const OFFLINE_COPY: Record<OfflineMethod, { title: string; confirm: string }> = {
  zelle: { title: 'Zelle payment received?', confirm: 'Zelle received' },
  cash: { title: 'Cash received?', confirm: 'Cash received' },
  square_app: { title: 'Paid on the Square app?', confirm: 'Customer paid' },
};

function zelleName(z: ZelleConfig | null): string {
  return z?.displayName || 'Adaptivity Performance';
}

/**
 * Get paid — the same close-out as the web portal. The customer checks the
 * itemized receipt and signs on the tech's phone, then pays by card (Tap to
 * Pay / Square reader), by Zelle (scanning the company QR code) or in cash.
 * Either way the database adds the lines up itself and stores them with the
 * signature and how it was paid.
 */
export const GetPaidScreen: React.FC<Props> = ({ job, visible, onClose, onClosed }) => {
  const diagnosticFeeCents = job.holdAmountCents ?? DIAGNOSTIC_FEE_DOLLARS * 100;
  const shop = job.locationType === 'shop';
  const padRef = useRef<SignaturePadHandle>(null);

  const [mode, setMode] = useState<Mode>('charge');
  const [lines, setLines] = useState<LineDraft[]>([EMPTY_LINE]);
  const [diagChoice, setDiagChoice] = useState<DiagChoice>('auto');
  const [member, setMember] = useState(false);
  const [taxMode, setTaxMode] = useState<TaxMode>('parts');
  const [partsBy, setPartsBy] = useState<PartsBy>('tech');
  const [notes, setNotes] = useState('');
  const [signerName, setSignerName] = useState(job.customer || '');
  const [signed, setSigned] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState<null | 'card' | 'other'>(null);
  const [error, setError] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>('card');
  const [zelle, setZelle] = useState<ZelleConfig | null>(null);
  const [closed, setClosed] = useState<{ totalCents: number; payoutCents: number; method: PayMethod } | null>(null);
  // Once a card has been charged the amounts are locked: closing may be
  // retried, but the customer is never charged a second time.
  const [charged, setCharged] = useState<{ paymentId: string; signaturePath: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    void fetchZelleConfig()
      .then(setZelle)
      .catch(() => setZelle({ qrPayload: null, recipient: null, displayName: null }));
  }, [visible]);

  const card = tapToPayAvailability();
  const [tapToPaySetupOpen, setTapToPaySetupOpen] = useState(false);
  const cardLabel =
    Platform.OS === 'ios' && phoneTapToPayOffered()
      ? 'Tap to Pay on iPhone'
      : phoneTapToPayOffered()
        ? 'Tap to Pay'
        : 'Charge card (Square reader)';
  const repairsEntered = lines.some((l) => l.labor.trim() || l.parts.trim());
  const collectDiag =
    mode === 'diagnostic_only' || diagChoice === 'collect' || (diagChoice === 'auto' && !repairsEntered);
  const closeOut = useMemo(
    () =>
      computeCloseOut({
        kind: mode,
        lines,
        diagnosticCents: collectDiag ? diagnosticFeeCents : 0,
        travelCents: shop || member ? 0 : TRAVEL_FEE_DOLLARS * 100,
        taxMode,
        partsBy,
      }),
    [mode, lines, collectDiag, diagnosticFeeCents, shop, member, taxMode, partsBy]
  );
  const problem = closeOutProblem(closeOut, signed && signerName.trim().length > 1);
  const locked = Boolean(charged) || busy !== null;

  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((cur) => cur.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const options = (signaturePath: string): CloseOutOptions => ({
    taxMode,
    partsBy,
    signaturePath,
    signerName: signerName.trim(),
    techNotes: notes.trim() || undefined,
  });

  const saveSignature = async (): Promise<string> => {
    const file = await padRef.current?.toPngFile();
    if (!file) throw new Error('Could not read the signature — have the customer sign again.');
    return uploadCustomerSignature(job.id, file);
  };

  const payByCard = async () => {
    if (busy) return;
    // Apple: the Tap to Pay button is never greyed out (5.3). Say what is
    // missing instead.
    if (problem) {
      Alert.alert('Before taking payment', problem);
      return;
    }
    setBusy('card');
    setError(null);
    try {
      let current = charged;
      if (!current) {
        // Not set up on this iPhone yet: go straight to setup (3.7, 5.3)
        // before the signature is saved or anything is charged.
        if (Platform.OS === 'ios' && phoneTapToPayOffered()) {
          const status = await iphoneTapToPayStatus();
          if (status.state === 'not_linked') throw new TapToPayNotLinkedError();
        }
        const signaturePath = await saveSignature();
        const result = await takeCardPayment({
          amountCents: closeOut.totalCents,
          referenceCode: job.referenceCode,
          note: `${job.referenceCode} · ${job.customer} · ${job.vehicle}`.trim(),
        });
        current = { paymentId: result.paymentId, signaturePath };
        setCharged(current);
      }
      const saved = await recordSquarePayment(job.id, current.paymentId, closeOut, options(current.signaturePath));
      setClosed({ totalCents: saved.totalCents, payoutCents: saved.techPayoutCents, method: 'card' });
      onClosed();
    } catch (e) {
      if (e instanceof TapToPayNotLinkedError) {
        setTapToPaySetupOpen(true);
        return;
      }
      setError(e instanceof Error ? e.message : 'The card payment did not go through.');
    } finally {
      setBusy(null);
    }
  };

  /** Zelle or cash: the tech confirms the money arrived, the database records it. */
  const confirmPaid = (method: OfflineMethod) => {
    if (busy || charged) return;
    if (problem) {
      Alert.alert('Before taking payment', problem);
      return;
    }
    const amount = formatCents(closeOut.totalCents);
    Alert.alert(
      OFFLINE_COPY[method].title,
      method === 'zelle'
        ? `Only confirm once the customer shows you the Zelle payment of ${amount} was sent to ${zelleName(zelle)}.`
        : method === 'cash'
          ? `Confirm you collected ${amount} in cash.`
          : `Confirm the customer paid ${amount} on the Square app.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: OFFLINE_COPY[method].confirm,
          onPress: async () => {
            setBusy('other');
            setError(null);
            try {
              const signaturePath = await saveSignature();
              const saved = await recordJobPayment(job.id, closeOut, {
                ...options(signaturePath),
                paymentMethod: method === 'square_app' ? undefined : method,
              });
              setClosed({
                totalCents: saved.totalCents,
                payoutCents: saved.techPayoutCents,
                method: method === 'square_app' ? 'card' : method,
              });
              onClosed();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not close the job');
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  const requestClose = () => {
    if (charged && !closed) {
      Alert.alert(
        'Card already charged',
        'The customer’s card was charged but the job is not closed yet. Tap “Finish closing the job” — the card will not be charged again.'
      );
      return;
    }
    onClose();
  };

  const seg = (on: boolean) => [styles.seg, on && styles.segOn];

  return (
    <SheetModal
      visible={visible}
      onClose={requestClose}
      title={closed ? 'Job closed' : 'Get paid · show the customer'}
      subtitle={closed ? job.referenceCode : 'Hand them the phone to check the total and sign'}
    >
      {closed ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.closedTitle}>
            ✓ Paid {METHOD_LABEL[closed.method]} · {formatCents(closed.totalCents)}
          </Text>
          <Text style={styles.closedPayout}>Your payout: {formatCents(closed.payoutCents)}</Text>
          <ReceiptSender job={job} onDone={onClose} />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!drawing}
        >
          <View style={styles.row}>
            <TouchableOpacity style={seg(mode === 'charge')} disabled={locked} onPress={() => setMode('charge')}>
              <Text style={styles.segText}>Repair done</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={seg(mode === 'diagnostic_only')}
              disabled={locked}
              onPress={() => setMode('diagnostic_only')}
            >
              <Text style={styles.segText}>Diagnostic only</Text>
            </TouchableOpacity>
          </View>

          {/* The receipt the customer reads and signs. */}
          <View style={styles.receipt}>
            <View style={styles.receiptHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rBrand}>Adaptivity Performance</Text>
                <Text style={styles.rMuted}>
                  {job.customer} · {job.vehicle}
                </Text>
              </View>
              <Text style={styles.rMuted}>{job.referenceCode}</Text>
            </View>

            <View style={styles.rLine}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rLabel}>Diagnostic</Text>
                {mode === 'charge' && !locked && (
                  <TouchableOpacity onPress={() => setDiagChoice(collectDiag ? 'credit' : 'collect')}>
                    <Text style={styles.rLink}>
                      {collectDiag ? 'Credit toward the repair instead' : 'Credited to repair · charge it instead'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.rAmount, !collectDiag && styles.struck]}>{formatCents(diagnosticFeeCents)}</Text>
            </View>

            {mode === 'charge' &&
              lines.map((l, i) => (
                <View key={i} style={styles.rLineCol}>
                  <View style={styles.row}>
                    <TextInput
                      style={[styles.rInput, { flex: 1 }]}
                      value={l.title}
                      editable={!locked}
                      onChangeText={(t) => setLine(i, { title: t })}
                      placeholder="What you did, e.g. Front pads & rotors"
                      placeholderTextColor="#a1a1aa"
                    />
                    {lines.length > 1 && !locked && (
                      <TouchableOpacity
                        onPress={() => setLines((cur) => cur.filter((_, j) => j !== i))}
                        accessibilityLabel={`Remove line ${i + 1}`}
                        hitSlop={8}
                      >
                        <Text style={styles.remove}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rSmall}>Labor $</Text>
                      <TextInput
                        style={styles.rInput}
                        value={l.labor}
                        editable={!locked}
                        keyboardType="decimal-pad"
                        onChangeText={(t) => setLine(i, { labor: t })}
                        placeholder="0.00"
                        placeholderTextColor="#a1a1aa"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rSmall}>Parts $</Text>
                      <TextInput
                        style={styles.rInput}
                        value={l.parts}
                        editable={!locked}
                        keyboardType="decimal-pad"
                        onChangeText={(t) => setLine(i, { parts: t })}
                        placeholder="0.00"
                        placeholderTextColor="#a1a1aa"
                      />
                    </View>
                  </View>
                </View>
              ))}
            {mode === 'charge' && lines.length < 20 && !locked && (
              <TouchableOpacity onPress={() => setLines((cur) => [...cur, EMPTY_LINE])} style={styles.addLine}>
                <Text style={styles.rLink}>+ Add line</Text>
              </TouchableOpacity>
            )}

            {!shop && (
              <View style={styles.rLine}>
                <Text style={[styles.rLabel, { flex: 1 }]}>Travel</Text>
                <Text style={[styles.rAmount, member && styles.struck]}>{formatCents(TRAVEL_FEE_DOLLARS * 100)}</Text>
              </View>
            )}
            {closeOut.taxCents > 0 && (
              <View style={styles.rLine}>
                <Text style={[styles.rLabel, { flex: 1 }]}>
                  Sales tax 8.25%{taxMode === 'parts' ? ' on parts' : ''}
                </Text>
                <Text style={styles.rAmount}>{formatCents(closeOut.taxCents)}</Text>
              </View>
            )}
            <View style={styles.rTotal}>
              <Text style={styles.rTotalLabel}>Total</Text>
              <Text style={styles.rTotalAmount}>{formatCents(closeOut.totalCents)}</Text>
            </View>

            <View style={styles.signArea}>
              <SignaturePad
                ref={padRef}
                disabled={locked}
                onChange={setSigned}
                onDrawingChange={setDrawing}
                height={150}
              />
              <Text style={styles.rSmall}>Name of person signing</Text>
              <TextInput
                style={styles.rInput}
                value={signerName}
                editable={!locked}
                onChangeText={setSignerName}
                autoComplete="off"
              />
              <Text style={styles.rApprove}>
                I approve the work above and the total of {formatCents(closeOut.totalCents)}, paid in person.
              </Text>
            </View>
          </View>

          <Text style={styles.cap}>Settings for this job</Text>
          {!shop && (
            <View style={styles.setting}>
              <Text style={styles.settingText}>Member — waive travel</Text>
              <Switch value={member} disabled={locked} onValueChange={setMember} />
            </View>
          )}
          {mode === 'charge' && (
            <>
              <View style={styles.setting}>
                <Text style={styles.settingText}>Parts bought by</Text>
                <View style={[styles.row, { width: 170 }]}>
                  <TouchableOpacity style={seg(partsBy === 'tech')} disabled={locked} onPress={() => setPartsBy('tech')}>
                    <Text style={styles.segText}>Me</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={seg(partsBy === 'company')}
                    disabled={locked}
                    onPress={() => setPartsBy('company')}
                  >
                    <Text style={styles.segText}>Company</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.setting}>
                <Text style={styles.settingText}>Tax on</Text>
                <View style={[styles.row, { width: 200 }]}>
                  {(['parts', 'total', 'none'] as const).map((m) => (
                    <TouchableOpacity key={m} style={seg(taxMode === m)} disabled={locked} onPress={() => setTaxMode(m)}>
                      <Text style={styles.segText}>{m === 'parts' ? 'Parts' : m === 'total' ? 'Total' : 'None'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}
          <View style={styles.card}>
            <Text style={styles.cap}>Notes on the receipt (optional)</Text>
            <TextInput
              style={styles.notes}
              value={notes}
              editable={!locked}
              onChangeText={setNotes}
              multiline
              placeholder="e.g. Rear pads at 4 mm — replace within 6 months"
              placeholderTextColor={colors.text.muted}
            />
          </View>
          <View style={[styles.card, styles.payout]}>
            <Text style={styles.payoutText}>Your payout</Text>
            <Text style={styles.payoutText}>{formatCents(closeOut.techPayoutCents)}</Text>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Text style={styles.payLabel}>How is the customer paying?</Text>
          <View style={styles.row}>
            {(['card', 'zelle', 'cash'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={seg(payMethod === m)}
                disabled={busy !== null || (Boolean(charged) && m !== 'card')}
                onPress={() => setPayMethod(m)}
              >
                <Text style={styles.segText}>{METHOD_TAB[m]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {payMethod === 'card' && (
            <>
              <TouchableOpacity
                style={[styles.cardBtn, !card.available && styles.dim]}
                disabled={busy !== null || !card.available}
                onPress={() => void payByCard()}
              >
                {busy === 'card' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.cardBtnText}>
                    {charged ? 'Finish closing the job (card already charged)' : `${cardLabel} · ${formatCents(closeOut.totalCents)}`}
                  </Text>
                )}
              </TouchableOpacity>
              {!card.available && <Text style={styles.hint}>{card.reason}</Text>}

              {!charged && (
                <TouchableOpacity
                  style={[styles.otherBtn, (!!problem || busy !== null) && styles.dim]}
                  disabled={!!problem || busy !== null}
                  onPress={() => confirmPaid('square_app')}
                >
                  {busy === 'other' ? (
                    <ActivityIndicator color={colors.text.primary} />
                  ) : (
                    <Text style={styles.otherBtnText}>Charged on the Square app instead</Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}

          {payMethod === 'zelle' && (
            <View style={[styles.card, styles.zelleCard]}>
              <Text style={styles.zelleAmount}>{formatCents(closeOut.totalCents)}</Text>
              {zelle?.qrPayload ? (
                <View style={styles.qrWrap}>
                  <QrCode value={zelle.qrPayload} size={220} />
                </View>
              ) : (
                <Text style={styles.hint}>
                  {zelle ? 'The company Zelle QR code isn’t set up yet — ask an admin.' : 'Loading Zelle details…'}
                </Text>
              )}
              <Text style={styles.zelleStep}>
                1. Customer opens their bank app → Zelle → scan this code
                {zelle?.recipient ? ` (or send to ${zelle.recipient})` : ''}.
              </Text>
              <Text style={styles.zelleStep}>
                2. They send exactly {formatCents(closeOut.totalCents)} to {zelleName(zelle)} with memo {job.referenceCode}.
              </Text>
              <Text style={styles.zelleStep}>3. Check the confirmation on their screen, then tap below.</Text>
              <TouchableOpacity
                style={[styles.cardBtn, (!!problem || busy !== null) && styles.dim]}
                disabled={busy !== null}
                onPress={() => confirmPaid('zelle')}
              >
                {busy === 'other' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.cardBtnText}>Zelle received · {formatCents(closeOut.totalCents)}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {payMethod === 'cash' && (
            <TouchableOpacity
              style={[styles.cardBtn, (!!problem || busy !== null) && styles.dim]}
              disabled={busy !== null}
              onPress={() => confirmPaid('cash')}
            >
              {busy === 'other' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.cardBtnText}>Cash received · {formatCents(closeOut.totalCents)}</Text>
              )}
            </TouchableOpacity>
          )}
          <Text style={styles.hint}>
            {problem ?? (charged ? 'Card charged — finish closing to save it.' : 'Ready — choose how the customer paid.')}
          </Text>
        </ScrollView>
      )}
      <TapToPaySetupModal visible={tapToPaySetupOpen} onClose={() => setTapToPaySetupOpen(false)} />
    </SheetModal>
  );
};

/** Text and/or email the customer their receipt, same as the web portal. */
const ReceiptSender: React.FC<{ job: DispatchBooking; onDone: () => void }> = ({ job, onDone }) => {
  const [byText, setByText] = useState(Boolean(job.phone));
  const [byEmail, setByEmail] = useState(Boolean(job.customerEmail));
  const [phone, setPhone] = useState(job.phone || '');
  const [email, setEmail] = useState(job.customerEmail || '');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ReceiptSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const channels: ('sms' | 'email')[] = [
      ...(byText ? (['sms'] as const) : []),
      ...(byEmail ? (['email'] as const) : []),
    ];
    if (!channels.length) return;
    setSending(true);
    setError(null);
    try {
      const r = await sendReceipt(job.id, channels, { phone, email });
      setResult(r);
      if (r.sms?.status === 'skipped') await openDeviceSms(phone, r.smsBody);
      else if (r.email?.status === 'skipped') await openDeviceEmail(email, r.subject, r.emailText);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the receipt');
    } finally {
      setSending(false);
    }
  };

  const status = (label: string, r?: ReceiptSendResult['sms']) =>
    r ? (
      <Text style={styles.settingText}>
        {label}:{' '}
        {r.status === 'sent'
          ? `sent to ${r.to}`
          : r.status === 'skipped'
            ? `business ${label.toLowerCase()} isn’t set up — sending from your phone`
            : r.detail || 'failed'}
      </Text>
    ) : null;

  return (
    <View style={[styles.card, { gap: spacing.sm }]}>
      <Text style={styles.sendTitle}>Send the receipt</Text>
      <View style={styles.setting}>
        <Switch value={byText} onValueChange={setByText} />
        <TextInput
          style={[styles.notes, { flex: 1, minHeight: 44 }]}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="Customer’s mobile"
          placeholderTextColor={colors.text.muted}
        />
      </View>
      <View style={styles.setting}>
        <Switch value={byEmail} onValueChange={setByEmail} />
        <TextInput
          style={[styles.notes, { flex: 1, minHeight: 44 }]}
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (t.trim()) setByEmail(true);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="Customer’s email"
          placeholderTextColor={colors.text.muted}
        />
      </View>
      {result && (
        <View style={{ gap: 4 }}>
          {status('Text', result.sms)}
          {status('Email', result.email)}
          {result.sms?.status === 'skipped' && result.email?.status === 'skipped' && (
            <TouchableOpacity onPress={() => void openDeviceEmail(email, result.subject, result.emailText)}>
              <Text style={styles.link}>Now open the email on your phone</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.cardBtn, { flex: 1, marginTop: 0 }, (sending || (!byText && !byEmail)) && styles.dim]}
          disabled={sending || (!byText && !byEmail)}
          onPress={() => void send()}
        >
          <Text style={styles.cardBtnText}>{sending ? 'Sending…' : result ? 'Send again' : 'Send receipt'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.otherBtn, { marginTop: 0, paddingHorizontal: 20 }]} onPress={onDone}>
          <Text style={styles.otherBtnText}>{result ? 'Done' : 'Skip'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 48, gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  dim: { opacity: 0.5 },
  seg: {
    flex: 1,
    minHeight: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  segOn: { backgroundColor: 'rgba(249,115,22,0.2)', borderColor: colors.brand.orange },
  segText: { color: colors.text.primary, fontSize: 13, fontWeight: '700' },

  receipt: { backgroundColor: '#fafaf9', borderRadius: 18, padding: spacing.lg },
  receiptHead: { flexDirection: 'row', gap: spacing.sm, paddingBottom: 8 },
  rBrand: { color: '#18181b', fontSize: 15, fontWeight: '800' },
  rMuted: { color: '#52525b', fontSize: 12 },
  rLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#d4d4d8',
    borderStyle: 'dashed',
  },
  rLineCol: { gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#d4d4d8', borderStyle: 'dashed' },
  rLabel: { color: '#18181b', fontSize: 15, fontWeight: '700' },
  rLink: { color: '#c2410c', fontSize: 12, fontWeight: '700', marginTop: 2 },
  rAmount: { color: '#18181b', fontSize: 15, fontWeight: '700' },
  struck: { color: '#a1a1aa', textDecorationLine: 'line-through' },
  rInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#d4d4d8',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#18181b',
    fontSize: 15,
  },
  rSmall: { color: '#52525b', fontSize: 12, marginBottom: 4, marginTop: 4 },
  remove: { color: '#71717a', fontSize: 16, paddingHorizontal: 6 },
  addLine: { paddingVertical: 10 },
  rTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 16 },
  rTotalLabel: { color: '#18181b', fontSize: 16, fontWeight: '800' },
  rTotalAmount: { color: '#18181b', fontSize: 30, fontWeight: '800' },
  signArea: { marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#e4e4e7', gap: 4 },
  rApprove: { color: '#52525b', fontSize: 12, lineHeight: 17, marginTop: 6 },

  cap: { color: colors.text.secondary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  card: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    minHeight: 52,
  },
  settingText: { color: colors.text.primary, fontSize: 14, flexShrink: 1 },
  notes: {
    minHeight: 60,
    marginTop: 6,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text.primary,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  payout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderColor: 'rgba(16,185,129,0.3)',
  },
  payoutText: { color: '#a7f3d0', fontSize: 16, fontWeight: '800' },
  error: {
    color: '#fecaca',
    fontSize: 13,
    lineHeight: 18,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  cardBtn: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: colors.brand.orange,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  cardBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  otherBtn: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otherBtnText: { color: colors.text.primary, fontSize: 15, fontWeight: '700' },
  hint: { color: colors.text.muted, fontSize: 12, textAlign: 'center' },
  payLabel: { color: colors.text.secondary, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginTop: spacing.sm },
  zelleCard: { alignItems: 'stretch', gap: spacing.sm },
  zelleAmount: { color: colors.text.primary, fontSize: 28, fontWeight: '900', textAlign: 'center' },
  qrWrap: { alignSelf: 'center', padding: 8, backgroundColor: '#fff', borderRadius: borderRadius.md },
  zelleStep: { color: colors.text.secondary, fontSize: 13, lineHeight: 19 },
  closedTitle: { color: colors.text.primary, fontSize: 22, fontWeight: '800' },
  closedPayout: { color: '#a7f3d0', fontSize: 15 },
  sendTitle: { color: colors.text.primary, fontSize: 17, fontWeight: '800' },
  link: { color: colors.brand.orange, fontSize: 14, fontWeight: '700' },
});
