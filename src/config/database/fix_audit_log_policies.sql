-- Fix Audit Log RLS Policies
-- The existing policies have incorrect qual conditions

-- Drop the existing policies with wrong conditions
DROP POLICY IF EXISTS "Users can insert own audit logs" ON audit_log;
DROP POLICY IF EXISTS "System can insert audit logs" ON audit_log;

-- Recreate with correct conditions
CREATE POLICY "Users can insert own audit logs" ON audit_log
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can insert audit logs" ON audit_log
FOR INSERT WITH CHECK (user_id IS NULL);

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Audit log RLS policies fixed successfully';
END $$;

