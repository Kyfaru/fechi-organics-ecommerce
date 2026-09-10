// Shared sessionStorage flag: set when the user clicks "Place Order" on
// /cart (components/cart/CartClient.tsx), checked by /delivery and /payment
// so neither page is reachable by typing/bookmarking its URL directly —
// only by starting from the cart. Navigating back and forth between
// delivery and payment stays allowed since this flag isn't cleared until
// checkout actually finishes (OrderSuccessClient clears it, alongside
// fechi_delivery and the promo keys).
export const CHECKOUT_FLOW_FLAG_KEY = "fechi_checkout_flow";
