-- Migrate to Supabase Auth: Remove Custom Admin System
-- This script removes the custom is_admin column and updates RLS policies to use JWT claims

-- Step 1: Get current admins before dropping column (for reference)
-- Run this query first and save the results:
-- SELECT id, email, username, is_admin FROM profiles WHERE is_admin = true;

-- Step 2: Remove custom admin column
ALTER TABLE profiles DROP COLUMN IF EXISTS is_admin;
DROP INDEX IF EXISTS idx_profiles_is_admin;

-- Step 3: Remove old custom admin policies
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all positions" ON positions;

-- Step 4: Create new JWT-based admin policies
CREATE POLICY "Admins can view all orders" ON orders
FOR SELECT USING (
  (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
);

CREATE POLICY "Admins can view all positions" ON positions
FOR SELECT USING (
  (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
);

-- Step 5: Ensure user-specific policies exist (drop first to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Users can view own positions" ON positions;

CREATE POLICY "Users can view own orders" ON orders
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own positions" ON positions
FOR SELECT USING (auth.uid() = user_id);

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Migration to Supabase Auth complete!';
    RAISE NOTICE '📋 Next steps:';
    RAISE NOTICE '1. Use admin-management.service.ts to set admin roles';
    RAISE NOTICE '2. Update AuthContext to use user.user_metadata.role';
    RAISE NOTICE '3. Test admin access with JWT claims';
END $$;
