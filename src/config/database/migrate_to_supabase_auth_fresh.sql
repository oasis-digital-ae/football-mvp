-- Fresh Migration to Supabase Auth
-- This script removes the custom is_admin column and updates RLS policies to use JWT claims

-- Step 1: Remove old custom admin policies FIRST (they depend on is_admin column)
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all positions" ON positions;

-- Step 2: Now we can safely remove the custom admin column
ALTER TABLE profiles DROP COLUMN IF EXISTS is_admin;
DROP INDEX IF EXISTS idx_profiles_is_admin;

-- Create new JWT-based admin policies
CREATE POLICY "Admins can view all orders" ON orders
FOR SELECT USING (
  (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
);

CREATE POLICY "Admins can view all positions" ON positions
FOR SELECT USING (
  (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
);

-- Drop and recreate user-specific policies
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Users can view own positions" ON positions;

CREATE POLICY "Users can view own orders" ON orders
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own positions" ON positions
FOR SELECT USING (auth.uid() = user_id);

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration to Supabase Auth complete!';
    RAISE NOTICE 'Next: Use admin-management.service.ts to set admin roles';
END $$;
