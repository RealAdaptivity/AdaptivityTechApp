import { supabase } from '../lib/supabase';
import { techStripeReturnUrls } from '../config/siteLinks';
import { invokeEdgeFunction } from './edgeFunctionErrors';

export type TechPayoutRow = {
  id: string;
  bookingReference: string | null;
  amountCents: number;
  techTransferCents: number | null;
  payoutStatus: string;
  paymentStatus: string;
  payoutMethod: string | null;
  createdAt: string;
};

export type TechConnectStatus = {
  accountId: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  readyForPayouts: boolean;
  onboardingUrl?: string;
  hasDebitCardForInstant?: boolean;
  hasBankAccount?: boolean;
};

export async function fetchTechPayoutHistory(): Promise<TechPayoutRow[]> {
  const { data, error } = await supabase
    .from('payments')
    .select(
      'id, booking_reference, amount_cents, tech_transfer_cents, payout_status, status, payout_method, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(25);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    bookingReference: row.booking_reference,
    amountCents: row.amount_cents,
    techTransferCents: row.tech_transfer_cents,
    payoutStatus: row.payout_status ?? 'none',
    paymentStatus: row.status ?? 'pending',
    payoutMethod: row.payout_method,
    createdAt: row.created_at,
  }));
}

export async function triggerInstantCashOut(method: 'instant' | 'standard') {
  return invokeEdgeFunction<{
    payoutId: string;
    method: 'instant' | 'standard';
    amountDollars: number;
    message: string;
  }>('trigger-instant-payout', { method });
}

export type TechPayoutPreview = {
  stripeOnboarded: boolean;
  stripeAccountId?: string | null;
  instantAvailableCents: number;
  availableCents: number;
  pendingCents?: number;
  connectTotalCents?: number;
  cashOutEligibleCents: number;
  cashOutEligibleDollars: number;
  availableDollars?: number;
  instantEligibleDollars?: number;
  connectTotalDollars?: number;
  pendingDollars?: number;
  canCashOut: boolean;
  canStandardCashOut?: boolean;
  canInstantCashOut?: boolean;
  hasDebitCardForInstant?: boolean;
  hint?: string;
};

export async function fetchTechPayoutPreview(): Promise<TechPayoutPreview> {
  return invokeEdgeFunction<TechPayoutPreview>('trigger-instant-payout', { action: 'preview' });
}

export async function ensureTechProfile(vanNumber?: string) {
  const { error } = await supabase.rpc('ensure_tech_profile', {
    p_van_number: vanNumber?.trim() || 'Mobile Unit',
    p_role_title: 'ASE Technician',
  });
  if (error) throw error;
}

export async function fetchTechConnectStatus(): Promise<TechConnectStatus | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return invokeEdgeFunction<TechConnectStatus>('create-stripe-account-link', {
    action: 'sync',
  });
}

export async function openStripePayoutSetup(): Promise<TechConnectStatus & { onboardingUrl: string }> {
  await ensureTechProfile();
  const urls = techStripeReturnUrls();
  const data = await invokeEdgeFunction<TechConnectStatus & { onboardingUrl: string }>(
    'create-stripe-account-link',
    urls
  );
  if (!data?.onboardingUrl) {
    throw new Error('Stripe onboarding URL missing from server');
  }
  return data;
}

/** Where techs add Instant debit cards (Account Link onboarding only collects bank). */
export async function openExpressDashboard(): Promise<{ loginUrl: string } & TechConnectStatus> {
  await ensureTechProfile();
  const data = await invokeEdgeFunction<TechConnectStatus & { loginUrl?: string; expressDashboardUrl?: string }>(
    'create-stripe-account-link',
    { action: 'express_login' }
  );
  const loginUrl = data.loginUrl || data.expressDashboardUrl;
  if (!loginUrl?.startsWith('http')) {
    throw new Error('Could not open Express Dashboard. Finish Connect Stripe Express first.');
  }
  return { ...data, loginUrl };
}

export async function fetchMechanicStripeAccountId(): Promise<string | null> {
  const status = await fetchTechConnectStatus();
  return status?.accountId?.startsWith('acct_') ? status.accountId : null;
}
