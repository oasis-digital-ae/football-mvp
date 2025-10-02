-- Drop cash_injections table and related objects
-- This removes the table we no longer need since we're using the orders table instead

-- Drop the table (this will also drop the sequence and any related objects)
DROP TABLE IF EXISTS cash_injections CASCADE;

-- Drop the sequence if it exists separately
DROP SEQUENCE IF EXISTS cash_injections_id_seq CASCADE;

-- Drop any views that might reference the table
DROP VIEW IF EXISTS cash_injection_summary CASCADE;
DROP VIEW IF EXISTS cash_injections_detailed CASCADE;

-- Drop any functions that might reference the table
DROP FUNCTION IF EXISTS get_cash_injections_between_fixtures(integer, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS get_team_cash_injection_timeline(integer) CASCADE;

-- Note: RLS policies will be automatically dropped with the table


