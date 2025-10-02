-- =====================================================
-- DEBUG: Test what get_team_state_at_time is returning
-- =====================================================

-- Test the function for each match date
SELECT 
    'Test: Fulham match time (Aug 16)' as test_description,
    *
FROM get_team_state_at_time(28, '2024-08-16 19:00:00+00'::timestamp with time zone);

SELECT 
    'Test: Brighton match time (Aug 24)' as test_description,
    *
FROM get_team_state_at_time(28, '2024-08-24 11:30:00+00'::timestamp with time zone);

SELECT 
    'Test: Liverpool match time (Sep 1)' as test_description,
    *
FROM get_team_state_at_time(28, '2024-09-01 15:00:00+00'::timestamp with time zone);

SELECT 
    'Test: Southampton match time (Sep 14)' as test_description,
    *
FROM get_team_state_at_time(28, '2024-09-14 11:30:00+00'::timestamp with time zone);

-- Also test what happens if we look for times just before each match
SELECT 
    'Test: Just before Liverpool match (Sep 1 14:59)' as test_description,
    *
FROM get_team_state_at_time(28, '2024-09-01 14:59:00+00'::timestamp with time zone);

SELECT 
    'Test: Just before Southampton match (Sep 14 11:29)' as test_description,
    *
FROM get_team_state_at_time(28, '2024-09-14 11:29:00+00'::timestamp with time zone);

-- Check what snapshots exist for Manchester United
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

