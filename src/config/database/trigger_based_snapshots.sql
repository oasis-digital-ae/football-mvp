-- =====================================================
-- TRIGGER-BASED SNAPSHOT SYSTEM
-- =====================================================
-- Instead of manually creating snapshots, use triggers to automatically
-- create snapshots whenever the teams table is updated
-- =====================================================

-- First, ensure the create_team_snapshot function exists
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

-- Create a trigger function that automatically creates snapshots
CREATE OR REPLACE FUNCTION team_market_cap_snapshot_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_snapshot_type TEXT;
    v_trigger_event_type TEXT;
BEGIN
    -- Determine snapshot type based on what changed
    IF OLD.market_cap != NEW.market_cap THEN
        -- Market cap changed - could be match result or manual update
        v_snapshot_type := 'match_result';
        v_trigger_event_type := 'fixture';
    ELSIF OLD.shares_outstanding != NEW.shares_outstanding THEN
        -- Shares outstanding changed - share purchase/sale
        IF NEW.shares_outstanding > OLD.shares_outstanding THEN
            v_snapshot_type := 'share_purchase';
        ELSE
            v_snapshot_type := 'share_sale';
        END IF;
        v_trigger_event_type := 'order';
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
        0,    -- price_impact (could be calculated)
        0,    -- shares_traded (could be calculated)
        0,    -- trade_amount (could be calculated)
        NOW() -- effective_at
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS team_market_cap_snapshot_trigger ON teams;
CREATE TRIGGER team_market_cap_snapshot_trigger
    AFTER UPDATE ON teams
    FOR EACH ROW
    WHEN (OLD.market_cap != NEW.market_cap OR OLD.shares_outstanding != NEW.shares_outstanding)
    EXECUTE FUNCTION team_market_cap_snapshot_trigger();

-- Test the trigger by updating a team
UPDATE teams 
SET market_cap = market_cap + 10 
WHERE id = 28;

-- Check if snapshot was created automatically
SELECT 
    'Automatic snapshot created by trigger' as test_description,
    id,
    team_id,
    snapshot_type,
    market_cap,
    current_share_price,
    created_at
FROM team_state_snapshots 
WHERE team_id = 28 
ORDER BY created_at DESC
LIMIT 1;

