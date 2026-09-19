/**
 * Thrown by the KCB/Daraja STK clients so dispatch-stk.ts can tell "this
 * gateway definitely sent nothing" (safe to retry on the other gateway)
 * apart from "the gateway received and answered this" (retrying risks a
 * second prompt to the customer's phone, or a double debit).
 *
 * sentNothing is true only for: a token-fetch failure, a connect/DNS error,
 * an HTTP 5xx from the STK endpoint itself, or the request aborting before
 * any response arrived. It is false for a 2xx response (even when
 * ResponseCode != "0" or no CheckoutRequestID came back — the gateway still
 * processed the request) and false for a 4xx from the STK endpoint (the
 * gateway answered, just with a rejection).
 */
export class StkSendError extends Error {
  constructor(message: string, public readonly sentNothing: boolean) {
    super(message);
    this.name = "StkSendError";
  }
}
