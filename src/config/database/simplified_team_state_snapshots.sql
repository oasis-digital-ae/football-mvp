-- =====================================================
-- SIMPLIFIED TEAM STATE SNAPSHOTS SYSTEM
-- =====================================================
-- This system captures the state of each team whenever:
-- 1. Market cap changes (from match results)
-- 2. Shares are bought/sold (from user transactions)
-- 3. Initial team setup
-- =====================================================

-- Drop existing table if it exists
DROP TABLE IF EXISTS team_state_snapshots CASCADE;

-- Drop existing functions
DROP FUNCTION IF EXISTS create_team_snapshot(integer, text, integer, text, text, decimal, integer, decimal);
DROP FUNCTION IF EXISTS get_team_state_at_time(integer, timestamp with time zone);
DROP FUNCTION IF EXISTS get_team_state_history(integer, timestamp with time zone, timestamp with time zone);

-- Drop existing views
DROP VIEW IF EXISTS current_team_states;

-- Drop existing triggers
DROP TRIGGER IF EXISTS team_market_cap_snapshot_trigger ON teams;

-- Create simplified team_state_snapshots table
CREATE TABLE team_state_snapshots (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    
    -- Snapshot metadata
    snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('initial', 'match_result', 'share_purchase', 'share_sale', 'manual')),
    trigger_event_id INTEGER, -- Reference to the event that caused this snapshot (fixture_id, order_id, etc.)
    trigger_event_type TEXT, -- 'fixture', 'order', 'manual'
    
    -- Team state at this point in time (SIMPLIFIED - only what's actually used)
    market_cap DECIMAL(15,2) NOT NULL,
    shares_outstanding INTEGER NOT NULL, -- Total shares that exist
    current_share_price DECIMAL(10,2) NOT NULL, -- Calculated: market_cap / shares_outstanding
    
    -- Additional context
    match_result TEXT, -- 'win', 'loss', 'draw' (if snapshot_type = 'match_result')
    price_impact DECIMAL(15,2), -- Market cap change from this event
    shares_traded INTEGER DEFAULT 0, -- Number of shares bought/sold (if applicable)
    trade_amount DECIMAL(15,2) DEFAULT 0, -- Amount of money involved in trade
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    effective_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() -- When this state became effective
    
    -- Constraints (SIMPLIFIED)
    CONSTRAINT valid_share_counts CHECK (
        shares_outstanding >= 0 AND 
        market_cap >= 0 AND
        current_share_price >= 0
    )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_team_state_snapshots_team_id 
ON team_state_snapshots(team_id, effective_at DESC);

CREATE INDEX IF NOT EXISTS idx_team_state_snapshots_type 
ON team_state_snapshots(snapshot_type, effective_at DESC);

CREATE INDEX IF NOT EXISTS idx_team_state_snapshots_trigger 
ON team_state_snapshots(trigger_event_type, trigger_event_id);

-- Create a view for easy querying of current team states
CREATE OR REPLACE VIEW current_team_states AS
SELECT DISTINCT ON (team_id)
    team_id,
    market_cap,
    shares_outstanding,
    current_share_price,
    snapshot_type,
    effective_at,
    created_at
FROM team_state_snapshots
ORDER BY team_id, effective_at DESC;

-- =====================================================
-- SIMPLIFIED FUNCTIONS FOR SNAPSHOT MANAGEMENT
-- =====================================================

-- Function to create a snapshot (SIMPLIFIED)
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
    -- Get current team state (SIMPLIFIED)
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
    
    -- Insert snapshot (SIMPLIFIED)
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

-- Function to get team state at a specific time (SIMPLIFIED)
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

-- Function to get team state history for graphing (SIMPLIFIED)
CREATE OR REPLACE FUNCTION get_team_state_history(
    p_team_id INTEGER,
    p_from_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_to_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS TABLE (
    effective_at TIMESTAMP WITH TIME ZONE,
    market_cap DECIMAL(15,2),
    current_share_price DECIMAL(10,2),
    snapshot_type TEXT,
    price_impact DECIMAL(15,2),
    shares_traded INTEGER,
    match_result TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.effective_at,
        s.market_cap,
        s.current_share_price,
        s.snapshot_type,
        s.price_impact,
        s.shares_traded,
        s.match_result
    FROM team_state_snapshots s
    WHERE s.team_id = p_team_id
        AND (p_from_date IS NULL OR s.effective_at >= p_from_date)
        AND (p_to_date IS NULL OR s.effective_at <= p_to_date)
    ORDER BY s.effective_at ASC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS TO AUTO-CREATE SNAPSHOTS
-- =====================================================

-- Trigger function for team market cap changes
CREATE OR REPLACE FUNCTION trigger_team_snapshot_on_market_cap_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create snapshot if market_cap actually changed
    IF OLD.market_cap IS DISTINCT FROM NEW.market_cap THEN
        PERFORM create_team_snapshot(
            NEW.id,
            'match_result',
            NULL, -- Will be set by the calling context
            'fixture',
            NULL, -- Will be set by the calling context
            NEW.market_cap - OLD.market_cap
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for market cap changes
CREATE TRIGGER team_market_cap_snapshot_trigger
    AFTER UPDATE OF market_cap ON teams
    FOR EACH ROW
    EXECUTE FUNCTION trigger_team_snapshot_on_market_cap_change();

-- =====================================================
-- INITIAL DATA POPULATION (SIMPLIFIED)
-- =====================================================

-- Create initial snapshots for all existing teams
INSERT INTO team_state_snapshots (
    team_id,
    snapshot_type,
    trigger_event_type,
    market_cap,
    shares_outstanding,
    current_share_price
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
    END
FROM teams
WHERE NOT EXISTS (
    SELECT 1 FROM team_state_snapshots 
    WHERE team_id = teams.id AND snapshot_type = 'initial'
);

-- =====================================================
-- EXAMPLE QUERIES FOR TESTING
-- =====================================================

-- Get current state of all teams
-- SELECT * FROM current_team_states ORDER BY team_id;

-- Get Arsenal's state history
-- SELECT * FROM get_team_state_history(1) ORDER BY effective_at;

-- Get Arsenal's state at a specific time
-- SELECT * FROM get_team_state_at_time(1, '2024-01-15 10:00:00'::timestamp with time zone);

-- Get team state changes for graphing
-- SELECT 
--     effective_at,
--     market_cap,
--     current_share_price,
--     snapshot_type,
--     price_impact
-- FROM get_team_state_history(1, '2024-01-01', '2024-12-31')
-- ORDER BY effective_at;

