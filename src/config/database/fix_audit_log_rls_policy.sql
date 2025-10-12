-- Fix Audit Log RLS Policies
-- Add missing policies to allow users and system to insert audit logs

-- Allow users to insert their own audit logs
CREATE POLICY "Users can insert own audit logs" ON audit_log
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow system to insert audit logs (user_id IS NULL)
CREATE POLICY "System can insert audit logs" ON audit_log
FOR INSERT WITH CHECK (user_id IS NULL);

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Audit log RLS policies added successfully - users and system can now insert audit logs';
END $$;