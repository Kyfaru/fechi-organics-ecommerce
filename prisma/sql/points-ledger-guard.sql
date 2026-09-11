-- Makes public."pointsLedger" append-only at the database, not just in app code.
--
-- The HMAC chain in lib/points/ledger.ts makes tampering *detectable*; this
-- makes it *fail*. Both matter: the trigger stops the application role and any
-- ordinary psql session, and the chain still catches anything done as superuser
-- (which can bypass triggers with ALTER TABLE ... DISABLE TRIGGER).
--
-- Apply through scripts/db-deploy-prod.sh, or directly:
--   pnpm prisma db execute --file prisma/sql/points-ledger-guard.sql
--
-- Corrections are made by INSERTing a compensating entry, never by editing.

CREATE OR REPLACE FUNCTION points_ledger_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'pointsLedger is append-only — write a compensating entry instead (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS points_ledger_no_mutate ON public."pointsLedger";
CREATE TRIGGER points_ledger_no_mutate
  BEFORE UPDATE OR DELETE ON public."pointsLedger"
  FOR EACH ROW EXECUTE FUNCTION points_ledger_immutable();

-- Second layer: revoke the privileges outright from the application role so the
-- attempt is rejected before the trigger is even reached.
--
-- Replace :app_role with the role in DATABASE_URL, then uncomment. Left commented
-- because the role name differs per environment and a wrong name aborts the whole
-- deploy script mid-run.
--
--   REVOKE UPDATE, DELETE, TRUNCATE ON public."pointsLedger" FROM :app_role;
--   GRANT  INSERT, SELECT ON public."pointsLedger" TO :app_role;
