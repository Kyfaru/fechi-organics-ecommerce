-- Run BEFORE prisma migrate dev to handle existing PAYHERO rows
-- The PaymentProvider enum is losing its PAYHERO value; any existing rows
-- using it must be migrated first or the migration will fail.
UPDATE "public"."transaction" SET provider = 'PAYSTACK' WHERE provider = 'PAYHERO';
