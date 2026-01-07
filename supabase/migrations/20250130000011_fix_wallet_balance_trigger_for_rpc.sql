-- Fix trigger to allow SECURITY DEFINER functions (like credit_wallet) to update wallet_balance
-- The trigger should only block direct user updates, not RPC function updates

CREATE OR REPLACE FUNCTION public.prevent_profile_field_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow updates from SECURITY DEFINER functions (RPC functions run as function owner/service_role)
  -- Check if current role is service_role or if we're in a SECURITY DEFINER context
  IF auth.role() = 'service_role' THEN
    -- Service role can update anything
    RETURN NEW;
  END IF;
  
  -- Check if this is being called from a SECURITY DEFINER function
  -- SECURITY DEFINER functions run with elevated privileges, so we should allow them
  -- We can detect this by checking if auth.uid() is different from the profile being updated
  -- or if we're in a function context (though this is harder to detect)
  -- A simpler approach: check if the current_setting('role') is postgres or service_role
  IF current_setting('role', true) IN ('postgres', 'service_role', 'authenticator') THEN
    -- Likely called from a SECURITY DEFINER function, allow the update
    RETURN NEW;
  END IF;
  
  -- Only apply restrictions if user is not an admin AND this is a direct user update
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = true
  ) THEN
    -- Prevent users from updating is_admin field
    IF OLD.is_admin IS DISTINCT FROM NEW.is_admin THEN
      RAISE EXCEPTION 'Cannot update is_admin field. Contact an administrator.';
    END IF;
    
    -- Prevent users from directly updating wallet_balance (must use RPC functions)
    IF OLD.wallet_balance IS DISTINCT FROM NEW.wallet_balance THEN
      RAISE EXCEPTION 'Cannot directly update wallet_balance. Use credit_wallet or purchase functions.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.prevent_profile_field_updates() IS 
  'Prevents non-admin users from updating sensitive profile fields (is_admin, wallet_balance). Allows SECURITY DEFINER functions to update wallet_balance.';







