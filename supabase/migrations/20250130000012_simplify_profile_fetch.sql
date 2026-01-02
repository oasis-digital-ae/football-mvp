-- Simplify profile operations - ensure RLS allows proper access
-- The issue is likely that fetchProfile is being called before the user is fully authenticated
-- or RLS policies are blocking reads

-- Verify that profiles_select_own policy allows users to read their own profile
-- This should already exist, but let's make sure it's correct

-- The current policy should be:
-- FOR SELECT USING (auth.uid() = id)
-- This is correct and should work

-- However, we might need to ensure the function can read profiles even during initial auth
-- Let's check if we need to add a policy that allows reading during profile creation

-- Actually, the issue might be that we're calling fetchProfile too early
-- before the session is fully established. Let's add better error handling in the frontend.

-- For now, let's ensure the RPC function has proper permissions
GRANT EXECUTE ON FUNCTION public.create_or_update_profile_atomic(uuid, text, text, text, text, date, text, text) TO authenticated, anon;

-- Also ensure the function can bypass RLS when needed (it's SECURITY DEFINER, so it should)
-- But let's verify it can read profiles
COMMENT ON FUNCTION public.create_or_update_profile_atomic(uuid, text, text, text, text, date, text, text) IS 
  'Atomically creates or updates user profile. Uses INSERT ... ON CONFLICT for atomicity. SECURITY DEFINER allows bypassing RLS.';




