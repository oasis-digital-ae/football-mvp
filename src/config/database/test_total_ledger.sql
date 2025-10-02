-- Test the new total ledger system
-- This will show us the timeline with opponent names

-- Test with Brighton (team 37) which we know has match data
SELECT 
    'Brighton Timeline Test' as test_type,
    event_order,
    event_type,
    event_date,
    description,
    market_cap_before,
    market_cap_after,
    share_price_before,
    share_price_after,
    price_impact,
    opponent_name,
    match_result,
    score
FROM get_team_timeline(37)
ORDER BY event_order, event_date;

-- Test with Manchester City (team 21) to see if it has any data now
SELECT 
    'Manchester City Timeline Test' as test_type,
    event_order,
    event_type,
    event_date,
    description,
    market_cap_before,
    market_cap_after,
    share_price_before,
    share_price_after,
    price_impact,
    opponent_name,
    match_result,
    score
FROM get_team_timeline(21)
ORDER BY event_order, event_date;

-- Check what ledger entries exist for Brighton
SELECT 
    'Brighton Ledger Entries' as test_type,
    id,
    ledger_type,
    event_date,
    event_description,
    opponent_team_name,
    match_result,
    match_score,
    market_cap_before,
    market_cap_after,
    price_impact
FROM total_ledger 
WHERE team_id = 37
ORDER BY event_date;

-- Check what ledger entries exist for Manchester City
SELECT 
    'Manchester City Ledger Entries' as test_type,
    id,
    ledger_type,
    event_date,
    event_description,
    opponent_team_name,
    match_result,
    match_score,
    market_cap_before,
    market_cap_after,
    price_impact
FROM total_ledger 
WHERE team_id = 21
ORDER BY event_date;

