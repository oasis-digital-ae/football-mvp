-- =====================================================
-- COMPLETE TEAM STATE SNAPSHOT SYSTEM
-- =====================================================
-- This is the definitive script that sets up the entire snapshot system
-- Run this ONCE and it will work for all teams without issues
-- =====================================================

-- Step 1: Ensure the table exists with correct structure
CREATE TABLE IF NOT EXISTS team_state_snapshots (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('initial', 'match_result', 'share_purchase', 'share_sale', 'manual')),
    trigger_event_id INTEGER,
    trigger_event_type TEXT CHECK (trigger_event_type IN ('fixture', 'order', 'manual')),
    market_cap DECIMAL(15,2) NOT NULL CHECK (market_cap >= 0),
    shares_outstanding INTEGER NOT NULL CHECK (shares_outstanding >= 0),
    current_share_price DECIMAL(10,2) NOT NULL CHECK (current_share_price >= 0),
    match_result TEXT CHECK (match_result IN ('win', 'loss', 'draw')),
    price_impact DECIMAL(15,2) DEFAULT 0,
    shares_traded INTEGER DEFAULT 0,
    trade_amount DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    effective_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_team_state_snapshots_team_id ON team_state_snapshots(team_id);
CREATE INDEX IF NOT EXISTS idx_team_state_snapshots_effective_at ON team_state_snapshots(effective_at);
CREATE INDEX IF NOT EXISTS idx_team_state_snapshots_team_effective ON team_state_snapshots(team_id, effective_at);

-- Step 3: Create the snapshot creation function
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

