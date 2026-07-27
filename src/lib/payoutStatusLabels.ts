/** Human-readable payment + payout state for tech earnings UI. */
export function formatTechPayoutLabel(payoutStatus: string, paymentStatus: string): string {
  switch (payoutStatus) {
    case 'instant_paid':
      return 'Instant paid';
    case 'paid':
      return 'Paid out';
    case 'instant_pending':
      return 'Instant transfer in progress';
    case 'standard_pending':
      return 'Bank transfer in progress';
    case 'retry_pending':
      return 'Waiting for Connect balance';
    case 'failed':
      return 'Payout failed';
    case 'skipped':
      return 'No Connect account at capture';
    case 'pending':
      return 'On Connect — use Instant cash out';
    case 'awaiting_capture':
      return 'Card held — complete job to capture';
    case 'awaiting_payment':
      return paymentStatus === 'authorized'
        ? 'Card held — complete job to capture'
        : 'Waiting for customer payment';
    case 'none':
      if (paymentStatus === 'authorized') return 'Card held — complete job to capture';
      if (paymentStatus === 'pending') return 'Waiting for customer card';
      if (paymentStatus === 'succeeded') return 'Captured — check Connect balance';
      return 'Not started';
    default:
      return payoutStatus.replace(/_/g, ' ');
  }
}

export function countsTowardLedgerPending(payoutStatus: string, paymentStatus: string): boolean {
  if (!['authorized', 'succeeded'].includes(paymentStatus)) return false;
  return ['retry_pending', 'awaiting_capture', 'none', 'pending', 'awaiting_payment'].includes(payoutStatus);
}
