/**
 * Zoho Inventory organization credential loader.
 *
 * Credentials belong to a zohoOrganization, not a branch — several branches
 * can share one org (see prisma schema `zohoOrganization`/`branch` models).
 * Stored encrypted (AES-256-GCM via lib/crypto.ts) except `zohoOrgId`, which
 * is plaintext because incoming webhooks need to be routed by org before any
 * secret is available to decrypt.
 */

import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export type ZohoCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  orgId: string;
};

/**
 * Loads and decrypts a Zoho Inventory organization's OAuth credentials.
 * @param organizationId - the zohoOrganization whose credentials to load
 * @returns decrypted client id/secret/refresh token plus the plaintext org id
 * @throws when the organization doesn't exist — callers should surface this
 *   as a clear "not configured" error rather than a generic 500, since it's
 *   an admin setup gap, not a bug.
 */
export async function getZohoCredentials(organizationId: string): Promise<ZohoCredentials> {
  const org = await db.zohoOrganization.findUnique({
    where: { id: organizationId },
    select: {
      zohoOrgId: true,
      clientIdEnc: true,
      clientSecretEnc: true,
      refreshTokenEnc: true,
    },
  });

  if (!org) {
    throw new Error(`Zoho organization not found (organizationId: ${organizationId})`);
  }

  return {
    clientId: decrypt(org.clientIdEnc),
    clientSecret: decrypt(org.clientSecretEnc),
    refreshToken: decrypt(org.refreshTokenEnc),
    orgId: org.zohoOrgId,
  };
}
