-- Debug the trigger timing issue
-- Check if transfers exist within the 5-minute window for the teams that got manual_adjustment

-- Check transfer timing for team 34 (got manual_adjustment)
SELECT 
    'Team 34 Transfer Check' as test_type,
    tl.id,
    tl.winner_team_id,
    tl.loser_team_id,
    tl.applied_at,
    NOW() as current_time,
    (NOW() - tl.applied_at) as time_diff,
    (NOW() - tl.applied_at) < INTERVAL '5 minutes' as within_5_minutes
FROM transfers_ledger tl
WHERE tl.winner_team_id = 34 OR tl.loser_team_id = 34
ORDER BY tl.applied_at DESC;

-- Check transfer timing for team 26 (got manual_adjustment)
SELECT 
    'Team 26 Transfer Check' as test_type,
    tl.id,
    tl.winner_team_id,
    tl.loser_team_id,
    tl.applied_at,
    NOW() as current_time,
    (NOW() - tl.applied_at) as time_diff,
    (NOW() - tl.applied_at) < INTERVAL '5 minutes' as within_5_minutes
FROM transfers_ledger tl
WHERE tl.winner_team_id = 26 OR tl.loser_team_id = 26
ORDER BY tl.applied_at DESC;

-- Check when the team updates happened vs transfer creation
SELECT 
    'Timing Analysis' as test_type,
    tl.id as transfer_id,
    tl.applied_at as transfer_time,
    tl.winner_team_id,
    tl.loser_team_id,
    tl_winner.event_date as winner_team_update_time,
    tl_loser.event_date as loser_team_update_time,
    (tl_winner.event_date - tl.applied_at) as winner_time_diff,
    (tl_loser.event_date - tl.applied_at) as loser_time_diff
FROM transfers_ledger tl
LEFT JOIN total_ledger tl_winner ON tl.winner_team_id = tl_winner.team_id 
    AND tl_winner.ledger_type = 'manual_adjustment'
    AND tl_winner.event_date > tl.applied_at
LEFT JOIN total_ledger tl_loser ON tl.loser_team_id = tl_loser.team_id 
    AND tl_loser.ledger_type = 'manual_adjustment'
    AND tl_loser.event_date > tl.applied_at
ORDER BY tl.applied_at;

-- The issue might be that team updates happen after the 5-minute window
-- Let's check if we can manually create proper match entries for existing transfers
SELECT 
    'Manual Match Entry Creation' as test_type,
    'Creating match entries for existing transfers' as action;

-- Create match win entries for existing transfers
INSERT INTO total_ledger (
    team_id,
    ledger_type,
    event_date,
    event_description,
    trigger_event_id,
    trigger_event_type,
    opponent_team_id,
    opponent_team_name,
    match_result,
    is_home_match,
    amount_transferred,
    price_impact,
    market_cap_before,
    market_cap_after,
    shares_outstanding_before,
    shares_outstanding_after,
    shares_traded,
    share_price_before,
    share_price_after,
    notes
)
SELECT 
    tl.winner_team_id as team_id,
    'match_win' as ledger_type,
    tl.applied_at as event_date,
    CASE 
        WHEN f.home_team_id = tl.winner_team_id THEN 'vs ' || away_team.name
        ELSE '@ ' || home_team.name
    END as event_description,
    tl.id as trigger_event_id,
    'fixture' as trigger_event_type,
    CASE 
        WHEN f.home_team_id = tl.winner_team_id THEN f.away_team_id
        ELSE f.home_team_id
    END as opponent_team_id,
    CASE 
        WHEN f.home_team_id = tl.winner_team_id THEN away_team.name
        ELSE home_team.name
    END as opponent_team_name,
    'win' as match_result,
    (f.home_team_id = tl.winner_team_id) as is_home_match,
    tl.transfer_amount as amount_transferred,
    tl.transfer_amount as price_impact,
    (t_winner.market_cap - tl.transfer_amount) as market_cap_before,
    t_winner.market_cap as market_cap_after,
    t_winner.shares_outstanding as shares_outstanding_before,
    t_winner.shares_outstanding as shares_outstanding_after,
    0 as shares_traded,
    ((t_winner.market_cap - tl.transfer_amount) / t_winner.shares_outstanding) as share_price_before,
    (t_winner.market_cap / t_winner.shares_outstanding) as share_price_after,
    'Manually created from existing transfer'
