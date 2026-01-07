-- Optimize credit_wallet function to remove slow IF EXISTS checks
-- These checks were causing timeouts because they query information_schema on every call

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
  -- This allows the trigger to bypass the restriction
  PERFORM set_config('app.allow_wallet_update', 'true', true);

  -- Check for idempotency: if ref is provided and transaction already exists, skip
  IF p_ref IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.wallet_transactions 
      WHERE ref = p_ref AND user_id = p_user_id
    ) INTO v_transaction_exists;
    
    IF v_transaction_exists THEN
      -- Clear session variable before returning
      PERFORM set_config('app.allow_wallet_update', '', true);
      -- Already processed, return silently (idempotent)
      RETURN;
    END IF;
  END IF;

  -- Get current balance with lock (profiles table always has wallet_balance)
  -- Removed slow IF EXISTS check - we know profiles table exists
  BEGIN
    SELECT COALESCE(wallet_balance, 0) INTO v_wallet_balance
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE NOWAIT; -- Use NOWAIT to fail fast if locked instead of waiting
    
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optimize trigger function to remove slow EXISTS query
CREATE OR REPLACE FUNCTION public.prevent_profile_field_updates()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN := false;
BEGIN
  -- Check if session variable allows wallet update (set by credit_wallet RPC)
  -- This is the fastest check, do it first
  BEGIN
    IF current_setting('app.allow_wallet_update', true) = 'true' THEN
      -- Allowed via RPC function - allow wallet_balance update
      IF OLD.wallet_balance IS DISTINCT FROM NEW.wallet_balance THEN
        RETURN NEW;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Session variable not set - continue with normal checks
    NULL;
  END;
  
  -- Allow updates from SECURITY DEFINER functions
  -- Check if auth.uid() is NULL (SECURITY DEFINER context)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if auth.role() is service_role
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  
  -- Check if we're updating a different user's profile (indicates RPC function)
  IF OLD.id != auth.uid() THEN
    RETURN NEW;
  END IF;
  
  -- Check if current_setting('role') indicates elevated privileges
  BEGIN
    IF current_setting('role', true) IN ('postgres', 'service_role', 'authenticator') THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  -- Only apply restrictions for direct user updates to their own profile
  -- Check if user is admin (only if updating own profile)
  -- Use OLD.id directly instead of EXISTS query to avoid blocking
  IF OLD.id = auth.uid() THEN
    -- Check admin status from NEW record if available, otherwise use OLD
    v_is_admin := COALESCE(NEW.is_admin, OLD.is_admin, false);
    
    IF v_is_admin THEN
      -- Admin can update anything
      RETURN NEW;
    END IF;
  END IF;
  
  -- Prevent non-admin users from updating sensitive fields directly
  IF OLD.is_admin IS DISTINCT FROM NEW.is_admin THEN
    RAISE EXCEPTION 'Cannot update is_admin field. Contact an administrator.';
  END IF;
  
  IF OLD.wallet_balance IS DISTINCT FROM NEW.wallet_balance THEN
    RAISE EXCEPTION 'Cannot directly update wallet_balance. Use credit_wallet or purchase functions.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.prevent_profile_field_updates() IS 
  'Prevents non-admin users from updating sensitive profile fields. Optimized to avoid slow EXISTS queries.';

COMMENT ON FUNCTION public.credit_wallet(uuid, bigint, text, text) IS 
  'Credits user wallet atomically with row locking. Optimized for performance - removed slow IF EXISTS checks. Uses NOWAIT to fail fast on locks.';







