#!/usr/bin/env node
/**
 * Fake KCB Buni gateway for testing payment edge cases without money.
 *
 *   node scripts/payments/fake-kcb.mjs            # listens on :4010
 *   KCB_BASE_URL=http://localhost:4010 pnpm dev   # point the app at it
 *   (APP_STAGE must permit a non-production host — see lib/payments/gateway-env.ts)
 *
 * The scenario is chosen by the LAST DIGIT of the phone number sent in the push:
 *   0 success            1 customer cancelled (1032)     2 never calls back
 *   3 duplicate callback 4 wrong amount (paid KES +1)    5 late callback (25s)
 *   6 gateway 500 on the push
 */
import http from "node:http";

const PORT = Number(process.env.PORT ?? 4010);
let n = 0;

function post(url, body) {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => console.log(`  callback -> ${r.status}`))
    .catch((e) => console.log("  callback failed:", e.message));
}

function callback(url, checkoutId, scenario, amount) {
  const ok = scenario !== "1";
  const body = {
    Body: {
      stkCallback: {
        MerchantRequestID: `fake-${checkoutId}`,
        CheckoutRequestID: checkoutId,
        ResultCode: ok ? 0 : 1032,
        ResultDesc: ok ? "The service request is processed successfully." : "Request cancelled by user",
        ...(ok && {
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: scenario === "4" ? amount + 1 : amount },
              { Name: "MpesaReceiptNumber", Value: `FAKE${Date.now().toString(36).toUpperCase()}` },
              { Name: "TransactionDate", Value: 20261016000000 },
            ],
          },
        }),
      },
    },
  };
  return post(url, body);
}

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const json = (code, o) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(o));
      };
      if (req.url?.startsWith("/token")) return json(200, { access_token: `fake-token-${++n}`, expires_in: 3600 });
      if (req.url?.startsWith("/mm/api/request/1.0.0/stkpush")) {
        const b = JSON.parse(raw || "{}");
        const scenario = String(b.phoneNumber ?? "").slice(-1);
        const checkoutId = `ws_CO_FAKE_${Date.now()}_${n}`;
        console.log(`push phone=${b.phoneNumber} amount=${b.amount} scenario=${scenario} -> ${checkoutId}`);
        if (scenario === "6") return json(500, { error: "simulated gateway failure" });
        json(200, {
          header: { statusCode: "0", statusDescription: "Success. Request accepted for processing" },
          response: { MerchantRequestID: `fake-${checkoutId}`, ResponseCode: "0", CheckoutRequestID: checkoutId },
        });
        if (scenario === "2") return; // accepted, never calls back
        const amount = Number(b.amount);
        const delay = scenario === "5" ? 25_000 : 2_000;
        setTimeout(async () => {
          await callback(b.callbackUrl, checkoutId, scenario, amount);
          if (scenario === "3") await callback(b.callbackUrl, checkoutId, "0", amount); // gateway retry
        }, delay);
        return;
      }
      json(404, { error: "not found" });
    });
  })
  .listen(PORT, () => console.log(`fake KCB listening on :${PORT}`));
