-- Check Brighton's fixtures to see what matches should have snapshots
SELECT 
    'Brighton Fixtures' as debug_type,
    f.id,
    f.kickoff_at,
    f.home_team_id,
    f.away_team_id,
    f.result,
    f.status,
    f.home_score,
    f.away_score,
    ht.name as home_team,
    at.name as away_team
FROM fixtures f
JOIN teams ht ON f.home_team_id = ht.id
JOIN teams at ON f.away_team_id = at.id
WHERE (f.home_team_id = 37 OR f.away_team_id = 37)
ORDER BY f.kickoff_at
LIMIT 10;

