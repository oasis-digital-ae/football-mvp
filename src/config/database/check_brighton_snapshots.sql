-- Check all snapshots for Brighton
SELECT 
    'All Brighton Snapshots' as debug_type,
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

