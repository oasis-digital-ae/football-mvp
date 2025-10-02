-- Check if Brighton's snapshots were updated
SELECT 
    'Brighton Updated Snapshots' as debug_type,
    s.id,
    s.team_id,
    s.snapshot_type,
    s.match_result,
    s.market_cap,
    s.price_impact,
    s.effective_at,
    s.trigger_event_id,
    s.trigger_event_type
FROM team_state_snapshots s
WHERE s.team_id = 37
ORDER BY s.effective_at;

-- Test the timeline function
SELECT 
    'Brighton Timeline After Fix' as test_type, 
    event_order,
    event_type,
    event_date,
    description,
    market_cap_before,
    market_cap_after,
    share_price_before,
    share_price_after,
    price_impact,
    match_result
FROM get_team_complete_timeline(37)
ORDER BY event_order;

