/** Stripe Connect return URLs — production portal (custom domain). */
export const TECH_STRIPE_SITE_BASE = 'https://adaptivityperformance.com';

export const techStripeReturnUrls = () => ({
  returnUrl: `${TECH_STRIPE_SITE_BASE}/portal?stripeSetup=complete`,
  refreshUrl: `${TECH_STRIPE_SITE_BASE}/portal?stripeSetup=refresh`,
});
