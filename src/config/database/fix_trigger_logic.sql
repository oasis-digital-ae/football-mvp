-- =====================================================
-- FIX: Update trigger to correctly identify share purchases
-- =====================================================
-- The trigger is incorrectly classifying share purchases as match_result
-- We need to prioritize shares_outstanding changes over market_cap changes
-- =====================================================

-- Drop and recreate the trigger function with better logic
DROP TRIGGER IF EXISTS team_market_cap_snapshot_trigger ON teams;

CREATE OR REPLACE FUNCTION team_market_cap_snapshot_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_snapshot_type TEXT;
    v_trigger_event_type TEXT;
    v_price_impact DECIMAL(15,2) := 0;
    v_shares_traded INTEGER := 0;
    v_trade_amount DECIMAL(15,2) := 0;
BEGIN
    -- Determine snapshot type based on what changed
    -- PRIORITY: Check shares_outstanding first (share purchases/sales)
    IF OLD.shares_outstanding != NEW.shares_outstanding THEN
        -- Shares outstanding changed - share purchase/sale
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
        -- Market cap changed without shares change - match result or manual update
        v_snapshot_type := 'match_result';
        v_trigger_event_type := 'fixture';
        v_price_impact := NEW.market_cap - OLD.market_cap;
        
    ELSE
        -- Other changes - manual update
        v_snapshot_type := 'manual';
        v_trigger_event_type := 'manual';
    END IF;

    -- Create snapshot automatically
    PERFORM create_team_snapshot(
        NEW.id,
        v_snapshot_type,
        NULL, -- trigger_event_id (could be enhanced later)
        v_trigger_event_type,
        NULL, -- match_result (could be enhanced later)
        v_price_impact,
        v_shares_traded,
        v_trade_amount,
        NOW() -- effective_at
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

-- Test the trigger by simulating a share purchase
-- First, let's see the current state
SELECT 
    'Current Manchester United state' as test_description,
    id,
    name,
    market_cap,
    shares_outstanding,
    market_cap / shares_outstanding as current_share_price
FROM teams 
WHERE id = 28;

-- Simulate a share purchase (update both market cap and shares)
UPDATE teams 
SET 
    market_cap = market_cap + 400,  -- Add $400 to market cap
    shares_outstanding = shares_outstanding + 20  -- Add 20 shares
WHERE id = 28;

-- Check the snapshot that was created
SELECT 
    'Snapshot created by updated trigger' as test_description,
    id,
    team_id,
    snapshot_type,
    trigger_event_type,
    market_cap,
    shares_outstanding,
    current_share_price,
    price_impact,
    shares_traded,
    trade_amount,
    created_at
FROM team_state_snapshots 
WHERE team_id = 28 
ORDER BY created_at DESC
LIMIT 1;

