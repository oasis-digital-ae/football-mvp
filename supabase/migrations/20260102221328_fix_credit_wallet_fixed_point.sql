-- Fix credit_wallet function for fixed-point arithmetic (BIGINT cents)
-- The wallet_balance column is now BIGINT (cents), so we should store cents directly
-- instead of dividing by 100

CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_user_id uuid,
  p_amount_cents bigint,
  p_ref text,
  p_currency text default 'usd'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_balance_cents BIGINT;
  v_new_wallet_balance_cents BIGINT;
BEGIN
  -- Validate inputs
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Set session variable to allow wallet_balance update
  PERFORM set_config('app.allow_wallet_update', 'true', true);

  -- Get current balance with lock (profiles table always has wallet_balance as BIGINT)
  BEGIN
    SELECT COALESCE(wallet_balance, 0) INTO v_wallet_balance_cents
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE NOWAIT; -- Use NOWAIT to fail fast if locked instead of waiting
    
    IF NOT FOUND THEN
      PERFORM set_config('app.allow_wallet_update', '', true);
      RAISE EXCEPTION 'User profile not found: %', p_user_id;
    END IF;
    
    -- Calculate new balance (both values are in cents, so just add them)
    v_new_wallet_balance_cents := v_wallet_balance_cents + p_amount_cents;
    
    -- Update wallet balance atomically (store as BIGINT cents)
    UPDATE public.profiles
    SET wallet_balance = v_new_wallet_balance_cents
    WHERE id = p_user_id;
    
  EXCEPTION WHEN lock_not_available THEN
    -- Row is locked by another transaction
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE EXCEPTION 'Wallet is currently being updated. Please try again in a moment.';
  WHEN OTHERS THEN
    -- Any other error
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE;
  END;

  -- Insert wallet transaction record (atomic within same transaction)
  INSERT INTO public.wallet_transactions(user_id, amount_cents, currency, type, ref)
  VALUES (p_user_id, p_amount_cents, p_currency, 'deposit', p_ref);
  
  -- Clear the session variable
  PERFORM set_config('app.allow_wallet_update', '', true);
END;
$$;

COMMENT ON FUNCTION public.credit_wallet(uuid, bigint, text, text) IS 
  'Credits user wallet atomically with row locking. Fixed-point arithmetic: wallet_balance is BIGINT (cents). p_amount_cents should be in cents (e.g., 100000 for $1000). Idempotent if ref is provided.';

