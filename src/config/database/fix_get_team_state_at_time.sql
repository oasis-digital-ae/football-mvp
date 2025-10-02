-- =====================================================
-- FIX: Update get_team_state_at_time function
-- =====================================================
-- The issue was that the function was using <= instead of <
-- This caused it to find the current match's snapshot instead of the previous one
-- =====================================================

-- Update the function to use < instead of <=
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
        AND s.effective_at < p_at_time  -- Changed from <= to <
    ORDER BY s.effective_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Test the function with Manchester United's Southampton match
-- This should now find the Liverpool match snapshot (Sep 1) when looking for Sep 14
SELECT 
    'Testing get_team_state_at_time for Manchester United at Southampton match time' as test_description,
    *
FROM get_team_state_at_time(28, '2024-09-14 15:00:00+00'::timestamp with time zone);

-- Also test what snapshots exist for Manchester United
SELECT 
    'All Manchester United snapshots' as test_description,
    id,
    team_id,
    snapshot_type,
    match_result,
    market_cap,
    current_share_price,
    effective_at,
    trigger_event_id
FROM team_state_snapshots 
WHERE team_id = 28 
ORDER BY effective_at ASC;

