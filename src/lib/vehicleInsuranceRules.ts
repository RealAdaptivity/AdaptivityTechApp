/** Pure rules behind the vehicle insurance disclosure.
 *
 *  Separate from the service so the expiry and validation logic can be unit
 *  tested without a Supabase client, a browser or a signed-in user — the same
 *  reason bookingConfirmation.ts is kept out of the edge function.
 */

import type { DisclosureFieldKey } from '../content/vehicleInsuranceDisclosure';

export type DisclosureValues = Record<DisclosureFieldKey, string>;

export const EMPTY_DISCLOSURE: DisclosureValues = {
  vehicleDescription: '',
  licensePlate: '',
  licensePlateState: '',
  insuranceCarrier: '',
  policyNumber: '',
  policyExpiresOn: '',
};

export type DisclosureStatus = {
  /** Current means: signed against this version AND the policy has not expired. */
  current: boolean;
  /** On file but against an older version of the document. */
  staleVersion: boolean;
  /** On file, but the policy it discloses has run out. */
  policyExpired: boolean;
  signedAt: string | null;
  signerName: string | null;
  signaturePath: string | null;
  disclosureVersion: string | null;
  policyExpiresOn: string | null;
  values: DisclosureValues | null;
};

export const NO_DISCLOSURE: DisclosureStatus = {
  current: false,
  staleVersion: false,
  policyExpired: false,
  signedAt: null,
  signerName: null,
  signaturePath: null,
  disclosureVersion: null,
  policyExpiresOn: null,
  values: null,
};

/** 'YYYY-MM-DD' compared as a date, not a string, and never through
 *  `new Date(iso)` — that parses as UTC midnight and reads as the previous day
 *  in Texas, which would expire a policy a day early. */
export function isPolicyExpired(iso: string | null, today = new Date()): boolean {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return true;
  const [y, m, d] = iso.trim().split('-').map(Number);
  const expires = new Date(y, m - 1, d);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Expiring today still counts as covered; cover lapses the day after.
  return expires.getTime() < startOfToday.getTime();
}

export type DisclosureFieldError = { field: DisclosureFieldKey | 'signerName' | 'signature'; message: string };

/** Every problem at once, so the technician is not made to resubmit six times
 *  to discover them one by one. */
export function validateDisclosure(
  values: DisclosureValues,
  signerName: string,
  signatureDataUrl: string,
  today = new Date()
): DisclosureFieldError[] {
  const errors: DisclosureFieldError[] = [];

  if (!values.vehicleDescription.trim()) errors.push({ field: 'vehicleDescription', message: 'Required' });
  if (!values.licensePlate.trim()) errors.push({ field: 'licensePlate', message: 'Required' });

  const state = values.licensePlateState.trim();
  if (!state) errors.push({ field: 'licensePlateState', message: 'Required' });
  else if (!/^[A-Za-z]{2}$/.test(state)) {
    errors.push({ field: 'licensePlateState', message: 'Two letters, e.g. TX' });
  }

  if (!values.insuranceCarrier.trim()) errors.push({ field: 'insuranceCarrier', message: 'Required' });
  if (!values.policyNumber.trim()) errors.push({ field: 'policyNumber', message: 'Required' });

  const expires = values.policyExpiresOn.trim();
  if (!expires) errors.push({ field: 'policyExpiresOn', message: 'Required' });
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
    errors.push({ field: 'policyExpiresOn', message: 'Enter a date' });
  } else if (isPolicyExpired(expires, today)) {
    // Filing a disclosure for a policy that has already lapsed is not proof of
    // insurance, so it is refused at the form rather than stored and trusted.
    errors.push({ field: 'policyExpiresOn', message: 'That policy has already expired' });
  }

  if (signerName.trim().length < 2) {
    errors.push({ field: 'signerName', message: 'Enter your full legal name' });
  }
  if (!signatureDataUrl.startsWith('data:image/')) {
    errors.push({ field: 'signature', message: 'Draw your signature before submitting' });
  }

  return errors;
}

