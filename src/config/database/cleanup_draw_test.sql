-- Cleanup script for draw test
-- Run this after testing to remove test data

-- Remove test fixture
DELETE FROM fixtures WHERE id = 9999;

-- Remove test transfer ledger entry
DELETE FROM transfers_ledger WHERE fixture_id = 9999;

-- Optional: Revert market caps (uncomment if you want to undo the market cap changes)
-- UPDATE teams SET market_cap = market_cap - (LEAST(market_cap, 100) * 0.01) WHERE id IN (37, 1);

-- Check final state
SELECT 
    'Final Brighton Snapshots' as test_type,
    COUNT(*) as snapshot_count
FROM team_state_snapshots 
WHERE team_id = 37;

