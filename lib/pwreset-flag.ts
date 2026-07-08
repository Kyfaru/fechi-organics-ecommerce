// Shared sessionStorage flag: set by /forgot-password on a successful reset,
// checked by both /forgot-password and the legacy /reset-password?token=
// page so neither is revisitable afterward, and by /forgot-password itself
// as its 15-minute total page window.
export const PWRESET_COMPLETION_FLAG_KEY = "fechi_pwreset_completed_until";
export const PWRESET_PAGE_WINDOW_MS = 15 * 60 * 1000;
