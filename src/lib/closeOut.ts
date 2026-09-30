/**
 * The money on a closed job: what the customer pays and what the tech keeps.
 *
 * No imports, so the node test runner can load it. Everything is whole cents
 * and integer arithmetic, because record_job_payment (migration
 * 20260930171859_job_payments.sql) repeats the same sums in SQL and stores its
 * own result; a float rounding differently on one side would show the tech one
 * total and save another. tests/closeOut.test.ts checks the SQL uses the same
 * rates as this file.
 */

/** Texas sales tax, in basis points (8.25%). */
export const SALES_TAX_BASIS_POINTS = 825;
/** The tech's share of diagnostic, labor and travel, in percent. Parts the
 *  tech bought are paid back in full on top. */
export const TECH_LABOR_SHARE_PERCENT = 70;

export type TaxMode = 'parts' | 'total' | 'none';
export type PartsBy = 'tech' | 'company';
export type CloseOutKind = 'charge' | 'diagnostic_only' | 'no_show';

export type LineDraft = { title: string; labor: string; parts: string };
export type CloseOutLine = { title: string; laborCents: number; partsCents: number };

export type CloseOut = {
  kind: CloseOutKind;
  lines: CloseOutLine[];
  diagnosticCents: number;
  travelCents: number;
  laborCents: number;
  partsCents: number;
  taxCents: number;
  totalCents: number;
  techPayoutCents: number;
};

/** '$145.50', '145.5', ' 145 ' → cents. Anything else, or a negative, is 0. */
export function dollarsToCents(input: string | number): number {
  const s = String(input).replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(s)) return 0;
  const [whole, frac = ''] = s.split('.');
  return Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

/** Tax on a base, rounded half up to the cent without floating point. */
export function taxOn(baseCents: number, basisPoints = SALES_TAX_BASIS_POINTS): number {
  return Math.floor((baseCents * basisPoints + 5000) / 10000);
}

/** A line with an amount but no title gets one, so the receipt never shows a blank. */
function titled(title: string, laborCents: number, partsCents: number): string {
  const t = title.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (t) return t;
  if (laborCents > 0 && partsCents > 0) return 'Labor & parts';
  return laborCents > 0 ? 'Labor' : 'Parts';
}

export function computeCloseOut(input: {
  kind: CloseOutKind;
  lines: LineDraft[];
  diagnosticCents: number;
  travelCents: number;
  taxMode: TaxMode;
  partsBy: PartsBy;
}): CloseOut {
  const noShow = input.kind === 'no_show';
  const lines: CloseOutLine[] =
    input.kind === 'charge'
      ? input.lines
          .map((l) => {
            const laborCents = dollarsToCents(l.labor);
            const partsCents = dollarsToCents(l.parts);
            return { title: titled(l.title, laborCents, partsCents), laborCents, partsCents };
          })
          .filter((l) => l.laborCents > 0 || l.partsCents > 0)
      : [];
  const diagnosticCents = noShow ? 0 : Math.max(0, Math.round(input.diagnosticCents));
  const travelCents = noShow ? 0 : Math.max(0, Math.round(input.travelCents));
  const laborCents = lines.reduce((s, l) => s + l.laborCents, 0);
  const partsCents = lines.reduce((s, l) => s + l.partsCents, 0);
  const beforeTax = diagnosticCents + travelCents + laborCents + partsCents;
  const taxCents =
    input.taxMode === 'parts' ? taxOn(partsCents) : input.taxMode === 'total' ? taxOn(beforeTax) : 0;
  const shareable = diagnosticCents + travelCents + laborCents;
  const techPayoutCents =
    Math.floor((shareable * TECH_LABOR_SHARE_PERCENT + 50) / 100) + (input.partsBy === 'tech' ? partsCents : 0);
  return {
    kind: input.kind,
    lines,
    diagnosticCents,
    travelCents,
    laborCents,
    partsCents,
    taxCents,
    totalCents: beforeTax + taxCents,
    techPayoutCents,
  };
}

/** What stops the tech from closing, or null when it can close. */
export function closeOutProblem(c: CloseOut, signed: boolean): string | null {
  if (c.kind === 'no_show') return null;
  if (c.totalCents <= 0) return 'Enter what the customer is paying.';
  if (!signed) return 'Have the customer sign first.';
  return null;
}
