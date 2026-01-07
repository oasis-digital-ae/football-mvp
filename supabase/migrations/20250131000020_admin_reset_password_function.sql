-- Admin function to reset user password
-- This function allows admins to reset passwords directly
-- Usage: SELECT admin_reset_user_password('user@email.com', 'NewPassword123!');

CREATE OR REPLACE FUNCTION admin_reset_user_password(
  p_email TEXT,
  p_new_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_result JSON;
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can reset passwords';
  END IF;

  -- Find user by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = LOWER(p_email);

  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  -- Note: Direct password update in auth.users requires service role
  -- This function will need to be called via Supabase Admin API
  -- For now, return instructions
  RETURN json_build_object(
    'success', false,
    'message', 'Password reset requires Supabase Admin API. Use the reset script or Supabase Dashboard.',
    'user_id', v_user_id,
    'email', p_email
  );
END;
$$;

COMMENT ON FUNCTION admin_reset_user_password IS 
  'Admin function to reset user passwords. Note: Requires Supabase Admin API for actual password update.';



