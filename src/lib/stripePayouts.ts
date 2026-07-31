import { supabase, hasMechanicDetails } from '../lib/supabase';
import { techStripeReturnUrls } from '../config/siteLinks';
import { invokeEdgeFunction } from './edgeFunctionErrors';
import { errorMessage } from './errorMessage';

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
  taxIdProvided?: boolean;
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
  if (error) {
    // Soft-ok if profile row already exists (same as login gate).
    if (await hasMechanicDetails()) return;
    throw new Error(error.message || 'Could not register technician profile');
  }
}

async function clearMyStripeConnectAccountId(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await supabase
    .from('mechanic_details')
    .update({ stripe_account_id: null })
    .eq('profile_id', user.id);
  if (error) throw error;
}

export async function resetStaleStripeConnectLink(): Promise<void> {
  await ensureTechProfile();
  await clearMyStripeConnectAccountId();
  try {
    await invokeEdgeFunction<TechConnectStatus>('create-stripe-account-link', {
      action: 'reset',
    });
  } catch {
    /* local clear is enough to unblock Live onboarding */
  }
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

  const {
    data: { user: me },
  } = await supabase.auth.getUser();
  if (me) {
    const { data: row } = await supabase
      .from('mechanic_details')
      .select('stripe_account_id')
      .eq('profile_id', me.id)
      .maybeSingle();
    const localId =
      typeof row?.stripe_account_id === 'string' && row.stripe_account_id.startsWith('acct_')
        ? row.stripe_account_id
        : null;
    if (localId) {
      try {
        const sync = await invokeEdgeFunction<TechConnectStatus>('create-stripe-account-link', {
          action: 'sync',
        });
        if (!sync?.accountId?.startsWith('acct_')) {
          await clearMyStripeConnectAccountId();
        }
      } catch {
        await clearMyStripeConnectAccountId();
      }
    }
  }

  let data: (TechConnectStatus & { onboardingUrl: string }) | null = null;
  try {
    data = await invokeEdgeFunction<TechConnectStatus & { onboardingUrl: string }>(
      'create-stripe-account-link',
      urls
    );
  } catch (e: unknown) {
    const msg = errorMessage(e, String(e));
    if (/no such account|resource_missing|similar object exists in test mode|technician profile required/i.test(msg)) {
      if (/technician profile required/i.test(msg)) throw new Error(msg);
      await clearMyStripeConnectAccountId();
      data = await invokeEdgeFunction<TechConnectStatus & { onboardingUrl: string }>(
        'create-stripe-account-link',
        { ...urls, forceRecreate: true }
      );
    } else {
      throw e instanceof Error ? e : new Error(msg);
    }
  }

  if (!data?.onboardingUrl) {
    await clearMyStripeConnectAccountId();
    data = await invokeEdgeFunction<TechConnectStatus & { onboardingUrl: string }>(
      'create-stripe-account-link',
      { ...urls, forceRecreate: true }
    );
  }
  if (!data?.onboardingUrl) {
    throw new Error(
      'Stripe onboarding URL missing. Reset the Stripe link in Settings, then try again.'
    );
  }
  return data;
}

/**
 * Express Dashboard requires a Live Express account. If missing (test→Live cutover),
 * start onboarding and return that URL as loginUrl.
 */
export async function openExpressDashboard(): Promise<
  { loginUrl: string } & TechConnectStatus & { openedOnboarding?: boolean }
> {
  await ensureTechProfile();

  try {
    const data = await invokeEdgeFunction<
      TechConnectStatus & { loginUrl?: string; expressDashboardUrl?: string }
    >('create-stripe-account-link', { action: 'express_login' });
    const loginUrl = data.loginUrl || data.expressDashboardUrl;
    if (loginUrl?.startsWith('http')) {
      return { ...data, loginUrl };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      !/connect stripe|finish connect|no such account|resource_missing|test mode|express first/i.test(
        msg
      )
    ) {
      throw e;
    }
    await clearMyStripeConnectAccountId().catch(() => undefined);
  }

  const onboard = await openStripePayoutSetup();
  return {
    ...onboard,
    loginUrl: onboard.onboardingUrl,
    openedOnboarding: true,
  };
}

export async function fetchMechanicStripeAccountId(): Promise<string | null> {
  const status = await fetchTechConnectStatus();
  return status?.accountId?.startsWith('acct_') ? status.accountId : null;
}
