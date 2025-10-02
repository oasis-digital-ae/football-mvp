-- =====================================================
-- COMPLETE THE TEAM_STATE_SNAPSHOTS IMPLEMENTATION
-- =====================================================
-- This script adds the missing constraints, indexes, functions, and views
-- to complete the team_state_snapshots system

-- =====================================================
-- ADD MISSING CONSTRAINTS
-- =====================================================

-- Add the missing check constraint
ALTER TABLE team_state_snapshots 
ADD CONSTRAINT valid_share_counts CHECK (
    shares_outstanding >= 0 AND 
    market_cap >= 0 AND
    current_share_price >= 0
);

-- =====================================================
-- CREATE MISSING INDEXES
-- =====================================================

-- Index for team-based queries with time ordering
CREATE INDEX IF NOT EXISTS idx_team_state_snapshots_team_id 
ON team_state_snapshots(team_id, effective_at DESC);

-- Index for snapshot type queries
CREATE INDEX IF NOT EXISTS idx_team_state_snapshots_type 
ON team_state_snapshots(snapshot_type, effective_at DESC);

-- Index for trigger event lookups
CREATE INDEX IF NOT EXISTS idx_team_state_snapshots_trigger 
ON team_state_snapshots(trigger_event_type, trigger_event_id);

-- =====================================================
-- CREATE MISSING VIEWS
-- =====================================================

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
-- CREATE MISSING FUNCTIONS
-- =====================================================

-- Function to create a snapshot
CREATE OR REPLACE FUNCTION create_team_snapshot(
    p_team_id INTEGER,
    p_snapshot_type TEXT,
    p_trigger_event_id INTEGER DEFAULT NULL,
    p_trigger_event_type TEXT DEFAULT NULL,
    p_match_result TEXT DEFAULT NULL,
    p_price_impact DECIMAL(15,2) DEFAULT 0,
    p_shares_traded INTEGER DEFAULT 0,
    p_trade_amount DECIMAL(15,2) DEFAULT 0
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
        trade_amount
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
        p_trade_amount
    ) RETURNING id INTO v_snapshot_id;
    
    RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get team state at a specific time
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
        AND s.effective_at <= p_at_time
    ORDER BY s.effective_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get team state history for graphing
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
-- CREATE TRIGGERS
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
DROP TRIGGER IF EXISTS team_market_cap_snapshot_trigger ON teams;
CREATE TRIGGER team_market_cap_snapshot_trigger
    AFTER UPDATE OF market_cap ON teams
    FOR EACH ROW
    EXECUTE FUNCTION trigger_team_snapshot_on_market_cap_change();

-- =====================================================
-- CREATE INITIAL SNAPSHOTS
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
-- VERIFY IMPLEMENTATION
-- =====================================================

-- Test the functions work
SELECT 'Testing create_team_snapshot function...' as test_status;
SELECT create_team_snapshot(1, 'manual', NULL, 'manual', NULL, 0, 0, 0) as test_result;

-- Test the view works
SELECT 'Testing current_team_states view...' as test_status;
SELECT COUNT(*) as snapshot_count FROM current_team_states;

-- Test the history function works
SELECT 'Testing get_team_state_history function...' as test_status;
SELECT COUNT(*) as history_count FROM get_team_state_history(1);

-- Show final table structure
SELECT 'Final team_state_snapshots table structure:' as info;
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'team_state_snapshots' 
ORDER BY ordinal_position;


