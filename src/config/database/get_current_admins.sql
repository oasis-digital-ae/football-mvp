-- Get Current Admins for Migration
-- Run this BEFORE executing migrate_to_supabase_auth.sql
-- Save the results to migrate admin roles to Supabase Auth

SELECT 
    id, 
    email, 
    username, 
    is_admin,
    created_at
FROM profiles 
WHERE is_admin = true
ORDER BY created_at;

-- Copy these user IDs to use with admin-management.service.ts
-- Example usage after migration:
-- await adminManagementService.makeUserAdmin('user-id-here');
