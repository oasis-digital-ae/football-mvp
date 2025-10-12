-- Add Admin Role to Profiles Table
-- This script adds the is_admin column to the profiles table and creates necessary indexes

-- Add is_admin column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Create index for admin users (partial index for better performance)
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles(is_admin) WHERE is_admin = true;

-- Add comment to document the column
COMMENT ON COLUMN profiles.is_admin IS 'Boolean flag indicating if user has admin privileges';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Admin role column added to profiles table successfully';
END $$;

