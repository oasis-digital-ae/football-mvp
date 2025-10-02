-- Debug why the trigger isn't finding transfers
-- Since updates are instant, the issue is likely in the trigger logic

-- Check the exact trigger logic for team 34
SELECT 
    'Trigger Logic Debug - Team 34' as test_type,
    'Checking if trigger can find transfers for team 34' as action;

-- Simulate the trigger's transfer check for team 34
SELECT 
    'Transfer Check for Team 34' as test_type,
    EXISTS(
        SELECT 1 FROM transfers_ledger 
        WHERE (winner_team_id = 34 OR loser_team_id = 34)
        AND applied_at >= NOW() - INTERVAL '5 minutes'
    ) as transfer_exists;

-- Check what transfers exist for team 34
SELECT 
    'Team 34 Transfers' as test_type,
    id,
    winner_team_id,
    loser_team_id,
    applied_at,
    NOW() as current_time,
    (NOW() - applied_at) as time_diff
FROM transfers_ledger 
WHERE winner_team_id = 34 OR loser_team_id = 34
ORDER BY applied_at DESC;

-- Check the trigger's variable assignment logic
-- The issue might be in how v_transfer_exists is being set
SELECT 
    'Trigger Variable Check' as test_type,
    'v_transfer_exists should be TRUE for team 34' as expected,
    CASE 
        WHEN EXISTS(
            SELECT 1 FROM transfers_ledger 
            WHERE (winner_team_id = 34 OR loser_team_id = 34)
            AND applied_at >= NOW() - INTERVAL '5 minutes'
        ) THEN 'TRUE'
        ELSE 'FALSE'
    END as actual_result;

-- Let's manually test the trigger logic by creating a test entry
-- This will help us see if the issue is in the trigger function itself
SELECT 
    'Manual Trigger Test' as test_type,
    'Creating test match entry for team 34' as action;

-- Manually create a match entry to test the system
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
    'Manual test entry'
FROM transfers_ledger tl
WHERE tl.id = 164
LIMIT 1;

-- Test the timeline function
SELECT 
    'Team 34 Timeline Test' as test_type,
    event_order,
    event_type,
    event_date,
    description,
    opponent_name,
    match_result,
    price_impact
FROM get_team_timeline(34)
ORDER BY event_order, event_date;

-- The real issue might be that the trigger is working correctly
-- but the match simulation isn't creating the right transfer records
-- Let's check if the trigger function itself has any issues
SELECT 
    'Trigger Function Check' as test_type,
    'The trigger might be working but creating manual_adjustment because' as issue1,
    'the transfer lookup logic is not finding the right records' as issue2;

