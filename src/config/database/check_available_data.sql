-- Check what data sources we have available for migration
-- Since team_state_snapshots was dropped, we need to find other sources

-- Check if transfers_ledger has data
SELECT 
    'Transfers Ledger Data' as test_type,
    COUNT(*) as total_transfers,
    COUNT(DISTINCT winner_team_id) as winning_teams,
    COUNT(DISTINCT loser_team_id) as losing_teams
FROM transfers_ledger;

-- Check what fixtures have results
SELECT 
    'Fixtures with Results' as test_type,
    COUNT(*) as total_fixtures,
    COUNT(CASE WHEN result = 'home_win' THEN 1 END) as home_wins,
    COUNT(CASE WHEN result = 'away_win' THEN 1 END) as away_wins,
    COUNT(CASE WHEN result = 'draw' THEN 1 END) as draws
FROM fixtures 
WHERE result IS NOT NULL AND result != 'pending';

-- Check what orders exist
SELECT 
    'Orders Data' as test_type,
    COUNT(*) as total_orders,
    COUNT(DISTINCT team_id) as teams_with_orders,
    SUM(total_amount) as total_volume
FROM orders 
WHERE status = 'FILLED';

-- Check current team states to see if any have changed from initial
SELECT 
    'Team State Changes' as test_type,
    id,
    name,
    initial_market_cap,
    market_cap,
    (market_cap - initial_market_cap) as market_cap_change,
    shares_outstanding
FROM teams 
WHERE market_cap != initial_market_cap OR shares_outstanding != 5
ORDER BY market_cap_change DESC;

-- If we have transfers_ledger data, we can recreate match entries
SELECT 
    'Sample Transfer Data' as test_type,
    tl.id,
    tl.fixture_id,
    tl.winner_team_id,
    tl.loser_team_id,
    tl.transfer_amount,
    tl.applied_at,
    f.result,
    f.home_score,
    f.away_score,
    ht.name as home_team,
    at.name as away_team
FROM transfers_ledger tl
LEFT JOIN fixtures f ON tl.fixture_id = f.id
LEFT JOIN teams ht ON f.home_team_id = ht.id
LEFT JOIN teams at ON f.away_team_id = at.id
ORDER BY tl.applied_at
LIMIT 5;

