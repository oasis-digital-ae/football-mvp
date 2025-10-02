-- Simple test to verify draw automation works
-- Run this in Supabase SQL Editor

-- Step 1: Check current Brighton snapshots
SELECT 
    'Current Brighton Snapshots' as test_type,
    COUNT(*) as snapshot_count,
    STRING_AGG(snapshot_type, ', ') as snapshot_types
FROM team_state_snapshots 
WHERE team_id = 37;

-- Step 2: Get current market caps
SELECT 
    'Current Market Caps' as test_type,
    t.id,
    t.name,
    t.market_cap
FROM teams t 
WHERE t.id IN (37, 2) -- Brighton and another team
ORDER BY t.id;

-- Step 3: Create a test fixture for Brighton vs another team (draw)
INSERT INTO fixtures (
    id, 
    external_id,
    home_team_id, 
    away_team_id, 
    matchday,
    kickoff_at,
    buy_close_at,
    status, 
    result
) VALUES (
    9999, -- Use a high ID to avoid conflicts
    9999, -- External ID as integer for the test fixture
    37,   -- Brighton (home)
    2,    -- Another team (away)
    1,    -- Matchday
    NOW() - INTERVAL '1 hour', -- 1 hour ago
    NOW() - INTERVAL '2 hours', -- 2 hours ago (buy close)
    'applied',
    'draw'
) ON CONFLICT (id) DO NOTHING;

-- Step 4: Simulate the draw match processing
DO $$
DECLARE
    v_brighton_cap DECIMAL(15,2);
    v_team2_cap DECIMAL(15,2);
    v_transfer_amount DECIMAL(15,2);
BEGIN
    -- Get current market caps
    SELECT market_cap INTO v_brighton_cap FROM teams WHERE id = 37;
    SELECT market_cap INTO v_team2_cap FROM teams WHERE id = 2;
    
    -- Calculate small transfer amount (1% of smaller team)
    v_transfer_amount := LEAST(v_brighton_cap, v_team2_cap) * 0.01;
    
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
        2,  -- Team 2 as "loser" for consistency
        v_transfer_amount,
        NOW()
    );
    
    -- Update both teams' market caps (both get increase for draw)
    UPDATE teams 
    SET market_cap = market_cap + v_transfer_amount,
        updated_at = NOW()
    WHERE id IN (37, 2);
    
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

-- Step 6: Test the timeline function for Brighton
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
