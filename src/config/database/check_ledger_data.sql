-- Check what's happening with Brighton and other teams
-- This will help us understand why only Manchester City has data

-- Check all ledger entries to see what teams have data
SELECT 
    'All Ledger Entries' as test_type,
    team_id,
    ledger_type,
    event_date,
    event_description,
    opponent_team_name,
    match_result
FROM total_ledger 
ORDER BY team_id, event_date;

-- Check if Brighton (team 37) exists in teams table
SELECT 
    'Brighton Team Check' as test_type,
    id,
    name,
    market_cap,
    shares_outstanding
FROM teams 
WHERE id = 37;

-- Check what teams exist
SELECT 
    'All Teams' as test_type,
    id,
    name,
    market_cap,
    shares_outstanding
FROM teams 
ORDER BY id
LIMIT 10;

-- Check if there are any match-related ledger entries
SELECT 
    'Match Entries Check' as test_type,
    COUNT(*) as total_entries,
    COUNT(CASE WHEN ledger_type LIKE 'match_%' THEN 1 END) as match_entries,
    COUNT(CASE WHEN ledger_type = 'share_purchase' THEN 1 END) as purchase_entries,
    COUNT(CASE WHEN ledger_type = 'initial_state' THEN 1 END) as initial_entries
FROM total_ledger;

