import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encrypt } from "../lib/crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

// ── Daraja (Safaricom) — 3 TILL branches ─────────────────────────────────────
// Each is a separate Daraja app with its own consumer key/secret/passkey + till number.
const CREDS = [
  {
    county: "Kirinyaga",    // Mwea branch
    shortcode: "174379",
    consumerKey: "wiYMsWfWrVlNQ2Ka7ENuKZGH9qBmuMqY6CUbDS5HDfuVsrxY",
    consumerSecret: "tLWvM0IhwOjKCza6S7gFkR0G66jfhrRsKzfs7sMji6GU3IwaPQvoENmVQfxGAdWu",
    passkey: "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919",
  },
  {
    county: "Uasin Gishu", // Eldoret branch
    shortcode: "174379",
    consumerKey: "oQHLXwQIOGjzZyijKpYQk1vqsY59QYpXG4wOKyDGdPyW7uGp",
    consumerSecret: "0BvUNEgkaaoqjis7Pjuwz6cGr7iTYBrroPWAaGnIGlA9Sbql6rfOJFcAx2IeayOT",
    passkey: "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919",
  },
  {
    county: "Kajiado",     // Kitengela branch
    shortcode: "174379",
    consumerKey: "GJ9H3qurndoCYFs6a9Ou9LJWgUGodlNxFitdA8ENE0RLODkU",
    consumerSecret: "eRXqmwEtVgwVyTA02RwTJ9n0loGemGQVgkAl1OGyGoBWNZqvbKhL9j1Jz52QjruZ",
    passkey: "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919",
  },
];