-- Step 4: Create the function to get team state at a specific time
CREATE OR REPLACE FUNCTION get_team_state_at_time(
    p_team_id INTEGER,
    p_at_time TIMESTAMP WITH TIME ZONE
) RETURNS TABLE (
    market_cap DECIMAL(15,2),
    shares_outstanding INTEGER,
    current_share_price DECIMAL(10,2),
    snapshot_type TEXT,
    effective_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.market_cap,
        s.shares_outstanding,
        s.current_share_price,
        s.snapshot_type,
        s.effective_at
    FROM team_state_snapshots s
    WHERE s.team_id = p_team_id 
        AND s.effective_at < p_at_time
    ORDER BY s.effective_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create the smart trigger function
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
    -- Check if there's a recent transfer_ledger entry for this specific team
    SELECT EXISTS(
        SELECT 1 FROM transfers_ledger 
        WHERE (winner_team_id = NEW.id OR loser_team_id = NEW.id)
        AND applied_at >= NOW() - INTERVAL '5 minutes'
    ) INTO v_transfer_exists;
    
    -- Get the most recent transfer for this specific team
    IF v_transfer_exists THEN
        SELECT * INTO v_recent_transfer
        FROM transfers_ledger 
        WHERE (winner_team_id = NEW.id OR loser_team_id = NEW.id)
        AND applied_at >= NOW() - INTERVAL '5 minutes'
        ORDER BY applied_at DESC
        LIMIT 1;
    END IF;

    -- Determine snapshot type based on what changed and transfer_ledger
    IF OLD.shares_outstanding != NEW.shares_outstanding THEN
        -- Shares outstanding changed - always share purchase/sale
        v_shares_traded := NEW.shares_outstanding - OLD.shares_outstanding;
        
        IF NEW.shares_outstanding > OLD.shares_outstanding THEN
            v_snapshot_type := 'share_purchase';
            v_trigger_event_type := 'order';
            v_trade_amount := v_shares_traded * (OLD.market_cap / OLD.shares_outstanding);
        ELSE
            v_snapshot_type := 'share_sale';
            v_trigger_event_type := 'order';
            v_trade_amount := ABS(v_shares_traded) * (OLD.market_cap / OLD.shares_outstanding);
        END IF;
        
        v_price_impact := NEW.market_cap - OLD.market_cap;
        
    ELSIF OLD.market_cap != NEW.market_cap THEN
        -- Market cap changed - check if it's from a match or share purchase
        IF v_transfer_exists THEN
            -- There's a transfer_ledger entry → match result
            v_snapshot_type := 'match_result';
            v_trigger_event_type := 'fixture';
            
            -- Determine win/loss from transfer
            IF v_recent_transfer.winner_team_id = NEW.id THEN
                v_price_impact := v_recent_transfer.transfer_amount;
            ELSE
                v_price_impact := -v_recent_transfer.transfer_amount;
            END IF;
            
        ELSE
            -- No transfer_ledger entry → share purchase (market cap injection)
            v_snapshot_type := 'share_purchase';
            v_trigger_event_type := 'order';
            v_price_impact := NEW.market_cap - OLD.market_cap;
            v_shares_traded := ROUND(v_price_impact / (OLD.market_cap / OLD.shares_outstanding));
            v_trade_amount := v_price_impact;
        END IF;
        
    ELSE
        -- Other changes - manual update
        v_snapshot_type := 'manual';
        v_trigger_event_type := 'manual';
    END IF;

    -- Create snapshot automatically
    IF v_transfer_exists THEN
        -- Transfer exists - determine match result
        PERFORM create_team_snapshot(
            NEW.id,
            v_snapshot_type,
            v_recent_transfer.id,
            v_trigger_event_type,
            CASE 
                WHEN v_recent_transfer.winner_team_id = NEW.id THEN 'win'
                WHEN v_recent_transfer.loser_team_id = NEW.id THEN 'loss'
                ELSE NULL
            END,
            v_price_impact,
            v_shares_traded,
            v_trade_amount,
            NOW()
        );
    ELSE
        -- No transfer - share purchase or manual update
        PERFORM create_team_snapshot(
            NEW.id,
            v_snapshot_type,
            NULL,
            v_trigger_event_type,
            NULL,
            v_price_impact,
            v_shares_traded,
            v_trade_amount,
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create the trigger
DROP TRIGGER IF EXISTS team_market_cap_snapshot_trigger ON teams;
CREATE TRIGGER team_market_cap_snapshot_trigger
    AFTER UPDATE ON teams
    FOR EACH ROW
    WHEN (OLD.market_cap != NEW.market_cap OR OLD.shares_outstanding != NEW.shares_outstanding)
    EXECUTE FUNCTION team_market_cap_snapshot_trigger();

-- Step 7: Create initial snapshots for all existing teams
INSERT INTO team_state_snapshots (
    team_id,
    snapshot_type,
    trigger_event_type,
    market_cap,
    shares_outstanding,
    current_share_price,
    price_impact,
    shares_traded,
    trade_amount,
    effective_at
)
SELECT 
    id,
    'initial',
    'manual',
    market_cap,
    shares_outstanding,
    CASE
        WHEN shares_outstanding > 0
        THEN market_cap / shares_outstanding
        ELSE 20.00
    END,
    0,
    0,
    0,
    NOW()
FROM teams
WHERE id NOT IN (
    SELECT DISTINCT team_id 
    FROM team_state_snapshots 
    WHERE snapshot_type = 'initial'
);

-- Step 8: Verify the setup
SELECT 
    'Setup Complete' as status,
    COUNT(*) as total_teams,
    (SELECT COUNT(*) FROM team_state_snapshots WHERE snapshot_type = 'initial') as initial_snapshots,
    (SELECT COUNT(*) FROM team_state_snapshots) as total_snapshots
FROM teams;

-- Step 9: Test the system
DO $$
DECLARE
    test_team_id INTEGER;
    test_team_name TEXT;
BEGIN
    -- Get first team for testing
    SELECT id, name INTO test_team_id, test_team_name
    FROM teams 
    ORDER BY id 
    LIMIT 1;
    
    RAISE NOTICE 'Testing snapshot system with team % (%)', test_team_id, test_team_name;
    
    -- Test share purchase
    UPDATE teams 
    SET 
        market_cap = market_cap + 100,
        shares_outstanding = shares_outstanding + 5
    WHERE id = test_team_id;
    
    RAISE NOTICE 'Share purchase test completed for team %', test_team_id;
END $$;

-- Final verification
SELECT 
    'System Test Results' as test_type,
    team_id,
    snapshot_type,
    trigger_event_type,
    market_cap,
    price_impact,
    shares_traded,
    created_at
FROM team_state_snapshots 
ORDER BY created_at DESC
LIMIT 3;
