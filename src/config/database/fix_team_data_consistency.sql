-- =====================================================
-- FIX EXISTING TEAM DATA CONSISTENCY
-- =====================================================
-- This script fixes inconsistent share data in the teams table
-- before creating the team_state_snapshots table

-- First, let's see what the current data looks like
SELECT 
    id,
    name,
    market_cap,
    shares_outstanding,
    total_shares,
    available_shares,
    CASE 
        WHEN shares_outstanding > 0 
        THEN market_cap / shares_outstanding 
        ELSE 20.00 
    END as calculated_price
FROM teams 
ORDER BY id;

-- Fix inconsistent share data
UPDATE teams 
SET 
    -- Ensure total_shares is at least as large as shares_outstanding
    total_shares = CASE 
        WHEN total_shares IS NULL OR total_shares < shares_outstanding 
        THEN shares_outstanding 
        ELSE total_shares 
    END,
    -- Ensure available_shares doesn't exceed shares_outstanding
    available_shares = CASE 
        WHEN available_shares IS NULL OR available_shares > shares_outstanding 
        THEN shares_outstanding 
        ELSE available_shares 
    END
WHERE 
    total_shares IS NULL 
    OR total_shares < shares_outstanding 
    OR available_shares IS NULL 
    OR available_shares > shares_outstanding;

-- Verify the fix
SELECT 
    id,
    name,
    market_cap,
    shares_outstanding,
    total_shares,
    available_shares,
    CASE 
        WHEN shares_outstanding > 0 
        THEN market_cap / shares_outstanding 
        ELSE 20.00 
    END as calculated_price,
    -- Check if data is now consistent
    CASE 
        WHEN total_shares >= shares_outstanding AND available_shares <= shares_outstanding
        THEN 'CONSISTENT'
        ELSE 'INCONSISTENT'
    END as data_status
FROM teams 
ORDER BY id;

-- =====================================================
-- DROP AND RECREATE TEAM_STATE_SNAPSHOTS TABLE
-- =====================================================

-- Drop existing table if it exists
DROP TABLE IF EXISTS team_state_snapshots CASCADE;

-- Drop existing functions
DROP FUNCTION IF EXISTS create_team_snapshot(integer, text, integer, text, text, decimal, integer, decimal);
DROP FUNCTION IF EXISTS get_team_state_at_time(integer, timestamp with time zone);
DROP FUNCTION IF EXISTS get_team_state_history(integer, timestamp with time zone, timestamp with time zone);

-- Drop existing views
DROP VIEW IF EXISTS current_team_states;

-- Drop existing triggers
DROP TRIGGER IF EXISTS team_market_cap_snapshot_trigger ON teams;


