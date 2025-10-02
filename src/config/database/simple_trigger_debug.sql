-- Simple diagnostic to check the trigger's transfer lookup
-- The issue is likely in the transfer lookup logic

-- Check if transfers exist for team 34
SELECT 
    'Team 34 Transfer Exists Check' as test_type,
    COUNT(*) as transfer_count
FROM transfers_ledger 
WHERE winner_team_id = 34 OR loser_team_id = 34;

-- Check the exact transfer record for team 34
SELECT 
    'Team 34 Transfer Details' as test_type,
    id,
    winner_team_id,
    loser_team_id,
    applied_at
FROM transfers_ledger 
WHERE winner_team_id = 34 OR loser_team_id = 34;

-- Check if the trigger's EXISTS query would work
SELECT 
    'Trigger EXISTS Query Test' as test_type,
    EXISTS(
        SELECT 1 FROM transfers_ledger 
        WHERE (winner_team_id = 34 OR loser_team_id = 34)
        AND applied_at >= NOW() - INTERVAL '5 minutes'
    ) as should_be_true;

-- The issue might be that the trigger is looking for transfers
-- but the team updates happen in a different order
-- Let's check the actual timing of team updates vs transfers

-- Check when team 34 was last updated in total_ledger
SELECT 
    'Team 34 Last Update' as test_type,
    event_date,
    ledger_type,
    price_impact
FROM total_ledger 
WHERE team_id = 34
ORDER BY event_date DESC
LIMIT 1;

-- Check when the transfer was created
SELECT 
    'Transfer 164 Timing' as test_type,
    applied_at as transfer_time
FROM transfers_ledger 
WHERE id = 164;

-- The real issue might be that the trigger is working correctly
-- but the match simulation creates transfers AFTER team updates
-- Let's check the order of operations

-- Check if we can manually create a proper match entry
-- This will test if the system works when we bypass the trigger
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
    34 as team_id,
    'match_win' as ledger_type,
    tl.applied_at as event_date,
    'vs Test Opponent' as event_description,
    tl.id as trigger_event_id,
    'fixture' as trigger_event_type,
    26 as opponent_team_id,
    'Test Team' as opponent_team_name,
    'win' as match_result,
    true as is_home_match,
    tl.transfer_amount as amount_transferred,
    tl.transfer_amount as price_impact,
    110.00 as market_cap_before,
    120.00 as market_cap_after,
    5 as shares_outstanding_before,
    5 as shares_outstanding_after,
    0 as shares_traded,
    22.00 as share_price_before,
    24.00 as share_price_after,
    'Manual test entry to verify system works'
FROM transfers_ledger tl
WHERE tl.id = 164
AND NOT EXISTS (
    SELECT 1 FROM total_ledger 
    WHERE team_id = 34 
    AND trigger_event_id = 164
)
LIMIT 1;

-- Test the timeline to see if opponent names work
SELECT 
    'Team 34 Timeline with Manual Entry' as test_type,
    event_order,
    event_type,
    event_date,
    description,
    opponent_name,
    match_result,
    price_impact
FROM get_team_timeline(34)
ORDER BY event_order, event_date;

