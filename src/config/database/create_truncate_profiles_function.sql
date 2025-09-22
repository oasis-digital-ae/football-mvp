-- =====================================================
-- CREATE TRUNCATE PROFILES FUNCTION
-- Football MVP - Premier League Club Shares Trading Platform
-- =====================================================
-- This script creates a function to safely truncate the profiles table
-- which will cascade delete all related records (positions, orders)

-- =====================================================
-- 1. CREATE FUNCTION TO TRUNCATE PROFILES TABLE
-- =====================================================

CREATE OR REPLACE FUNCTION truncate_profiles_table()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Truncate profiles table (cascades to positions and orders due to foreign keys)
    TRUNCATE TABLE profiles CASCADE;
    
    -- Log the operation
    RAISE NOTICE 'Profiles table truncated successfully - all user data deleted';
END;
$$;

-- =====================================================
-- 2. GRANT EXECUTE PERMISSION TO AUTHENTICATED USERS
-- =====================================================

GRANT EXECUTE ON FUNCTION truncate_profiles_table() TO authenticated;

-- =====================================================
-- 3. SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '✅ TRUNCATE profiles function created successfully!';
    RAISE NOTICE '🗑️ Function: truncate_profiles_table()';
    RAISE NOTICE '🔒 Security: SECURITY DEFINER (runs with elevated privileges)';
    RAISE NOTICE '👥 Access: Available to authenticated users';
    RAISE NOTICE '⚠️ Warning: This will delete ALL user data permanently!';
END $$;
