-- Fix Fixtures RLS for Admin Sync
-- The sync function uses UPSERT which requires both INSERT and UPDATE permissions
-- Currently admins only have UPDATE permission, causing RLS violations

-- Add INSERT policy for admins
CREATE POLICY fixtures_admin_insert ON public.fixtures
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Also ensure admins can INSERT via the service role policy if needed
-- The existing fixtures_admin_update policy already handles UPDATE

COMMENT ON POLICY fixtures_admin_insert ON public.fixtures IS 
  'Admins can insert fixtures (needed for sync operations that use UPSERT)';





