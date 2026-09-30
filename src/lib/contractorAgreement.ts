/** Contractor agreement digital signature — same records the web portal writes. */

import { supabase, ensureTechProfile } from './supabase';
import { deviceUserAgent, uploadSignaturePng } from './signatureUpload';

/**
 * Must match CONTRACTOR_AGREEMENT_VERSION in the website
 * (src/services/contractorAgreement.ts). A signature only counts if it was
 * made against this exact version — the database claim gate refuses others.
 */
export const CONTRACTOR_AGREEMENT_VERSION = '2026-09-v3';

export type ContractorAgreementStatus = {
  /** True only for a signature made against CONTRACTOR_AGREEMENT_VERSION. */
  signed: boolean;
  signedAt: string | null;
  signerName: string | null;
  signaturePath: string | null;
  agreementVersion: string | null;
};

export const NO_AGREEMENT: ContractorAgreementStatus = {
  signed: false,
  signedAt: null,
  signerName: null,
  signaturePath: null,
  agreementVersion: null,
};

export async function fetchContractorAgreementStatus(): Promise<ContractorAgreementStatus> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NO_AGREEMENT;

  const { data } = await supabase
    .from('mechanic_details')
    .select(
      'contractor_agreement_signed_at, contractor_agreement_signer_name, contractor_agreement_signature_path, contractor_agreement_version'
    )
    .eq('profile_id', user.id)
    .maybeSingle();

  if (data?.contractor_agreement_signed_at && data?.contractor_agreement_signature_path) {
    const version = (data.contractor_agreement_version as string) || null;
    return {
      signed: version === CONTRACTOR_AGREEMENT_VERSION,
      signedAt: data.contractor_agreement_signed_at as string,
      signerName: (data.contractor_agreement_signer_name as string) || null,
      signaturePath: data.contractor_agreement_signature_path as string,
      agreementVersion: version,
    };
  }

  const { data: sig } = await supabase
    .from('contractor_agreement_signatures')
    .select('signed_at, signer_name, signature_path, agreement_version')
    .eq('profile_id', user.id)
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sig?.signed_at && sig?.signature_path) {
    const version = (sig.agreement_version as string) || null;
    return {
      signed: version === CONTRACTOR_AGREEMENT_VERSION,
      signedAt: sig.signed_at as string,
      signerName: (sig.signer_name as string) || null,
      signaturePath: sig.signature_path as string,
      agreementVersion: version,
    };
  }

  return {
    signed: false,
    signedAt: (data?.contractor_agreement_signed_at as string) || null,
    signerName: (data?.contractor_agreement_signer_name as string) || null,
    signaturePath: null,
    agreementVersion: (data?.contractor_agreement_version as string) || null,
  };
}

/** Upload the drawn signature PNG and record E-SIGN acceptance. */
export async function signContractorAgreement(opts: {
  signerName: string;
  signatureFileUri: string;
}): Promise<{ signedAt: string; signaturePath: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const name = opts.signerName.trim();
  if (name.length < 2) throw new Error('Enter your full legal name');

  await ensureTechProfile().catch(() => undefined);

  const path = `${user.id}/agreement-${CONTRACTOR_AGREEMENT_VERSION}-${Date.now()}.png`;
  await uploadSignaturePng(path, opts.signatureFileUri);

  const { data, error } = await supabase.rpc('sign_contractor_agreement', {
    p_signer_name: name,
    p_signature_path: path,
    p_user_agent: deviceUserAgent(),
    p_agreement_version: CONTRACTOR_AGREEMENT_VERSION,
  });
  if (error) throw new Error(error.message || 'Failed to record signature');

  return { signedAt: String(data), signaturePath: path };
}
