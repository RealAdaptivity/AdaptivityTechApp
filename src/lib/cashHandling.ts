/** The business line techs text the deposit receipt to (same as the website). */
const SITE_PHONE_DISPLAY = '(940) 304-0620';

/**
 * What a tech does with cash collected on a job. Shown on Get paid whenever
 * Cash is chosen (web portal and tech app use the same steps). The cash is
 * the company's: the tech deposits it, sends the full amount on to the
 * business account electronically, and sends a photo of the deposit receipt
 * so the office can match it to the job.
 */
export function cashHandlingSteps(opts: {
  amount: string;
  referenceCode: string;
  zelleName?: string | null;
  zelleRecipient?: string | null;
}): string[] {
  const zelle = opts.zelleName
    ? `Zelle to ${opts.zelleName}${opts.zelleRecipient ? ` (${opts.zelleRecipient})` : ''}`
    : 'Zelle';
  return [
    `Count the cash with the customer and give them their receipt — ${opts.amount}.`,
    `Deposit the full ${opts.amount} at your bank within 24 hours.`,
    `Send ${opts.amount} to the business bank account by ${zelle} or wire transfer (ask dispatch for wire details). Put ${opts.referenceCode} in the memo.`,
    `Text a photo of the bank's deposit receipt and your Zelle / wire confirmation to ${SITE_PHONE_DISPLAY}, with ${opts.referenceCode}.`,
  ];
}
