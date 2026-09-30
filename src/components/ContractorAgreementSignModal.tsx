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
import { CONTRACTOR_AGREEMENT_SECTIONS } from '../content/contractorAgreementText';
import { LEGAL_ENTITY_NAME } from '../content/businessIdentity';
import {
  CONTRACTOR_AGREEMENT_VERSION,
  signContractorAgreement,
} from '../lib/contractorAgreement';
import { SheetModal } from './SheetModal';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';
import { docStyles } from './docStyles';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSigned: (result: { signedAt: string; signerName: string; signaturePath: string }) => void;
};

/**
 * Read, then sign — same order as the web portal. Signing stays locked until
 * the contractor has scrolled to the end of the agreement.
 */
export const ContractorAgreementSignModal: React.FC<Props> = ({ visible, onClose, onSigned }) => {
  const padRef = useRef<SignaturePadHandle>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [signerName, setSignerName] = useState('');
  const [ack, setAck] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [readToEnd, setReadToEnd] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsEndY, setTermsEndY] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setSignerName('');
    setAck(false);
    setHasStroke(false);
    setReadToEnd(false);
    setError(null);
  }, [visible]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (readToEnd || !termsEndY) return;
    const { contentOffset, layoutMeasurement } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= termsEndY - 24) setReadToEnd(true);
  };

  const submit = async () => {
    setError(null);
    if (!readToEnd) return setError('Scroll to the end of the agreement before signing.');
    if (signerName.trim().length < 2) return setError('Enter your full legal name as it appears on your ID.');
    if (!hasStroke) return setError('Draw your signature in the box.');
    if (!ack) return setError('Check the box to confirm you agree to the terms.');
    setBusy(true);
    try {
      const fileUri = await padRef.current!.toPngFile();
      const result = await signContractorAgreement({ signerName, signatureFileUri: fileUri });
      onSigned({ signedAt: result.signedAt, signerName: signerName.trim(), signaturePath: result.signaturePath });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save signature');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title="Independent Contractor Agreement"
      subtitle={`${LEGAL_ENTITY_NAME} · Version ${CONTRACTOR_AGREEMENT_VERSION} · E-SIGN Act`}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={docStyles.scroll}
        onScroll={onScroll}
        scrollEventThrottle={64}
        scrollEnabled={!drawing}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={docStyles.step}>Step 1 · Read the agreement</Text>
        {CONTRACTOR_AGREEMENT_SECTIONS.map((section) => (
          <View key={section.heading} style={docStyles.section}>
            <Text style={docStyles.heading}>{section.heading}</Text>
            {section.blocks.map((block, i) =>
              block.kind === 'p' ? (
                <Text key={i} style={docStyles.para}>
                  {block.text}
                </Text>
              ) : (
                <View key={i} style={docStyles.list}>
                  {block.items.map((item, n) => (
                    <Text key={n} style={docStyles.para}>
                      {block.kind === 'ol' ? `${n + 1}. ` : '• '}
                      {item}
                    </Text>
                  ))}
                </View>
              )
            )}
          </View>
        ))}
        <View onLayout={(e) => setTermsEndY(e.nativeEvent.layout.y)}>
          <Text style={docStyles.end}>End of agreement · Version {CONTRACTOR_AGREEMENT_VERSION}</Text>
        </View>

        {readToEnd ? (
          <Text style={docStyles.unlocked}>You’ve read to the end. Signing is unlocked below.</Text>
        ) : (
          <TouchableOpacity
            style={docStyles.jump}
            onPress={() => scrollRef.current?.scrollTo({ y: Math.max(0, termsEndY - 200), animated: true })}
          >
            <Text style={docStyles.jumpText}>Scroll to the end to unlock signing — tap to jump</Text>
          </TouchableOpacity>
        )}

        <View style={[docStyles.signBox, !readToEnd && styles.locked]} pointerEvents={readToEnd ? 'auto' : 'none'}>
          <Text style={docStyles.step}>Step 2 · Sign</Text>
          <Text style={docStyles.label}>Full legal name</Text>
          <TextInput
            style={docStyles.input}
            value={signerName}
            onChangeText={(t) => {
              setSignerName(t);
              setError(null);
            }}
            placeholder="As on your ID / W-9"
            placeholderTextColor={colors.text.muted}
            editable={readToEnd}
            autoCapitalize="words"
          />
          <Text style={docStyles.label}>Signature</Text>
          <SignaturePad
            ref={padRef}
            disabled={!readToEnd}
            onChange={(v) => {
              setHasStroke(v);
              setError(null);
            }}
            onDrawingChange={setDrawing}
          />
          <TouchableOpacity style={docStyles.ackRow} onPress={() => setAck((v) => !v)} activeOpacity={0.8}>
            <Text style={docStyles.ackBox}>{ack ? '☑' : '☐'}</Text>
            <Text style={docStyles.ackText}>
              I have read this Independent Contractor Agreement in full and agree to it. My typed name and drawn
              signature are the legal equivalent of a handwritten signature under the E-SIGN Act.
            </Text>
          </TouchableOpacity>
          {error && <Text style={docStyles.error}>{error}</Text>}
          <TouchableOpacity
            style={[docStyles.submit, (busy || !readToEnd) && { opacity: 0.6 }]}
            disabled={busy || !readToEnd}
            onPress={() => void submit()}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={docStyles.submitText}>Sign & save agreement</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SheetModal>
  );
};

const styles = StyleSheet.create({
  locked: { opacity: 0.45 },
});
