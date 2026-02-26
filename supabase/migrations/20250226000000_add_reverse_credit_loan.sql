-- Add ability to reverse credit loan transactions
-- Apply via Supabase Dashboard SQL Editor or: supabase db push

-- 1. Allow credit_loan_reversal type in wallet_transactions
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN ('deposit', 'purchase', 'sale', 'refund', 'adjustment', 'credit_loan', 'credit_loan_reversal'));

-- 2. Create reverse_credit_loan RPC
CREATE OR REPLACE FUNCTION reverse_credit_loan(
  p_transaction_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_amount_cents bigint;
  v_current_balance bigint;
  v_ref text;
BEGIN
  -- Get the original transaction details
  SELECT user_id, amount_cents, ref
  INTO v_user_id, v_amount_cents, v_ref
  FROM wallet_transactions
  WHERE id = p_transaction_id AND type = 'credit_loan';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit loan transaction not found: %', p_transaction_id;
  END IF;

  -- Check if user has sufficient balance to reverse the loan
  SELECT wallet_balance INTO v_current_balance
  FROM profiles
  WHERE id = v_user_id;

  IF v_current_balance < v_amount_cents THEN
    RAISE EXCEPTION 'Insufficient balance to reverse credit loan. User balance: %, Required: %', v_current_balance, v_amount_cents;
  END IF;

  -- Insert reversal transaction (negative amount)
  INSERT INTO wallet_transactions (user_id, amount_cents, type, currency, ref)
  VALUES (v_user_id, -v_amount_cents, 'credit_loan_reversal', 'usd', COALESCE('reversal_' || v_ref, 'reversal_' || p_transaction_id));

  -- Update profile wallet balance (deduct the loan amount)
  UPDATE profiles
  SET wallet_balance = wallet_balance - v_amount_cents
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', v_user_id;
  END IF;
END;
$$;
