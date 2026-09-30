/**
 * Personal Vehicle Usage & Insurance Disclosure Agreement, as technicians sign it.
 *
 * One source of truth, the same way the contractor agreement works: the sign
 * modal renders these sections, the printable copy renders these sections, and
 * the archived copy renders these sections. Nobody can be shown one thing and
 * have another filed.
 *
 * Bump VEHICLE_INSURANCE_DISCLOSURE_VERSION whenever this text changes
 * materially — a disclosure signed against an older version stops counting as
 * current and the gate asks for a fresh one.
 *
 * ⚠️  This document says "Employee" and "employment" throughout, while the
 * contractor agreement the same people sign says the opposite — "You are an
 * independent contractor, not an employee". The conflict was raised with the
 * owner, who confirmed the wording stays as "Employee". Recorded here so the
 * next person to read these two documents together knows it is a decision
 * rather than an oversight, and does not "fix" it.
 *
 * Section 3's mileage reimbursement was flagged in the same breath and also
 * stands. Both are the owner's call, and both are worth a look from whoever
 * handles the company's contracts if the classification is ever questioned.
 */

export type DisclosureBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] };

export type DisclosureSection = { heading: string; blocks: DisclosureBlock[] };

/** Bump on a material change. Signatures against an older version go stale. */
export const VEHICLE_INSURANCE_DISCLOSURE_VERSION = '2026-09-v1';

export const DISCLOSURE_TITLE =
  'Employee Personal Vehicle Usage & Insurance Disclosure Agreement';

/** Countersigned by the company. Pre-filled so nobody has to type it. */
export const COMPANY_REPRESENTATIVE_NAME = 'Michael Smith';
export const COMPANY_REPRESENTATIVE_TITLE = 'Owner';

export const DISCLOSURE_INTRO =
  'This Agreement governs the requirements and authorization for employees operating personal vehicles for business dispatches and service calls on behalf of the Company.';

export const DISCLOSURE_SECTIONS: DisclosureSection[] = [
  {
    heading: '1. Mandatory Primary Auto Insurance & Disclosure',
    blocks: [
      {
        kind: 'ul',
        items: [
          'Primary Coverage Responsibility: Employees using their personal vehicles for work tasks must maintain valid personal auto liability insurance meeting or exceeding state minimum required thresholds at all times.',
          'Insurance Carrier Notification: Employees are required to notify their personal auto insurance company that their vehicle is utilized for employment and business travel. Personal auto policies remain the primary coverage in the event of an accident.',
          'Proof of Insurance: Employees must provide the Company with a copy of their current auto insurance card and policy declaration page prior to field dispatch and upon every policy renewal.',
        ],
      },
    ],
  },
  {
    heading: '2. Company Hired & Non-Owned Auto Insurance (HNOA)',
    blocks: [
      {
        kind: 'ul',
        items: [
          'Excess Business Liability: The Company maintains Hired and Non-Owned Auto Liability Insurance (HNOA) to protect the business entity against third-party liability claims in the event of a vehicle accident during business operations.',
          'Coverage Limitations: HNOA provides liability coverage specifically for the business entity. It does not replace the employee’s personal primary auto policy, nor does it cover physical damage (collision/comprehensive) to the employee’s personal vehicle.',
        ],
      },
    ],
  },
  {
    heading: '3. Vehicle Maintenance & Expense Reimbursement',
    blocks: [
      {
        kind: 'ul',
        items: [
          'Mileage Reimbursement: Authorized business travel (excluding regular commuting distance between home and the first/last job site) will be reimbursed at the standard mileage rate to cover fuel, wear, and vehicle maintenance.',
          'Expense Logging: Employees must maintain precise, daily mileage logs detailing dates, start/end locations, and job descriptions for all work-related travel.',
          'Vehicle Safety: Employees must keep their vehicle in safe operating condition (brakes, tires, fluids, and equipment storage) to ensure safe field performance.',
        ],
      },
    ],
  },
];

export const DISCLOSURE_ACKNOWLEDGEMENT =
  'By signing below, I acknowledge that I have read and agree to the terms of this agreement. I certify that my personal auto insurance provider has been notified of my business use and that I will maintain active primary insurance coverage at all times while performing duties for the Company.';

/** The disclosure table from the paper form, as fields we can actually store
 *  and check. Policy expiry is a real date rather than free text so an expired
 *  policy can be caught instead of sitting on file looking valid. */
export type DisclosureField = {
  key: DisclosureFieldKey;
  label: string;
  placeholder: string;
  type: 'text' | 'date';
  maxLength?: number;
};

export type DisclosureFieldKey =
  | 'vehicleDescription'
  | 'licensePlate'
  | 'licensePlateState'
  | 'insuranceCarrier'
  | 'policyNumber'
  | 'policyExpiresOn';

export const DISCLOSURE_FIELDS: DisclosureField[] = [
  {
    key: 'vehicleDescription',
    label: 'Vehicle Make, Model & Year',
    placeholder: 'e.g. 2019 Chevrolet Silverado 1500',
    type: 'text',
    maxLength: 120,
  },
  {
    key: 'licensePlate',
    label: 'License Plate Number',
    placeholder: 'e.g. ABC1234',
    type: 'text',
    maxLength: 12,
  },
  {
    key: 'licensePlateState',
    label: 'Plate State',
    placeholder: 'TX',
    type: 'text',
    maxLength: 2,
  },
  {
    key: 'insuranceCarrier',
    label: 'Insurance Carrier Name',
    placeholder: 'e.g. State Farm',
    type: 'text',
    maxLength: 120,
  },
  {
    key: 'policyNumber',
    label: 'Policy Number',
    placeholder: 'As printed on your insurance card',
    type: 'text',
    maxLength: 60,
  },
  {
    key: 'policyExpiresOn',
    label: 'Policy Expiration Date',
    placeholder: '',
    type: 'date',
  },
];
