// scripts/decrypt-once.ts — DELETE THIS FILE AFTER USE, do not commit it
import { config } from "dotenv";
config({ path: ".env.local" });
import { decrypt } from "@/lib/crypto";

const key = process.env.BRANCH_SECRET_ENCRYPTION_KEY;
console.log("Key loaded, length:", key?.length);

const encrypted = "CgipmPZRTydKpgvO:n+HixJ1bVHjh1gFZu/40Fgl0T10KWqTw1Cz++GNxgOCt5ODFv7mYwoaDpUGoHeF/bsnhDVGKvQSJ8ZYGAm2Cg1EF8zDxNA==:YLO6x0CxdaFH9Ult7s4rXA==";

console.log(decrypt(encrypted));