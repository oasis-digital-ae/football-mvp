-- Check snapshot counts for all teams
SELECT 
    'Snapshot Counts' as debug_type,
    t.name as team_name,
    t.id as team_id,
    COUNT(*) as total_snapshots,
    COUNT(CASE WHEN s.snapshot_type = 'initial' THEN 1 END) as initial_snapshots,
    COUNT(CASE WHEN s.snapshot_type = 'match_result' THEN 1 END) as match_snapshots,
    COUNT(CASE WHEN s.snapshot_type = 'share_purchase' THEN 1 END) as purchase_snapshots
FROM teams t
LEFT JOIN team_state_snapshots s ON t.id = s.team_id
GROUP BY t.id, t.name
ORDER BY total_snapshots DESC
LIMIT 10;

