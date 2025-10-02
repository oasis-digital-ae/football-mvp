-- =====================================================
-- TEST: Check what snapshots exist and what get_team_state_at_time returns
-- =====================================================

-- First, let's see all Manchester United snapshots
SELECT 
    'All Manchester United snapshots' as description,
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

-- Test get_team_state_at_time for each match date
SELECT 
    'Test: Liverpool match time (Sep 1)' as test_description,
    *
FROM get_team_state_at_time(28, '2024-09-01 15:00:00+00'::timestamp with time zone);

SELECT 
    'Test: Southampton match time (Sep 14)' as test_description,
    *
FROM get_team_state_at_time(28, '2024-09-14 15:00:00+00'::timestamp with time zone);

-- Test what happens if we look for a time just before Southampton match
SELECT 
    'Test: Just before Southampton match (Sep 14 14:59)' as test_description,
    *
FROM get_team_state_at_time(28, '2024-09-14 14:59:00+00'::timestamp with time zone);

