// Neutral-path alias for the C2B confirmation URL. Safaricom's registered-URL
// rules forbid keywords like "mpesa" in the path, so NEW registrations point
// here; the original /api/payments/mpesa/c2b/confirmation keeps working for
// any URL already registered (production allows one registration per shortcode).
export { POST } from "@/app/api/payments/mpesa/c2b/confirmation/route";
