-- Fix incorrect opponent_team_id and opponent_team_name in total_ledger
-- This fixes entries where opponent_team_id equals team_id (team playing against itself)

UPDATE total_ledger tl
SET 
    opponent_team_id = CASE 
        WHEN tl.team_id = f.home_team_id THEN f.away_team_id
        WHEN tl.team_id = f.away_team_id THEN f.home_team_id
        ELSE tl.opponent_team_id
    END,
    opponent_team_name = CASE 
        WHEN tl.team_id = f.home_team_id THEN away_team.name
        WHEN tl.team_id = f.away_team_id THEN home_team.name
        ELSE tl.opponent_team_name
    END,
    event_description = CASE 
        WHEN tl.team_id = f.home_team_id THEN CONCAT('Match vs ', away_team.name)
        WHEN tl.team_id = f.away_team_id THEN CONCAT('Match vs ', home_team.name)
        ELSE tl.event_description
    END
FROM fixtures f
JOIN teams home_team ON f.home_team_id = home_team.id
JOIN teams away_team ON f.away_team_id = away_team.id
WHERE tl.trigger_event_id = f.id
  AND tl.trigger_event_type = 'fixture'
  AND tl.ledger_type IN ('match_win', 'match_loss', 'match_draw')
  AND (tl.opponent_team_id = tl.team_id OR tl.opponent_team_id IS NULL);

-- Log the fix
DO $$
DECLARE
    fixed_count INTEGER;
BEGIN
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    RAISE NOTICE 'Fixed % entries with incorrect opponent information', fixed_count;
END $$;






