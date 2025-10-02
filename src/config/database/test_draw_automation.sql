-- Test script to verify that draws now work automatically
-- This simulates a new draw match and checks if snapshots are created

-- Step 1: Check current Brighton snapshots
SELECT 
    'Current Brighton Snapshots' as test_type,
    COUNT(*) as snapshot_count,
    STRING_AGG(snapshot_type, ', ') as snapshot_types
FROM team_state_snapshots 
WHERE team_id = 37;

-- Step 2: Create a test fixture for Brighton vs another team (draw)
INSERT INTO fixtures (
    id, 
    home_team_id, 
    away_team_id, 
    kickoff_at, 
    status, 
    result
) VALUES (
    9999, -- Use a high ID to avoid conflicts
    37,   -- Brighton (home)
    1,    -- Arsenal (away)
    NOW() - INTERVAL '1 hour', -- 1 hour ago
    'applied',
    'draw'
) ON CONFLICT (id) DO NOTHING;

-- Step 3: Get current market caps
SELECT 
    'Current Market Caps' as test_type,
    t.id,
    t.name,
    t.market_cap
FROM teams t 
WHERE t.id IN (37, 1) -- Brighton and Arsenal
ORDER BY t.id;

-- Step 4: Simulate the draw match processing
-- This should create transfer entries and trigger snapshots
DO $$
DECLARE
    v_brighton_cap DECIMAL(15,2);
    v_arsenal_cap DECIMAL(15,2);
    v_transfer_amount DECIMAL(15,2);
BEGIN
    -- Get current market caps
    SELECT market_cap INTO v_brighton_cap FROM teams WHERE id = 37;
    SELECT market_cap INTO v_arsenal_cap FROM teams WHERE id = 1;
    
    -- Calculate small transfer amount (1% of smaller team)
    v_transfer_amount := LEAST(v_brighton_cap, v_arsenal_cap) * 0.01;
    
    -- Create transfer ledger entry
    INSERT INTO transfers_ledger (
        fixture_id,
        winner_team_id,
        loser_team_id,
        transfer_amount,
        applied_at
    ) VALUES (
        9999,
        37, -- Brighton as "winner" for consistency
        1,  -- Arsenal as "loser" for consistency
        v_transfer_amount,
        NOW()
    );
    
    -- Update both teams' market caps (both get increase for draw)
    UPDATE teams 
    SET market_cap = market_cap + v_transfer_amount,
        updated_at = NOW()
    WHERE id IN (37, 1);
    
    RAISE NOTICE 'Draw simulation completed: % transferred to both teams', v_transfer_amount;
END $$;

-- Step 5: Check if new snapshots were created
SELECT 
    'New Brighton Snapshots' as test_type,
    COUNT(*) as snapshot_count,
    STRING_AGG(snapshot_type, ', ') as snapshot_types,
    STRING_AGG(match_result, ', ') as match_results
FROM team_state_snapshots 
WHERE team_id = 37;

-- Step 6: Check if new snapshots were created for Arsenal too
SELECT 
    'New Arsenal Snapshots' as test_type,
    COUNT(*) as snapshot_count,
    STRING_AGG(snapshot_type, ', ') as snapshot_types,
    STRING_AGG(match_result, ', ') as match_results
FROM team_state_snapshots 
WHERE team_id = 1;

-- Step 7: Test the timeline function for Brighton
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
    match_result
FROM get_team_complete_timeline(37)
ORDER BY event_order, event_date;

-- Step 8: Clean up test data
DELETE FROM transfers_ledger WHERE fixture_id = 9999;
DELETE FROM fixtures WHERE id = 9999;

-- Step 9: Revert market caps (optional - comment out if you want to keep the changes)
-- UPDATE teams SET market_cap = market_cap - (LEAST(market_cap, 100) * 0.01) WHERE id IN (37, 1);

-- Step 10: Final snapshot count
SELECT 
    'Final Brighton Snapshots' as test_type,
    COUNT(*) as snapshot_count
FROM team_state_snapshots 
WHERE team_id = 37;

