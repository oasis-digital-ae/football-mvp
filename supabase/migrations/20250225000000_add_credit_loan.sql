-- Credit Wallet Feature: Add credit_loan transaction type and credit_wallet_loan RPC
-- Apply via Supabase Dashboard SQL Editor or: supabase db push

-- 1. Allow credit_loan type in wallet_transactions
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN ('deposit', 'purchase', 'sale', 'refund', 'adjustment', 'credit_loan'));

-- 2. Create credit_wallet_loan RPC (mirrors credit_wallet but uses type='credit_loan')
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

  -- Insert credit loan transaction
  INSERT INTO wallet_transactions (user_id, amount_cents, type, currency, ref)
  VALUES (p_user_id, p_amount_cents, 'credit_loan', COALESCE(p_currency, 'usd'), COALESCE(p_ref, 'credit_loan_' || extract(epoch from now())::bigint));

  -- Update profile wallet balance
  UPDATE profiles
  SET wallet_balance = COALESCE(wallet_balance, 0) + p_amount_cents
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;
END;
$$;
