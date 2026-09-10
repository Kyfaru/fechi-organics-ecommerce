// Stock level below which a product is flagged "low_stock" in the admin UI
// and triggers a LOW_STOCK notification on a crossing-edge drop during Zoho
// sync (see lib/zoho-sync.ts). Shared across the inventory list, adjust, and
// sync routes so the cutoff can't drift between them.
export const LOW_STOCK_THRESHOLD = 10;
