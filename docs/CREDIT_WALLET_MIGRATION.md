# Credit Wallet Migration

The `credit_wallet_loan` function is required for the Credit Wallet feature. Apply this migration to your Supabase database.

## Option 1: Supabase Dashboard (recommended)

1. Open your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **SQL Editor**
4. Paste and run the SQL below
5. Click **Run**

## Option 2: Supabase CLI

From the project root:

```bash
supabase db push
```

Or run the migration file directly:

```bash
supabase db execute -f supabase/migrations/20250225000000_add_credit_loan.sql
```

---

## Migration SQL

```sql
-- 1. Allow credit_loan type in wallet_transactions
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN ('deposit', 'purchase', 'sale', 'refund', 'adjustment', 'credit_loan'));

-- 2. Create credit_wallet_loan RPC
CREATE OR REPLACE FUNCTION credit_wallet_loan(
  p_user_id uuid,
  p_amount_cents bigint,
  p_ref text DEFAULT NULL,
  p_currency text DEFAULT 'usd'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  INSERT INTO wallet_transactions (user_id, amount_cents, type, currency, ref)
  VALUES (p_user_id, p_amount_cents, 'credit_loan', COALESCE(p_currency, 'usd'), COALESCE(p_ref, 'credit_loan_' || extract(epoch from now())::bigint));

  UPDATE profiles
  SET wallet_balance = COALESCE(wallet_balance, 0) + p_amount_cents
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;
END;
$$;
```
