import React, { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, borderRadius } from '../theme/colors';
import {
  CONTRACTOR_AGREEMENT_VERSION,
  fetchContractorAgreementStatus,
  type ContractorAgreementStatus,
} from '../lib/contractorAgreement';
import { fetchDisclosureStatus, type DisclosureStatus } from '../lib/vehicleInsuranceDisclosure';
import { ContractorAgreementSignModal } from './ContractorAgreementSignModal';
import { VehicleInsuranceDisclosureModal } from './VehicleInsuranceDisclosureModal';

type Props = {
  /** Bumped by the parent (e.g. after signing in Settings) to re-check. */
  refreshKey?: number;
  onChanged?: () => void;
};

/**
 * The two documents a tech must have current before field work, surfaced
 * above every tab the same way the web portal does. Neither banner blocks the
 * app — the database claim gate is the enforcement point — but they stay up
 * until the document is signed and current.
 */
export const RequiredDocumentGates: React.FC<Props> = ({ refreshKey, onChanged }) => {
  const [agreement, setAgreement] = useState<ContractorAgreementStatus | null>(null);
  const [disclosure, setDisclosure] = useState<DisclosureStatus | null>(null);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);

  const load = useCallback(async () => {
    const [a, d] = await Promise.all([
      fetchContractorAgreementStatus().catch(() => null),
      fetchDisclosureStatus().catch(() => null),
    ]);
    setAgreement(a);
    setDisclosure(d);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    // Signed on the website meanwhile? Pick it up when the app comes back.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void load();
    });
    return () => sub.remove();
  }, [load]);

  const needsAgreement = agreement && !(agreement.signed && agreement.signaturePath);
  const needsDisclosure = disclosure && !disclosure.current;

  let agreementHeadline = 'Sign your contractor agreement to start claiming jobs';
  let agreementDetail =
    'Read the full 1099 terms — pay split, liability, insurance, warranty and taxes — then sign. It takes about two minutes and is required before your first job.';
  if (agreement?.signedAt && agreement.agreementVersion !== CONTRACTOR_AGREEMENT_VERSION) {
    agreementHeadline = 'The contractor agreement has been updated';
    agreementDetail = `You signed ${agreement.agreementVersion || 'an earlier version'}. Read version ${CONTRACTOR_AGREEMENT_VERSION} and sign it to keep claiming jobs.`;
  } else if (agreement?.signedAt && !agreement.signaturePath) {
    agreementHeadline = 'Finish signing your contractor agreement';
    agreementDetail =
      'We have your acceptance on file but no signature image. Read the agreement and add your signature so we have a signed copy.';
  }

  const disclosureHeadline = disclosure?.policyExpired
    ? 'Your insurance policy on file has expired'
    : disclosure?.staleVersion
      ? 'The vehicle insurance disclosure has been updated'
      : 'File your personal vehicle insurance disclosure';
  const disclosureDetail = disclosure?.policyExpired
    ? `The policy you disclosed expired on ${disclosure.policyExpiresOn}. File your renewed policy details so your coverage record stays current.`
    : disclosure?.staleVersion
      ? 'The disclosure has changed since you last signed it. Read the current version and sign it again.'
      : 'Required before field dispatch: your vehicle, plate, insurer and policy details, plus your signature. It takes about a minute.';

  return (
    <>
      {needsAgreement && (
        <View style={[styles.banner, styles.amber]}>
          <Text style={[styles.headline, { color: '#fde68a' }]}>📝 {agreementHeadline}</Text>
          <Text style={[styles.detail, { color: 'rgba(253,230,138,0.8)' }]}>{agreementDetail}</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.brand.amber }]} onPress={() => setAgreementOpen(true)}>
            <Text style={styles.btnText}>Read & sign the agreement →</Text>
          </TouchableOpacity>
        </View>
      )}
      {needsDisclosure && (
        <View style={[styles.banner, styles.sky]}>
          <Text style={[styles.headline, { color: '#e0f2fe' }]}>🚗 {disclosureHeadline}</Text>
          <Text style={[styles.detail, { color: 'rgba(186,230,253,0.8)' }]}>{disclosureDetail}</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: '#38bdf8' }]} onPress={() => setDisclosureOpen(true)}>
            <Text style={styles.btnText}>
              {disclosure?.signedAt ? 'Update my insurance details →' : 'Read & sign the disclosure →'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <ContractorAgreementSignModal
        visible={agreementOpen}
        onClose={() => setAgreementOpen(false)}
        onSigned={() => {
          void load();
          onChanged?.();
        }}
      />
      <VehicleInsuranceDisclosureModal
        visible={disclosureOpen}
        onClose={() => setDisclosureOpen(false)}
        initialValues={disclosure?.values}
        onSigned={() => {
          void load();
          onChanged?.();
        }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  banner: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  amber: { borderColor: 'rgba(245,158,11,0.4)', backgroundColor: 'rgba(245,158,11,0.1)' },
  sky: { borderColor: 'rgba(14,165,233,0.4)', backgroundColor: 'rgba(14,165,233,0.1)' },
  headline: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  detail: { fontSize: 11, lineHeight: 16 },
  btn: { marginTop: spacing.sm, borderRadius: borderRadius.md, paddingVertical: 11, alignItems: 'center' },
  btnText: { color: '#12141c', fontSize: 12, fontWeight: '800' },
});
