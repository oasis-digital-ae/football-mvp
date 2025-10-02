-- =====================================================
-- IMPROVED TRIGGER: Check transfers_ledger to determine snapshot type
-- =====================================================
-- Logic:
-- 1. If market cap changes AND there's a transfer_ledger entry → match_result
-- 2. If market cap changes AND NO transfer_ledger entry → share_purchase/sale
-- 3. If only shares change → share_purchase/sale
-- =====================================================

-- Update the trigger function with transfers_ledger logic
DROP TRIGGER IF EXISTS team_market_cap_snapshot_trigger ON teams;

CREATE OR REPLACE FUNCTION team_market_cap_snapshot_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_snapshot_type TEXT;
    v_trigger_event_type TEXT;
    v_price_impact DECIMAL(15,2) := 0;
    v_shares_traded INTEGER := 0;
    v_trade_amount DECIMAL(15,2) := 0;
    v_transfer_exists BOOLEAN := FALSE;
    v_recent_transfer RECORD;
BEGIN
    -- Check if there's a recent transfer_ledger entry for THIS SPECIFIC TEAM
    -- Look for transfers within the last 5 minutes to account for timing differences
    SELECT EXISTS(
        SELECT 1 FROM transfers_ledger 
        WHERE (winner_team_id = NEW.id OR loser_team_id = NEW.id)
        AND applied_at >= NOW() - INTERVAL '5 minutes'
        AND (winner_team_id = NEW.id OR loser_team_id = NEW.id) -- Double check team ID
    ) INTO v_transfer_exists;
    
    -- Get the most recent transfer for THIS SPECIFIC TEAM
    SELECT * INTO v_recent_transfer
    FROM transfers_ledger 
    WHERE (winner_team_id = NEW.id OR loser_team_id = NEW.id)
    AND applied_at >= NOW() - INTERVAL '5 minutes'
    ORDER BY applied_at DESC
    LIMIT 1;

    -- Determine snapshot type based on what changed and transfer_ledger
    IF OLD.shares_outstanding != NEW.shares_outstanding THEN
        -- Shares outstanding changed - always share purchase/sale
        v_shares_traded := NEW.shares_outstanding - OLD.shares_outstanding;
        
        IF NEW.shares_outstanding > OLD.shares_outstanding THEN
            v_snapshot_type := 'share_purchase';
            v_trigger_event_type := 'order';
            -- Calculate trade amount based on current share price
            v_trade_amount := v_shares_traded * (OLD.market_cap / OLD.shares_outstanding);
        ELSE
            v_snapshot_type := 'share_sale';
            v_trigger_event_type := 'order';
            -- Calculate trade amount based on current share price
            v_trade_amount := ABS(v_shares_traded) * (OLD.market_cap / OLD.shares_outstanding);
        END IF;
        
        -- Price impact is the market cap change
        v_price_impact := NEW.market_cap - OLD.market_cap;
        
    ELSIF OLD.market_cap != NEW.market_cap THEN
        -- Market cap changed - check if it's from a match or share purchase
        IF v_transfer_exists THEN
            -- There's a transfer_ledger entry → match result
            v_snapshot_type := 'match_result';
            v_trigger_event_type := 'fixture';
            v_price_impact := NEW.market_cap - OLD.market_cap;
            
            -- Try to determine win/loss from transfer
            IF v_recent_transfer.winner_team_id = NEW.id THEN
                -- This team won
                v_price_impact := v_recent_transfer.transfer_amount;
            ELSE
                -- This team lost
                v_price_impact := -v_recent_transfer.transfer_amount;
            END IF;
            
        ELSE
            -- No transfer_ledger entry → share purchase/sale (market cap injection)
            v_snapshot_type := 'share_purchase';
            v_trigger_event_type := 'order';
            v_price_impact := NEW.market_cap - OLD.market_cap;
            -- Estimate shares traded based on price impact
            v_shares_traded := ROUND(v_price_impact / (OLD.market_cap / OLD.shares_outstanding));
            v_trade_amount := v_price_impact;
        END IF;
        
    ELSE
        -- Other changes - manual update
        v_snapshot_type := 'manual';
        v_trigger_event_type := 'manual';
    END IF;

    -- Debug logging to ensure team ID matching
    RAISE NOTICE 'Trigger executing for team %: snapshot_type=%, transfer_exists=%, transfer_id=%', 
        NEW.id, v_snapshot_type, v_transfer_exists, COALESCE(v_recent_transfer.id, NULL);

    -- Create snapshot automatically using explicit type casts
    PERFORM create_team_snapshot(
        NEW.id::INTEGER,
        v_snapshot_type::TEXT,
        COALESCE(v_recent_transfer.id, NULL)::INTEGER, -- Use transfer ID if available
        v_trigger_event_type::TEXT,
        CASE 
            WHEN v_transfer_exists AND v_recent_transfer.winner_team_id = NEW.id THEN 'win'
            WHEN v_transfer_exists AND v_recent_transfer.loser_team_id = NEW.id THEN 'loss'
            ELSE NULL
        END::TEXT,
        v_price_impact::DECIMAL(15,2),
        v_shares_traded::INTEGER,
        v_trade_amount::DECIMAL(15,2),
        NOW()::TIMESTAMP WITH TIME ZONE
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER team_market_cap_snapshot_trigger
    AFTER UPDATE ON teams
    FOR EACH ROW
    WHEN (OLD.market_cap != NEW.market_cap OR OLD.shares_outstanding != NEW.shares_outstanding)
    EXECUTE FUNCTION team_market_cap_snapshot_trigger();

-- Test the trigger logic with team ID verification
-- First, let's see current state of all teams
SELECT 
    'Current team states' as test_description,
    id,
    name,
    market_cap,
    shares_outstanding,
    market_cap / shares_outstanding as current_share_price
FROM teams 
ORDER BY id
LIMIT 5;

-- Test 1: Simulate a share purchase for the first team (no transfer_ledger entry)
-- This should create a share_purchase snapshot for that team only
DO $$
DECLARE
    test_team_id INTEGER;
    test_team_name TEXT;
BEGIN
    -- Get the first team for testing
    SELECT id, name INTO test_team_id, test_team_name
    FROM teams 
    ORDER BY id 
    LIMIT 1;
    
    RAISE NOTICE 'Testing share purchase for team % (%)', test_team_id, test_team_name;
    
    -- Update the team
    UPDATE teams 
    SET 
        market_cap = market_cap + 200,  -- Add $200 to market cap
        shares_outstanding = shares_outstanding + 10  -- Add 10 shares
    WHERE id = test_team_id;
    
    RAISE NOTICE 'Updated team % - check snapshots table for new entry', test_team_id;
END $$;

-- Check the most recent snapshots to verify team isolation
SELECT 
    'Recent snapshots (should show team-specific entries)' as test_description,
    team_id,
    snapshot_type,
    trigger_event_type,
    market_cap,
    price_impact,
    shares_traded,
    created_at
FROM team_state_snapshots 
ORDER BY created_at DESC
LIMIT 5;

-- Test 2: Update a different team to ensure team ID isolation
DO $$
DECLARE
    test_team_id INTEGER;
    test_team_name TEXT;
BEGIN
    -- Get a different team for testing (second team)
    SELECT id, name INTO test_team_id, test_team_name
    FROM teams 
    ORDER BY id 
    OFFSET 1
    LIMIT 1;
    
    RAISE NOTICE 'Testing market cap update for team % (%)', test_team_id, test_team_name;
    
    -- Update the team
    UPDATE teams 
    SET 
        market_cap = market_cap + 50  -- Add $50 to market cap
    WHERE id = test_team_id;
    
    RAISE NOTICE 'Updated team % - check snapshots table for new entry', test_team_id;
END $$;

-- Final check: Show recent snapshots for all teams
SELECT 
    'Final verification: Recent snapshots for all teams' as test_description,
    team_id,
    snapshot_type,
    trigger_event_type,
    market_cap,
    price_impact,
    created_at
FROM team_state_snapshots 
ORDER BY created_at DESC
LIMIT 10;
