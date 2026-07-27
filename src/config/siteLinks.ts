/** Stripe Connect return URLs — use web portal route (SPA, no separate HTML file). */
export const TECH_STRIPE_SITE_BASE =
  'https://realadaptivity.github.io/AdaptivityPerformance';

export const techStripeReturnUrls = () => ({
  returnUrl: `${TECH_STRIPE_SITE_BASE}/portal?stripeSetup=complete`,
  refreshUrl: `${TECH_STRIPE_SITE_BASE}/portal?stripeSetup=refresh`,
});
