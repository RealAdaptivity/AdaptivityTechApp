/** IRS tax forms for 1099 contractors — shared copy. */

export const FORM_1099_NEC_THRESHOLD_DOLLARS = 600;

export const FORM_1099_NEC_NOTICE =
  `If Adaptivity pays you $${FORM_1099_NEC_THRESHOLD_DOLLARS} or more in nonemployee compensation during a calendar year, we are required to file Form 1099-NEC with the IRS and furnish a copy to you by January 31 of the following year.`;

export const FORM_1099_NEC_PLATFORM_NOTE =
  'Give dispatch a completed Form W-9 so we can prepare 1099-NEC reporting. Payment is taken in person, so year-to-date totals come from your own records rather than this app.';
