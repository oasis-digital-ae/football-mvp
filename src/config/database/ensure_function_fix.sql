-- =====================================================
-- ENSURE: get_team_state_at_time function is correct
-- =====================================================

-- Drop and recreate the function to ensure it's correct
DROP FUNCTION IF EXISTS get_team_state_at_time(INTEGER, TIMESTAMP WITH TIME ZONE);

CREATE OR REPLACE FUNCTION get_team_state_at_time(
    p_team_id INTEGER,
    p_at_time TIMESTAMP WITH TIME ZONE
) RETURNS TABLE (
    market_cap DECIMAL(15,2),
    shares_outstanding INTEGER,
    current_share_price DECIMAL(10,2),
    snapshot_type TEXT,
    effective_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.market_cap,
        s.shares_outstanding,
        s.current_share_price,
        s.snapshot_type,
        s.effective_at
    FROM team_state_snapshots s
    WHERE s.team_id = p_team_id 
        AND s.effective_at < p_at_time  -- Use < not <=
    ORDER BY s.effective_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Test the function
SELECT 
    'Function test: Liverpool match time' as test_description,
    *
FROM get_team_state_at_time(28, '2024-09-01 15:00:00+00'::timestamp with time zone);

SELECT 
    'Function test: Southampton match time' as test_description,
    *
FROM get_team_state_at_time(28, '2024-09-14 11:30:00+00'::timestamp with time zone);

