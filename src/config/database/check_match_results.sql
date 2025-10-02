-- Check what match_result values exist in snapshots
SELECT 
    'Match Result Values' as debug_type,
    s.match_result,
    COUNT(*) as count,
    STRING_AGG(DISTINCT t.name, ', ') as teams
FROM team_state_snapshots s
JOIN teams t ON s.team_id = t.id
WHERE s.snapshot_type = 'match_result'
GROUP BY s.match_result
ORDER BY count DESC;

