-- =====================================================
-- DEBUG ASTON VILLA MARKET CAP ISSUE
-- Football MVP - Premier League Club Shares Trading Platform
-- =====================================================
-- This script helps debug why Aston Villa's market cap is so high
-- and why the match history doesn't reflect the actual market cap

-- =====================================================
-- 1. CHECK ASTON VILLA'S CURRENT STATE
-- =====================================================

SELECT 
    id,
    name,
    external_id,
    market_cap,
    initial_market_cap,
    shares_outstanding,
    launch_price,
    created_at,
    updated_at
FROM teams 
WHERE name LIKE '%Aston Villa%'
ORDER BY id;

-- =====================================================
-- 2. CHECK ASTON VILLA'S FIXTURES AND SNAPSHOTS
-- =====================================================

SELECT 
    f.id as fixture_id,
    f.status,
    f.result,
    f.home_score,
    f.away_score,
    f.snapshot_home_cap,
    f.snapshot_away_cap,
    ht.name as home_team,
    at.name as away_team,
    f.kickoff_at
FROM fixtures f
JOIN teams ht ON f.home_team_id = ht.id
JOIN teams at ON f.away_team_id = at.id
WHERE (ht.name LIKE '%Aston Villa%' OR at.name LIKE '%Aston Villa%')
ORDER BY f.kickoff_at DESC;

-- =====================================================
-- 3. CHECK TRANSFERS LEDGER FOR ASTON VILLA
-- =====================================================

SELECT 
    tl.id,
    tl.fixture_id,
    tl.winner_team_id,
    tl.loser_team_id,
    tl.transfer_amount,
    tl.applied_at,
    wt.name as winner_team,
    lt.name as loser_team
FROM transfers_ledger tl
JOIN teams wt ON tl.winner_team_id = wt.id
JOIN teams lt ON tl.loser_team_id = lt.id
WHERE (wt.name LIKE '%Aston Villa%' OR lt.name LIKE '%Aston Villa%')
ORDER BY tl.applied_at DESC;

-- =====================================================
-- 4. CALCULATE EXPECTED MARKET CAP
-- =====================================================

-- Calculate what Aston Villa's market cap should be based on transfers
WITH villa_transfers AS (
    SELECT 
        CASE 
            WHEN wt.name LIKE '%Aston Villa%' THEN tl.transfer_amount
            WHEN lt.name LIKE '%Aston Villa%' THEN -tl.transfer_amount
            ELSE 0
        END as net_transfer
    FROM transfers_ledger tl
    JOIN teams wt ON tl.winner_team_id = wt.id
    JOIN teams lt ON tl.loser_team_id = lt.id
    WHERE (wt.name LIKE '%Aston Villa%' OR lt.name LIKE '%Aston Villa%')
)
SELECT 
    100.00 + COALESCE(SUM(net_transfer), 0) as expected_market_cap
FROM villa_transfers;

-- =====================================================
-- 5. SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Aston Villa market cap debug completed!';
    RAISE NOTICE '🔍 Check the results above to understand:';
    RAISE NOTICE '   - Current market cap vs initial market cap';
    RAISE NOTICE '   - Fixture snapshots and their values';
    RAISE NOTICE '   - Transfer ledger entries';
    RAISE NOTICE '   - Expected market cap calculation';
    RAISE NOTICE '🎯 This will help identify why match history shows different values';
END $$;