// ── KCB Buni — 2 Paybill branches ────────────────────────────────────────────
// shortcode     = KCB paybill number (orgShortCode in STK push body)
// invoicenumber = KCB invoice/account number (invoiceNumber in STK push body)
// apikey        = KCB Buni API key header value
const BUNI = [
  {
    county:"Nairobi",
    shortcode:"",
    invoicenumber: "8093706",
    consumerKey:"qEJknmliY1gLzfrcEE6OkQO7hcAa",
    consumerSecret:"PSNhVifDMxWbshXZTeSiL4sLPCka",
    apikey:"eyJ4NXQiOiJaREEzWldJeU1UTTVabUptTnpNeU5UTXlabU13TVRZMU4ySTJORGhsT1dSaFpEWmpNakUwTkE9PSIsImtpZCI6ImdhdGV3YXlfY2VydGlmaWNhdGVfYWxpYXMiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJreWZhcnUtbGFic0BjYXJib24uc3VwZXIiLCJhcHBsaWNhdGlvbiI6eyJvd25lciI6Imt5ZmFydS1sYWJzIiwidGllclF1b3RhVHlwZSI6bnVsbCwidGllciI6IlVubGltaXRlZCIsIm5hbWUiOiJGZWNoaSBPcmdhbmljcyBOYWlyb2JpIiwiaWQiOjYwODAyLCJ1dWlkIjoiYWViNmU5MDItMGMzNi00YjQ4LTg1YmYtYjZiYThiZDIzY2FkIn0sImlzcyI6Imh0dHBzOlwvXC9zYW5kYm94LmJ1bmkua2NiZ3JvdXAuY29tXC9vYXV0aDJcL3Rva2VuIiwidGllckluZm8iOnsiVW5saW1pdGVkIjp7InRpZXJRdW90YVR5cGUiOiJyZXF1ZXN0Q291bnQiLCJncmFwaFFMTWF4Q29tcGxleGl0eSI6MCwiZ3JhcGhRTE1heERlcHRoIjowLCJzdG9wT25RdW90YVJlYWNoIjp0cnVlLCJzcGlrZUFycmVzdExpbWl0IjowLCJzcGlrZUFycmVzdFVuaXQiOm51bGx9fSwia2V5dHlwZSI6IlNBTkRCT1giLCJwZXJtaXR0ZWRSZWZlcmVyIjoiIiwic3Vic2NyaWJlZEFQSXMiOlt7InN1YnNjcmliZXJUZW5hbnREb21haW4iOiJjYXJib24uc3VwZXIiLCJuYW1lIjoiTXBlc2FFeHByZXNzQVBJU2VydmljZSIsImNvbnRleHQiOiJcL21tXC9hcGlcL3JlcXVlc3RcLzEuMC4wIiwicHVibGlzaGVyIjoic3VwZXJfYWRtaW4iLCJ2ZXJzaW9uIjoiMS4wLjAiLCJzdWJzY3JpcHRpb25UaWVyIjoiVW5saW1pdGVkIn1dLCJ0b2tlbl90eXBlIjoiYXBpS2V5IiwicGVybWl0dGVkSVAiOiIiLCJpYXQiOjE3ODY3MDgwMjQsImp0aSI6ImQzNzYxNTc2LTU0NmMtNDAxMy1hY2U0LWRiMTkzMGI2ZDBkOSJ9.Wye9LJCUBQmOfY51BwY6SKiyKmPg5xYHaDF3tszQdcP5zQ-gx8JJVI1vxrWFq5I5MCNeFoB2jo6rDooWmFZEnw4QuC1XywgyWB6eLphaLeS0XKowyFJNYNozH26aOyBRg5PAq9fiYZEaFtwhiH0X_r5aNe7FJfNBbLoKO0lkzyFMavu-T4r0snm3d37t53Ag5DpcYBzTqhJm4HGXyefClQDFni4uLFHEyX4YZD46i4htBZNqCJMBuN9Umimyk_jJNx0wzZ36oXOIf5o8Q6FZhq-h-zsFwS70r_8IHl-HpQ12fgbuCuD_Cj1Gh0wgUEjdbcKEM72tDPIYCK7Yy1KNLA==",
  },
  {
    county:"Nakuru",
    shortcode:"",
    invoicenumber:"8093709",
    consumerKey:"vvmWoPw0n1hJpVxnCuZAqAgCWKka",
    consumerSecret:"f9Hmzut7VR91T6bSrhI1Os617zUa",
    apikey:"eyJ4NXQiOiJaREEzWldJeU1UTTVabUptTnpNeU5UTXlabU13TVRZMU4ySTJORGhsT1dSaFpEWmpNakUwTkE9PSIsImtpZCI6ImdhdGV3YXlfY2VydGlmaWNhdGVfYWxpYXMiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJreWZhcnUtbGFic0BjYXJib24uc3VwZXIiLCJhcHBsaWNhdGlvbiI6eyJvd25lciI6Imt5ZmFydS1sYWJzIiwidGllclF1b3RhVHlwZSI6bnVsbCwidGllciI6IlVubGltaXRlZCIsIm5hbWUiOiJGZWNoaSBPcmdhbmljcyBOYWt1cnUiLCJpZCI6NjA4MjIsInV1aWQiOiI5NGExOWNjOS01OTI3LTQyNzgtYTc1ZC1hODY3ZTUyMGQ3ZWIifSwiaXNzIjoiaHR0cHM6XC9cL3NhbmRib3guYnVuaS5rY2Jncm91cC5jb21cL29hdXRoMlwvdG9rZW4iLCJ0aWVySW5mbyI6eyJVbmxpbWl0ZWQiOnsidGllclF1b3RhVHlwZSI6InJlcXVlc3RDb3VudCIsImdyYXBoUUxNYXhDb21wbGV4aXR5IjowLCJncmFwaFFMTWF4RGVwdGgiOjAsInN0b3BPblF1b3RhUmVhY2giOnRydWUsInNwaWtlQXJyZXN0TGltaXQiOjAsInNwaWtlQXJyZXN0VW5pdCI6bnVsbH19LCJrZXl0eXBlIjoiU0FOREJPWCIsInBlcm1pdHRlZFJlZmVyZXIiOiIiLCJzdWJzY3JpYmVkQVBJcyI6W3sic3Vic2NyaWJlclRlbmFudERvbWFpbiI6ImNhcmJvbi5zdXBlciIsIm5hbWUiOiJNcGVzYUV4cHJlc3NBUElTZXJ2aWNlIiwiY29udGV4dCI6IlwvbW1cL2FwaVwvcmVxdWVzdFwvMS4wLjAiLCJwdWJsaXNoZXIiOiJzdXBlcl9hZG1pbiIsInZlcnNpb24iOiIxLjAuMCIsInN1YnNjcmlwdGlvblRpZXIiOiJVbmxpbWl0ZWQifV0sInRva2VuX3R5cGUiOiJhcGlLZXkiLCJwZXJtaXR0ZWRJUCI6IiIsImlhdCI6MTc4NjcwNzk5MCwianRpIjoiZDQ3MGEwZjUtNjA3NC00MmM1LTgzNjYtYzIxMmViMmY4OTIxIn0=.RlGZE5DyrdjzX3aG2lVNJgV87vn5kh_Hi4Nnmyo8MJTOZogL3eaFWpBfljzpeOPI2JkHPjP-HbyGxbre5aSZclDRDuQgtA9XuWRVv4sHQiUOzDsQKkuH6rcV312F9B9LgZThXIeWC23S3rYJEn9Pw18etWcAlFYo8n3X9JVQKH-IwpMJBc2DW4Qr6tOEmiJ85IzSrkQ7xKnLYjU2KmzZtj_fUJTtW2AME5GLL64ufo1jJpKkYyUNCnRM3UjKMgUE3koed-2ofdpOKgbALTYYgiSjwDFcESfVMuIMTbZK8CpMkJqKzGltDR0nIPHNsR-ruaVHlEMQzZuTGK9ewqsiUA==",
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
