/** Personal vehicle insurance disclosure — same table and bucket as the web portal. */

import { supabase } from './supabase';
import {
  COMPANY_REPRESENTATIVE_NAME,
  COMPANY_REPRESENTATIVE_TITLE,
  VEHICLE_INSURANCE_DISCLOSURE_VERSION,
} from '../content/vehicleInsuranceDisclosure';
import {
  NO_DISCLOSURE,
  isPolicyExpired,
  validateDisclosure,
  type DisclosureStatus,
  type DisclosureValues,
} from './vehicleInsuranceRules';
import { deviceUserAgent, uploadSignaturePng } from './signatureUpload';

export * from './vehicleInsuranceRules';

export async function fetchDisclosureStatus(): Promise<DisclosureStatus> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NO_DISCLOSURE;

  const { data, error } = await supabase
    .from('vehicle_insurance_disclosures')
    .select(
      'signed_at, signer_name, signature_path, disclosure_version, policy_expires_on, vehicle_description, license_plate, license_plate_state, insurance_carrier, policy_number'
    )
    .eq('profile_id', user.id)
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.signed_at) return NO_DISCLOSURE;

  const version = (data.disclosure_version as string) || null;
  const expiresOn = (data.policy_expires_on as string) || null;
  const staleVersion = version !== VEHICLE_INSURANCE_DISCLOSURE_VERSION;
  const policyExpired = isPolicyExpired(expiresOn);

  return {
    current: !staleVersion && !policyExpired,
    staleVersion,
    policyExpired,
    signedAt: data.signed_at as string,
    signerName: (data.signer_name as string) || null,
    signaturePath: (data.signature_path as string) || null,
    disclosureVersion: version,
    policyExpiresOn: expiresOn,
    values: {
      vehicleDescription: (data.vehicle_description as string) || '',
      licensePlate: (data.license_plate as string) || '',
      licensePlateState: (data.license_plate_state as string) || '',
      insuranceCarrier: (data.insurance_carrier as string) || '',
      policyNumber: (data.policy_number as string) || '',
      policyExpiresOn: expiresOn || '',
    },
  };
}

export async function signVehicleInsuranceDisclosure(opts: {
  values: DisclosureValues;
  signerName: string;
  signatureFileUri: string | null;
}): Promise<{ signedAt: string; signaturePath: string; signerName: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  // The shared rules check for a data: URL; the app has a file instead.
  const problems = validateDisclosure(
    opts.values,
    opts.signerName,
    opts.signatureFileUri ? 'data:image/png' : ''
  );
  if (problems.length) throw new Error(problems[0].message);

  const path = `${user.id}/vehicle-insurance-${VEHICLE_INSURANCE_DISCLOSURE_VERSION}-${Date.now()}.png`;
  await uploadSignaturePng(path, opts.signatureFileUri!);

  const signerName = opts.signerName.trim();
  const { data, error } = await supabase
    .from('vehicle_insurance_disclosures')
    .insert({
      profile_id: user.id,
      vehicle_description: opts.values.vehicleDescription.trim(),
      license_plate: opts.values.licensePlate.trim().toUpperCase(),
      license_plate_state: opts.values.licensePlateState.trim().toUpperCase(),
      insurance_carrier: opts.values.insuranceCarrier.trim(),
      policy_number: opts.values.policyNumber.trim(),
      policy_expires_on: opts.values.policyExpiresOn.trim(),
      signer_name: signerName,
      signature_path: path,
      disclosure_version: VEHICLE_INSURANCE_DISCLOSURE_VERSION,
      user_agent: deviceUserAgent(),
      company_representative_name: COMPANY_REPRESENTATIVE_NAME,
      company_representative_title: COMPANY_REPRESENTATIVE_TITLE,
    })
    .select('signed_at')
    .single();
  if (error) throw new Error(error.message || 'Could not record your disclosure');

  return { signedAt: String(data.signed_at), signaturePath: path, signerName };
}
