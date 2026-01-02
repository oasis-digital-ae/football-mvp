-- Fix trigger using session variable approach
-- credit_wallet will set a session variable before updating, and the trigger will check for it
-- This is more reliable than trying to detect SECURITY DEFINER context

-- First, update credit_wallet to set a session variable
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
      -- Already processed, return silently (idempotent)
      RETURN;
    END IF;
  END IF;

  -- Lock profile row for update to prevent race conditions
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='profiles' AND column_name='wallet_balance'
  ) THEN
    -- Get current balance with lock
    SELECT COALESCE(wallet_balance, 0) INTO v_wallet_balance
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'User profile not found: %', p_user_id;
    END IF;
    
    -- Calculate new balance
    v_new_wallet_balance := v_wallet_balance + (p_amount_cents::numeric / 100.0);
    
    -- Update wallet balance atomically
    UPDATE public.profiles
    SET wallet_balance = v_new_wallet_balance
    WHERE id = p_user_id;
    
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='users' AND column_name='wallet_balance'
  ) THEN
    -- Get current balance with lock
    SELECT COALESCE(wallet_balance, 0) INTO v_wallet_balance
    FROM public.users
    WHERE id = p_user_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'User not found: %', p_user_id;
    END IF;
    
    -- Calculate new balance
    v_new_wallet_balance := v_wallet_balance + (p_amount_cents::numeric / 100.0);
    
    -- Update wallet balance atomically
    UPDATE public.users
    SET wallet_balance = v_new_wallet_balance
    WHERE id = p_user_id;
  ELSE
    RAISE EXCEPTION 'No wallet_balance column found on profiles or users';
  END IF;

  -- Insert wallet transaction record (atomic within same transaction)
  INSERT INTO public.wallet_transactions(user_id, amount_cents, currency, type, ref)
  VALUES (p_user_id, p_amount_cents, p_currency, 'deposit', p_ref);
  
  -- Clear the session variable
  PERFORM set_config('app.allow_wallet_update', '', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Now update the trigger to check for this session variable
CREATE OR REPLACE FUNCTION public.prevent_profile_field_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if session variable allows wallet update (set by credit_wallet RPC)
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
  -- Check if user is admin
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = true
  ) THEN
    -- Admin can update anything
    RETURN NEW;
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
  'Prevents non-admin users from updating sensitive profile fields. Checks session variable app.allow_wallet_update set by credit_wallet RPC.';

COMMENT ON FUNCTION public.credit_wallet(uuid, bigint, text, text) IS 
  'Credits user wallet atomically with row locking. Sets session variable to allow trigger bypass. Idempotent if ref is provided.';




