-- Fix trigger to properly detect SECURITY DEFINER function calls
-- The issue is that current_setting('role') doesn't reliably detect SECURITY DEFINER context
-- Better approach: Check if auth.uid() is NULL (which happens in SECURITY DEFINER functions)
-- OR check if we're updating a different user's profile (which indicates RPC function call)

CREATE OR REPLACE FUNCTION public.prevent_profile_field_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow updates from SECURITY DEFINER functions
  -- SECURITY DEFINER functions run with function owner privileges, so auth.uid() may be NULL
  -- OR we might be updating a different user's profile (which indicates RPC function call)
  
  -- Check 1: If auth.uid() is NULL, we're in a SECURITY DEFINER context
  IF auth.uid() IS NULL THEN
    -- SECURITY DEFINER function context - allow the update
    RETURN NEW;
  END IF;
  
  -- Check 2: If auth.role() is service_role, allow
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  
  -- Check 3: If we're updating a different user's profile, it's likely an RPC function
  -- (users can't update other users' profiles directly due to RLS)
  IF OLD.id != auth.uid() THEN
    -- Updating someone else's profile - must be an RPC function
    RETURN NEW;
  END IF;
  
  -- Check 4: If current_setting('role') indicates elevated privileges
  BEGIN
    IF current_setting('role', true) IN ('postgres', 'service_role', 'authenticator') THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- If setting doesn't exist, continue with normal checks
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
  'Prevents non-admin users from updating sensitive profile fields (is_admin, wallet_balance). Allows SECURITY DEFINER functions to update wallet_balance by detecting NULL auth.uid() or different user ID.';



