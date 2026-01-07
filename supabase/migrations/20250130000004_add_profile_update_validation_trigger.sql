-- Add trigger function to prevent users from updating sensitive profile fields
-- This complements the RLS policy by adding additional validation

CREATE OR REPLACE FUNCTION public.prevent_profile_field_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Only apply restrictions if user is not an admin
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

-- Create trigger
DROP TRIGGER IF EXISTS check_profile_field_updates ON public.profiles;
CREATE TRIGGER check_profile_field_updates
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_field_updates();

COMMENT ON FUNCTION public.prevent_profile_field_updates() IS 
  'Prevents non-admin users from updating sensitive profile fields (is_admin, wallet_balance)';








