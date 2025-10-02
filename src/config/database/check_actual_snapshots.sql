-- =====================================================
-- CHECK: What snapshots actually exist for Manchester United
-- =====================================================

SELECT 
    'All Manchester United snapshots (ordered by effective_at)' as description,
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

-- Check what the function returns for each match
SELECT 
    'Function result for Liverpool match time' as test_description,
    *
FROM get_team_state_at_time(28, '2024-09-01 15:00:00+00'::timestamp with time zone);

SELECT 
    'Function result for Southampton match time' as test_description,
    *
FROM get_team_state_at_time(28, '2024-09-14 11:30:00+00'::timestamp with time zone);

