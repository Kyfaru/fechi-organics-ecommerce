import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encrypt } from "../lib/crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

// ── Daraja (Safaricom) — TILL branches ───────────────────────────────────────
// Each is a separate Daraja app with its own consumer key/secret + till number.
// PASSKEY MUST be the one issued for YOUR shortcode from the Daraja portal —
// "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919" and
// shortcode "174379" are Safaricom's PUBLIC sandbox test constants (documented
// at developer.safaricom.co.ke) — they will never work in production and will
// produce an accepted-then-1037 (prompt never reaches a real handset).
const CREDS = [
  {
    county: "REPLACE_ME",              // must match an existing branch.county
    shortcode: "REPLACE_WITH_REAL_SHORTCODE",
    consumerKey: "REPLACE_WITH_REAL_CONSUMER_KEY",
    consumerSecret: "REPLACE_WITH_REAL_CONSUMER_SECRET",
    passkey: "REPLACE_WITH_REAL_PASSKEY",
  },
];

// ── KCB Buni — Paybill branches ───────────────────────────────────────────────
// shortcode     = KCB paybill number (orgShortCode in STK push body)
// invoicenumber = KCB invoice/account number (invoiceNumber in STK push body)
// apikey        = KCB Buni API key header value — copy this from the Buni
//   PRODUCTION app, not the UAT/sandbox one. A sandbox apiKey's JWT payload
//   decodes to `"iss":"https://sandbox.buni.kcbgroup.com/oauth2/token"` and
//   `"keytype":"SANDBOX"` — paste yours into a JWT decoder (or `node -e
//   "console.log(JSON.parse(Buffer.from(process.argv[1].split('.')[1],'base64')))" <token>`)
//   and confirm the issuer host and keytype before seeding.
const BUNI = [
  {
    county: "REPLACE_ME",              // must match an existing branch.county
    shortcode: "",                      // usually empty — see kcb-client.ts
    invoicenumber: "REPLACE_WITH_REAL_INVOICE_NUMBER",
    consumerKey: "REPLACE_WITH_REAL_CONSUMER_KEY",
    consumerSecret: "REPLACE_WITH_REAL_CONSUMER_SECRET",
    apikey: "REPLACE_WITH_REAL_PRODUCTION_APIKEY",
  },
];

async function main() {
  console.log("Starting credential seed...\n");

  // ── Daraja branches ──────────────────────────────────────────────────────
  console.log("── Daraja branches ──");
  for (const c of CREDS) {
    const result = await prisma.branch.updateMany({
      where: { county: c.county },
      data: {
        shortcode: c.shortcode,
        consumerKeyEnc: encrypt(c.consumerKey),
        consumerSecretEnc: encrypt(c.consumerSecret),
        passkeyEnc: encrypt(c.passkey),
      },
    });

    if (result.count === 0) {
      throw new Error(`❌ No branch found with county "${c.county}" — check your DB`);
    }
    console.log(`✓ ${c.county} updated (${result.count} row)`);
  }

  // ── KCB Buni branches ────────────────────────────────────────────────────
  console.log("\n── KCB Buni branches ──");
  for (const b of BUNI) {
    const result = await prisma.branch.updateMany({
      where: { county: b.county },
      data: {
        shortcode: b.shortcode,             // paybill number
        invoiceNumber: b.invoicenumber,     // KCB invoice/account number
        consumerKeyEnc: encrypt(b.consumerKey),
        consumerSecretEnc: encrypt(b.consumerSecret),
        apiKeyEnc: encrypt(b.apikey),
        passkeyEnc: encrypt(""),            // KCB Buni doesn't use a Daraja passkey
      },
    });

    if (result.count === 0) {
      throw new Error(`❌ No branch found with county "${b.county}" — check your DB`);
    }
    console.log(`✓ ${b.county} updated (${result.count} row)`);
  }

  console.log("\n✅ All branches updated successfully.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
