import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../theme/colors';
import {
  COMPANY_REPRESENTATIVE_NAME,
  COMPANY_REPRESENTATIVE_TITLE,
  DISCLOSURE_ACKNOWLEDGEMENT,
  DISCLOSURE_FIELDS,
  DISCLOSURE_INTRO,
  DISCLOSURE_SECTIONS,
  DISCLOSURE_TITLE,
  VEHICLE_INSURANCE_DISCLOSURE_VERSION,
} from '../content/vehicleInsuranceDisclosure';
import {
  EMPTY_DISCLOSURE,
  signVehicleInsuranceDisclosure,
  validateDisclosure,
  type DisclosureValues,
} from '../lib/vehicleInsuranceDisclosure';
import { SheetModal } from './SheetModal';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';
import { docStyles } from './docStyles';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSigned: (result: { signedAt: string; signerName: string; signaturePath: string }) => void;
  /** Pre-fills the form when re-signing after a renewal. */
  initialValues?: DisclosureValues | null;
};

/** Read, disclose, then sign — same order and fields as the web portal. */
export const VehicleInsuranceDisclosureModal: React.FC<Props> = ({
  visible,
  onClose,
  onSigned,
  initialValues,
}) => {
  const padRef = useRef<SignaturePadHandle>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [values, setValues] = useState<DisclosureValues>(EMPTY_DISCLOSURE);
  const [signerName, setSignerName] = useState('');
  const [ack, setAck] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [readToEnd, setReadToEnd] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
  const [termsEndY, setTermsEndY] = useState(0);

  useEffect(() => {
    if (!visible) return;
    // A renewal keeps the vehicle and carrier; the new expiry must be typed fresh.
    setValues(initialValues ? { ...initialValues, policyExpiresOn: '' } : EMPTY_DISCLOSURE);
    setSignerName('');
    setAck(false);
    setHasStroke(false);
    setReadToEnd(false);
    setError(null);
    setFieldErrors({});
  }, [visible, initialValues]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (readToEnd || !termsEndY) return;
    const { contentOffset, layoutMeasurement } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= termsEndY - 24) setReadToEnd(true);
  };

  const setField = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async () => {
    setError(null);
    if (!readToEnd) return setError('Scroll to the end of the agreement before signing.');
    const problems = validateDisclosure(values, signerName, hasStroke ? 'data:image/png' : '');
    if (problems.length) {
      const byField: Partial<Record<string, string>> = {};
      for (const p of problems) byField[p.field] = p.message;
      setFieldErrors(byField);
      return setError('Check the highlighted fields.');
    }
    if (!ack) return setError('Tick the acknowledgement to certify the statement above.');

    setBusy(true);
    try {
      const fileUri = await padRef.current!.toPngFile();
      const result = await signVehicleInsuranceDisclosure({ values, signerName, signatureFileUri: fileUri });
      onSigned(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not file your disclosure');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title={DISCLOSURE_TITLE}
      subtitle={`Version ${VEHICLE_INSURANCE_DISCLOSURE_VERSION}`}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={docStyles.scroll}
        onScroll={onScroll}
        scrollEventThrottle={64}
        scrollEnabled={!drawing}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={docStyles.step}>Step 1 · Read</Text>
        <Text style={docStyles.para}>{DISCLOSURE_INTRO}</Text>
        {DISCLOSURE_SECTIONS.map((section) => (
          <View key={section.heading} style={docStyles.section}>
            <Text style={docStyles.heading}>{section.heading}</Text>
            {section.blocks.map((block, i) =>
              block.kind === 'p' ? (
                <Text key={i} style={docStyles.para}>
                  {block.text}
                </Text>
              ) : (
                <View key={i} style={docStyles.list}>
                  {block.items.map((item) => (
                    <Text key={item} style={docStyles.para}>
                      • {item}
                    </Text>
                  ))}
                </View>
              )
            )}
          </View>
        ))}
        <View onLayout={(e) => setTermsEndY(e.nativeEvent.layout.y)} />

        {readToEnd ? (
          <Text style={docStyles.unlocked}>You’ve read to the end. Fill in your details below.</Text>
        ) : (
          <TouchableOpacity
            style={docStyles.jump}
            onPress={() => scrollRef.current?.scrollTo({ y: Math.max(0, termsEndY - 200), animated: true })}
          >
            <Text style={docStyles.jumpText}>Scroll to the end to unlock signing — tap to jump</Text>
          </TouchableOpacity>
        )}

        <View style={[docStyles.signBox, !readToEnd && styles.locked]} pointerEvents={readToEnd ? 'auto' : 'none'}>
          <Text style={docStyles.step}>Step 2 · Your vehicle & insurance</Text>
          {DISCLOSURE_FIELDS.map((f) => (
            <View key={f.key}>
              <Text style={docStyles.label}>{f.label}</Text>
              <TextInput
                style={[docStyles.input, fieldErrors[f.key] && docStyles.inputError]}
                value={values[f.key]}
                maxLength={f.type === 'date' ? 10 : f.maxLength}
                placeholder={f.type === 'date' ? 'YYYY-MM-DD' : f.placeholder}
                placeholderTextColor={colors.text.muted}
                keyboardType={f.type === 'date' ? 'numbers-and-punctuation' : 'default'}
                autoCapitalize={f.key === 'licensePlate' || f.key === 'licensePlateState' ? 'characters' : 'words'}
                editable={readToEnd}
                onChangeText={(t) =>
                  setField(f.key, f.key === 'licensePlateState' ? t.toUpperCase() : t)
                }
              />
              {!!fieldErrors[f.key] && <Text style={docStyles.fieldError}>{fieldErrors[f.key]}</Text>}
            </View>
          ))}

          <Text style={[docStyles.para, { marginTop: 12 }]}>{DISCLOSURE_ACKNOWLEDGEMENT}</Text>

          <Text style={docStyles.label}>Your Full Legal Name</Text>
          <TextInput
            style={[docStyles.input, fieldErrors.signerName && docStyles.inputError]}
            value={signerName}
            onChangeText={(t) => {
              setSignerName(t);
              setFieldErrors((x) => ({ ...x, signerName: undefined }));
            }}
            placeholder="As it appears on your ID"
            placeholderTextColor={colors.text.muted}
            editable={readToEnd}
            autoCapitalize="words"
          />
          {!!fieldErrors.signerName && <Text style={docStyles.fieldError}>{fieldErrors.signerName}</Text>}

          <Text style={docStyles.label}>Signature</Text>
          <SignaturePad
            ref={padRef}
            disabled={!readToEnd}
            onChange={(v) => {
              setHasStroke(v);
              setFieldErrors((x) => ({ ...x, signature: undefined }));
            }}
            onDrawingChange={setDrawing}
          />
          {!!fieldErrors.signature && <Text style={docStyles.fieldError}>{fieldErrors.signature}</Text>}

          <Text style={docStyles.label}>Company representative</Text>
          <Text style={docStyles.readonly}>
            {COMPANY_REPRESENTATIVE_NAME}, {COMPANY_REPRESENTATIVE_TITLE}
          </Text>

          <TouchableOpacity style={docStyles.ackRow} onPress={() => setAck((v) => !v)} activeOpacity={0.8}>
            <Text style={docStyles.ackBox}>{ack ? '☑' : '☐'}</Text>
            <Text style={docStyles.ackText}>
              I have read this agreement, my insurer has been notified of my business use, and I will keep active
              primary coverage while performing work.
            </Text>
          </TouchableOpacity>

          {error && <Text style={docStyles.error}>{error}</Text>}

          <TouchableOpacity
            style={[docStyles.submit, (busy || !readToEnd) && { opacity: 0.6 }]}
            disabled={busy || !readToEnd}
            onPress={() => void submit()}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={docStyles.submitText}>Sign & file disclosure</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SheetModal>
  );
};

const styles = StyleSheet.create({
  locked: { opacity: 0.45 },
});
