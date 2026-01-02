-- Fix Profiles RLS Policy Circular Dependency
-- The current policy has a circular dependency where checking admin status requires reading profiles
-- This can cause issues when fetching the profile. We'll simplify it.

-- Drop the problematic policy
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;

-- Create a simpler policy: Users can always read their own profile
-- This avoids the circular dependency
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Create a separate policy for admins to view all profiles
-- This uses a function to avoid circular dependency
CREATE OR REPLACE FUNCTION public.is_user_admin(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = user_id
    AND profiles.is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Now create admin policy using the function
CREATE POLICY "profiles_admin_select" ON public.profiles
  FOR SELECT
  USING (public.is_user_admin(auth.uid()));

-- Grant execute on the function
GRANT EXECUTE ON FUNCTION public.is_user_admin(uuid) TO authenticated, anon;

COMMENT ON FUNCTION public.is_user_admin(uuid) IS 
  'Check if a user is an admin. Uses SECURITY DEFINER to avoid RLS circular dependency.';

COMMENT ON POLICY "profiles_select_own" ON public.profiles IS 
  'Users can always view their own profile. No circular dependency.';

COMMENT ON POLICY "profiles_admin_select" ON public.profiles IS 
  'Admins can view all profiles. Uses helper function to avoid circular dependency.';





