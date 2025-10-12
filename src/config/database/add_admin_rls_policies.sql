-- Add Admin RLS Policies
-- This script adds RLS policies to allow admins to view all orders and positions

-- Allow admins to view all orders
CREATE POLICY "Admins can view all orders" ON orders
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

-- Allow admins to view all positions
CREATE POLICY "Admins can view all positions" ON positions
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.is_admin = true
  )
);

-- Allow anyone to view filled orders (for transparency in public timeline)
CREATE POLICY "Anyone can view filled orders" ON orders
FOR SELECT USING (status = 'FILLED');

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Admin RLS policies added successfully';
END $$;

