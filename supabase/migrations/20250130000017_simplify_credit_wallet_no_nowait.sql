-- Simplify credit_wallet function - remove NOWAIT which might be causing timeout issues
-- Use regular FOR UPDATE instead, which will wait briefly but shouldn't timeout

CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_user_id uuid, 
  p_amount_cents bigint, 
  p_ref text, 
  p_currency text default 'usd'
)
RETURNS void AS $$
DECLARE
  v_wallet_balance NUMERIC;
  v_new_wallet_balance NUMERIC;
  v_transaction_exists BOOLEAN;
BEGIN
  -- Validate input
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Set session variable to indicate we're updating wallet_balance via RPC
  PERFORM set_config('app.allow_wallet_update', 'true', true);

  -- Check for idempotency: if ref is provided and transaction already exists, skip
  IF p_ref IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.wallet_transactions 
      WHERE ref = p_ref AND user_id = p_user_id
    ) INTO v_transaction_exists;
    
    IF v_transaction_exists THEN
      PERFORM set_config('app.allow_wallet_update', '', true);
      RETURN; -- Already processed (idempotent)
    END IF;
  END IF;

  -- Get current balance with lock (use regular FOR UPDATE, not NOWAIT)
  -- This will wait briefly if locked, but should complete quickly
  SELECT COALESCE(wallet_balance, 0) INTO v_wallet_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE EXCEPTION 'User profile not found: %', p_user_id;
  END IF;
  
  -- Calculate new balance
  v_new_wallet_balance := v_wallet_balance + (p_amount_cents::numeric / 100.0);
  
  -- Update wallet balance atomically
  UPDATE public.profiles
  SET wallet_balance = v_new_wallet_balance
  WHERE id = p_user_id;

  -- Insert wallet transaction record
  INSERT INTO public.wallet_transactions(user_id, amount_cents, currency, type, ref)
  VALUES (p_user_id, p_amount_cents, p_currency, 'deposit', p_ref);
  
  -- Clear the session variable
  PERFORM set_config('app.allow_wallet_update', '', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.credit_wallet(uuid, bigint, text, text) IS 
  'Credits user wallet atomically. Simplified version without NOWAIT to avoid timeout issues.';