FROM transfers_ledger tl
JOIN fixtures f ON tl.fixture_id = f.id
JOIN teams home_team ON f.home_team_id = home_team.id
JOIN teams away_team ON f.away_team_id = away_team.id
JOIN teams t_winner ON tl.winner_team_id = t_winner.id
WHERE tl.id IN (164, 165) -- The two transfers we saw
AND NOT EXISTS (
    SELECT 1 FROM total_ledger 
    WHERE team_id = tl.winner_team_id 
    AND trigger_event_id = tl.id 
    AND ledger_type = 'match_win'
);

-- Create match loss entries for existing transfers
INSERT INTO total_ledger (
    team_id,
    ledger_type,
    event_date,
    event_description,
    trigger_event_id,
    trigger_event_type,
    opponent_team_id,
    opponent_team_name,
    match_result,
    is_home_match,
    amount_transferred,
    price_impact,
    market_cap_before,
    market_cap_after,
    shares_outstanding_before,
    shares_outstanding_after,
    shares_traded,
    share_price_before,
    share_price_after,
    notes
)
SELECT 
    tl.loser_team_id as team_id,
    'match_loss' as ledger_type,
    tl.applied_at as event_date,
    CASE 
        WHEN f.home_team_id = tl.loser_team_id THEN 'vs ' || away_team.name
        ELSE '@ ' || home_team.name
    END as event_description,
    tl.id as trigger_event_id,
    'fixture' as trigger_event_type,
    CASE 
        WHEN f.home_team_id = tl.loser_team_id THEN f.away_team_id
        ELSE f.home_team_id
    END as opponent_team_id,
    CASE 
        WHEN f.home_team_id = tl.loser_team_id THEN away_team.name
        ELSE home_team.name
    END as opponent_team_name,
    'loss' as match_result,
    (f.home_team_id = tl.loser_team_id) as is_home_match,
    tl.transfer_amount as amount_transferred,
    (-tl.transfer_amount) as price_impact,
    (t_loser.market_cap + tl.transfer_amount) as market_cap_before,
    t_loser.market_cap as market_cap_after,
    t_loser.shares_outstanding as shares_outstanding_before,
    t_loser.shares_outstanding as shares_outstanding_after,
    0 as shares_traded,
    ((t_loser.market_cap + tl.transfer_amount) / t_loser.shares_outstanding) as share_price_before,
    (t_loser.market_cap / t_loser.shares_outstanding) as share_price_after,
    'Manually created from existing transfer'
FROM transfers_ledger tl
JOIN fixtures f ON tl.fixture_id = f.id
JOIN teams home_team ON f.home_team_id = home_team.id
JOIN teams away_team ON f.away_team_id = away_team.id
JOIN teams t_loser ON tl.loser_team_id = t_loser.id
WHERE tl.id IN (164, 165) -- The two transfers we saw
AND NOT EXISTS (
    SELECT 1 FROM total_ledger 
    WHERE team_id = tl.loser_team_id 
    AND trigger_event_id = tl.id 
    AND ledger_type = 'match_loss'
);

-- Check the results
SELECT 
    'After Manual Creation' as test_type,
    COUNT(*) as total_entries,
    COUNT(CASE WHEN ledger_type LIKE 'match_%' THEN 1 END) as match_entries,
    COUNT(CASE WHEN ledger_type = 'manual_adjustment' THEN 1 END) as manual_entries
FROM total_ledger;

-- Test timeline for team 34
SELECT 
    'Team 34 Timeline' as test_type,
    event_order,
    event_type,
    event_date,
    description,
    opponent_name,
    match_result,
    price_impact
FROM get_team_timeline(34)
ORDER BY event_order, event_date;

