// Adaptivity Performance — Native iOS Theme Colors
// Matches the customer website dark theme + orange accent palette

export const colors = {
  // Backgrounds
  bg: {
    primary: '#090a0f',
    secondary: '#0b0c10',
    card: '#12141c',
    cardHover: '#181a24',
    input: '#1a1c28',
    overlay: 'rgba(0,0,0,0.7)',
  },

  // Brand
  brand: {
    orange: '#f97316',
    amber: '#f59e0b',
    orangeLight: '#fb923c',
    orangeDark: '#ea580c',
    gradient: ['#f97316', '#f59e0b'] as const,
  },

  // Text
  text: {
    primary: '#f1f5f9',
    secondary: '#94a3b8',
    muted: '#64748b',
    inverse: '#0b0c10',
  },

  // Status
  status: {
    success: '#10b981',
    successBg: 'rgba(16,185,129,0.15)',
    warning: '#f59e0b',
    warningBg: 'rgba(245,158,11,0.15)',
    error: '#ef4444',
    errorBg: 'rgba(239,68,68,0.15)',
    info: '#3b82f6',
    infoBg: 'rgba(59,130,246,0.15)',
  },

  // Borders
  border: {
    primary: 'rgba(255,255,255,0.08)',
    secondary: 'rgba(255,255,255,0.04)',
    orange: 'rgba(249,115,22,0.3)',
    success: 'rgba(16,185,129,0.3)',
  },

  // Stripe / Payments
  stripe: {
    purple: '#635bff',
    purpleBg: 'rgba(99,91,255,0.15)',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};
