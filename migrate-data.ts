import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

if (!process.env.DATABASE_URL_PROD) {
  throw new Error('DATABASE_URL_PROD is not set (old prod connection string)');
}
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set (target Neon connection string)');
}

// Source = prod, target = whatever DATABASE_URL currently points to (Neon)
const sourcePrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_PROD }),
});
const targetPrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Every model, parents before children (FK-safe insert order). Keep in sync
// with prisma/schema.prisma — a model added there needs a line here too.
const MODELS = [
  'verification',
  'user',
  'session',
  'account',
  'twoFactor',
  'category',
  'product',
  'productImage',
  'productVariant',
  'cart',
  'cookieConsent',
  'cartItem',
  'favorite',
  'testimonial',
  'zohoOrganization',
  'branch',
  'deliveryZone',
  'branchProductStock',
  'productZohoMapping',
  'zohoStagedItem',
  'order',
  'orderItem',
  'orderStatusEvent',
  'transaction',
  'zohoPushLog',
  'contactMessage',
  'adminProfile',
  'auditLog',
  'approvalRequest',
  'exportRequest',
  'systemConfig',
  'notification',
  'notificationRecipientState',
  'clientProfile',
  'supportTicket',
  'ticketMessage',
  'loyaltyPoints',
  'couponRedemption',
  'campaign',
  'campaignRecipient',
  'promotion',
  'blogPost',
  'blogView',
  'blogReaction',
  'blogComment',
  'homepageSection',
  'banner',
  'faq',
  'supplier',
  'purchaseOrder',
  'loyaltyTier',
  'inboxMessage',
  'wishlistItem',
  'mpesaC2bTransaction',
  'inStoreOrder',
  'inStoreOrderItem',
  'inStoreTransaction',
] as const;

type TableClient = {
  findMany: (args: { take: number; skip: number; orderBy: { id: 'asc' } }) => Promise<Record<string, unknown>[]>;
  createMany: (args: { data: Record<string, unknown>[]; skipDuplicates: boolean }) => Promise<unknown>;
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
};

async function migrateTable(model: (typeof MODELS)[number]) {
  const BATCH_SIZE = 1000;
  let skip = 0;
  let total = 0;
  let skipped = 0;

  const source = sourcePrisma[model] as unknown as TableClient;
  const target = targetPrisma[model] as unknown as TableClient;

  while (true) {
    const records = await source.findMany({
      take: BATCH_SIZE,
      skip,
      orderBy: { id: 'asc' },
    });

    if (records.length === 0) break;

    try {
      await target.createMany({
        data: records,
        skipDuplicates: true, // Prevents crashes if some keys already exist
      });
      total += records.length;
    } catch {
      // Something in this batch conflicts beyond a plain duplicate id (e.g. a
      // unique field already taken by a different row, or a parent row that
      // got skipDuplicates-skipped earlier, orphaning this FK). Fall back to
      // one-by-one so a single bad row doesn't drop the other 999.
      for (const record of records) {
        try {
          await target.create({ data: record });
          total += 1;
        } catch (rowError) {
          skipped += 1;
          console.warn(`${model}: skipped id=${record.id} — ${(rowError as Error).message.split('\n')[0]}`);
        }
      }
    }

    skip += BATCH_SIZE;
  }

  if (skipped > 0) console.warn(`${model}: ${skipped} record(s) skipped`);

  console.log(`${model}: migrated ${total} records`);
}

async function main() {
  try {
    for (const model of MODELS) {
      await migrateTable(model);
    }
    console.log('Data migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sourcePrisma.$disconnect();
    await targetPrisma.$disconnect();
  }
}

main();
