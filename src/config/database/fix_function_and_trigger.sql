-- =====================================================
-- FIX: Create function and update trigger
-- =====================================================
-- First create the function, then update the trigger
-- =====================================================

-- Drop and recreate the function with the correct signature
DROP FUNCTION IF EXISTS create_team_snapshot(INTEGER, TEXT, INTEGER, TEXT, TEXT, DECIMAL, INTEGER, DECIMAL, TIMESTAMP WITH TIME ZONE);

CREATE OR REPLACE FUNCTION create_team_snapshot(
    p_team_id INTEGER,
    p_snapshot_type TEXT,
    p_trigger_event_id INTEGER DEFAULT NULL,
    p_trigger_event_type TEXT DEFAULT NULL,
    p_match_result TEXT DEFAULT NULL,
    p_price_impact DECIMAL(15,2) DEFAULT 0,
    p_shares_traded INTEGER DEFAULT 0,
    p_trade_amount DECIMAL(15,2) DEFAULT 0,
    p_effective_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) RETURNS INTEGER AS $$
DECLARE
    v_snapshot_id INTEGER;
    v_current_state RECORD;
BEGIN
    -- Get current team state
    SELECT
        market_cap,
        shares_outstanding,
        CASE
            WHEN shares_outstanding > 0
            THEN market_cap / shares_outstanding
            ELSE 20.00
        END as current_share_price
    INTO v_current_state
    FROM teams
    WHERE id = p_team_id;

    -- Insert snapshot
    INSERT INTO team_state_snapshots (
        team_id,
        snapshot_type,
        trigger_event_id,
        trigger_event_type,
        market_cap,
        shares_outstanding,
        current_share_price,
        match_result,
        price_impact,
        shares_traded,
        trade_amount,
        effective_at
    ) VALUES (
        p_team_id,
        p_snapshot_type,
        p_trigger_event_id,
        p_trigger_event_type,
        v_current_state.market_cap,
        v_current_state.shares_outstanding,
        v_current_state.current_share_price,
        p_match_result,
        p_price_impact,
        p_shares_traded,
        p_trade_amount,
        p_effective_at
    ) RETURNING id INTO v_snapshot_id;

    RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

-- Test the function first
SELECT 
    'Testing create_team_snapshot function' as test_description,
    create_team_snapshot(28, 'test', NULL, 'manual', NULL, 0, 0, 0, NOW()) as snapshot_id;

-- Now update the trigger function
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

    -- Create snapshot automatically using explicit type casts
    PERFORM create_team_snapshot(
        NEW.id::INTEGER,
        v_snapshot_type::TEXT,
        NULL::INTEGER,
        v_trigger_event_type::TEXT,
        NULL::TEXT,
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

-- Test the trigger by simulating a share purchase
UPDATE teams 
SET 
    market_cap = market_cap + 100,  -- Add $100 to market cap
    shares_outstanding = shares_outstanding + 5  -- Add 5 shares
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

