export type WeeklyPayoutLine = {
  bookingReference: string | null;
  techTransferCents: number | null;
  payoutStatus: string;
  createdAt: string;
};

export function filterLast7DaysPayouts<T extends { createdAt: string }>(rows: T[]): T[] {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return rows.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
}

export function buildWeeklyEarningsSummaryText(rows: WeeklyPayoutLine[]): string {
  const week = filterLast7DaysPayouts(rows);
  const total =
    week.reduce((s, r) => s + (r.techTransferCents ?? 0), 0) / 100;
  const lines = week.map((r) => {
    const dollars = ((r.techTransferCents ?? 0) / 100).toFixed(2);
    const when = new Date(r.createdAt).toLocaleDateString();
    return `• ${when} ${r.bookingReference ?? 'Job'} — $${dollars} (${r.payoutStatus})`;
  });
  return [
    'Adaptivity — Weekly earnings summary (last 7 days)',
    `Generated: ${new Date().toLocaleString()}`,
    `Total tech share: $${total.toFixed(2)}`,
    '',
    ...(lines.length ? lines : ['No payouts in the last 7 days.']),
  ].join('\n');
}
