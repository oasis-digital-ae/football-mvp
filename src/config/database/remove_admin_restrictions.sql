-- Remove Admin Restrictions - Make Admin Panel Visible to Everyone
-- This script removes admin-only RLS policies so all users can access admin data

-- Remove admin-only policies for orders
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;

-- Remove admin-only policies for positions  
DROP POLICY IF EXISTS "Admins can view all positions" ON positions;

-- Drop existing user policies first to avoid conflicts
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Users can view own positions" ON positions;

-- Create basic user policies
CREATE POLICY "Users can view own orders" ON orders
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own positions" ON positions
FOR SELECT USING (auth.uid() = user_id);

-- Allow all authenticated users to view all orders and positions
CREATE POLICY "All users can view all orders" ON orders
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "All users can view all positions" ON positions
FOR SELECT USING (auth.uid() IS NOT NULL);

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Admin restrictions removed!';
    RAISE NOTICE '📋 Admin panel is now visible to all users';
    RAISE NOTICE '🔓 All users can view orders and positions data';
END $$;
