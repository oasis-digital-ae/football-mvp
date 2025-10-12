-- Revert to is_admin Column System
-- This script restores the original is_admin column and policies

-- Step 1: Add back the is_admin column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles(is_admin) WHERE is_admin = true;

-- Step 2: Remove JWT-based admin policies
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all positions" ON positions;

-- Step 3: Create original is_admin based policies
CREATE POLICY "Admins can view all orders" ON orders
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

CREATE POLICY "Admins can view all positions" ON positions
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

-- Step 4: Ensure user-specific policies exist
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Users can view own positions" ON positions;

CREATE POLICY "Users can view own orders" ON orders
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own positions" ON positions
FOR SELECT USING (auth.uid() = user_id);

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Reverted to is_admin column system!';
    RAISE NOTICE '📋 Next steps:';
    RAISE NOTICE '1. Update AuthContext to use is_admin column again';
    RAISE NOTICE '2. Set is_admin = true for your user in profiles table';
    RAISE NOTICE '3. Test admin panel access';
END $$;
