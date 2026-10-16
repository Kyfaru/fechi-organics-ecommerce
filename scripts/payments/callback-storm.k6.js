// k6 run -e BASE=https://stage.fechiorganics.shop -e CHECKOUT_ID=ws_CO_... scripts/payments/callback-storm.k6.js
//
// T3: the same success callback delivered by 10 virtual users at once. Pass
// condition is on the SERVER, not here: exactly one stock decrement, one
// confirmation email, one points award, and paymentCallbackInbox shows one
// "processed" + the rest "duplicate". This script only generates the storm and
// asserts every response is the fast 200 ack.
import http from "k6/http";
import { check } from "k6";

export const options = { vus: 10, iterations: 10 };

export default function () {
  const body = JSON.stringify({
    Body: {
      stkCallback: {
        MerchantRequestID: "k6-storm",
        CheckoutRequestID: __ENV.CHECKOUT_ID,
        ResultCode: 0,
        ResultDesc: "The service request is processed successfully.",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: Number(__ENV.AMOUNT_KES || 1) },
            { Name: "MpesaReceiptNumber", Value: "K6STORM001" },
          ],
        },
      },
    },
  });
  const path = __ENV.PATH_SUFFIX || "/api/payments/kcb/callback";
  const res = http.post(`${__ENV.BASE}${path}`, body, { headers: { "Content-Type": "application/json" } });
  check(res, {
    "200 ack": (r) => r.status === 200,
    "ResultCode 0": (r) => r.json("ResultCode") === 0,
    "fast (<1s)": (r) => r.timings.duration < 1000,
  });
}
