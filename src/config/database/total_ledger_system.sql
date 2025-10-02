-- =====================================================
-- TOTAL LEDGER SYSTEM
-- =====================================================
-- This replaces the snapshot system with a comprehensive ledger
-- that tracks all team state changes in a single table
-- =====================================================

-- Drop existing snapshot system
DROP TRIGGER IF EXISTS team_market_cap_snapshot_trigger ON teams;
DROP FUNCTION IF EXISTS team_market_cap_snapshot_trigger();
DROP FUNCTION IF EXISTS create_team_snapshot(INTEGER, TEXT, INTEGER, TEXT, TEXT, DECIMAL, INTEGER, DECIMAL, TIMESTAMP);
DROP FUNCTION IF EXISTS get_team_state_at_time(INTEGER, TIMESTAMP);
DROP FUNCTION IF EXISTS get_team_state_history(INTEGER);
DROP FUNCTION IF EXISTS get_team_complete_timeline(INTEGER);
DROP VIEW IF EXISTS current_team_states;
DROP VIEW IF EXISTS team_state_snapshots_latest;
DROP TABLE IF EXISTS team_state_snapshots;

-- Create the total_ledger table
CREATE TABLE total_ledger (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    ledger_type TEXT NOT NULL CHECK (ledger_type IN ('share_purchase', 'share_sale', 'match_win', 'match_loss', 'match_draw', 'initial_state', 'manual_adjustment')),
    
    -- Event details
    event_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    event_description TEXT,
    trigger_event_id INTEGER, -- References orders.id, transfers_ledger.id, or fixtures.id
    trigger_event_type TEXT CHECK (trigger_event_type IN ('order', 'fixture', 'manual', 'initial')),
    
    -- Match details (for match events)
    opponent_team_id INTEGER REFERENCES teams(id),
    opponent_team_name TEXT,
    match_result TEXT CHECK (match_result IN ('win', 'loss', 'draw')),
    match_score TEXT, -- Format: "2-1"
    is_home_match BOOLEAN,
    
    -- Financial impact
    amount_transferred DECIMAL(15,2) NOT NULL DEFAULT 0,
    price_impact DECIMAL(15,2) NOT NULL DEFAULT 0,
    
    -- Market cap states
    market_cap_before DECIMAL(15,2) NOT NULL,
    market_cap_after DECIMAL(15,2) NOT NULL,
    
    -- Share states
    shares_outstanding_before INTEGER NOT NULL,
    shares_outstanding_after INTEGER NOT NULL,
    shares_traded INTEGER NOT NULL DEFAULT 0,
    
    -- Share price states
    share_price_before DECIMAL(10,2) NOT NULL,
    share_price_after DECIMAL(10,2) NOT NULL,
    
    -- Additional metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by TEXT DEFAULT 'system',
    notes TEXT,
    
    -- Indexes for performance
    CONSTRAINT valid_share_counts CHECK (shares_outstanding_before >= 0 AND shares_outstanding_after >= 0),
    CONSTRAINT valid_market_caps CHECK (market_cap_before >= 0 AND market_cap_after >= 0),
    CONSTRAINT valid_share_prices CHECK (share_price_before >= 0 AND share_price_after >= 0)
);

-- Create indexes for performance
CREATE INDEX idx_total_ledger_team_id ON total_ledger(team_id);
CREATE INDEX idx_total_ledger_event_date ON total_ledger(event_date);
CREATE INDEX idx_total_ledger_ledger_type ON total_ledger(ledger_type);
CREATE INDEX idx_total_ledger_team_date ON total_ledger(team_id, event_date);
CREATE INDEX idx_total_ledger_trigger_event ON total_ledger(trigger_event_type, trigger_event_id);

-- Create a view for current team states (latest entry per team)
CREATE VIEW current_team_states AS
SELECT DISTINCT ON (team_id)
    team_id,
    market_cap_after as current_market_cap,
    shares_outstanding_after as current_shares_outstanding,
    share_price_after as current_share_price,
    event_date as last_updated
FROM total_ledger
ORDER BY team_id, event_date DESC;

-- Create a view for team performance summary
CREATE VIEW team_performance_summary AS
SELECT 
    t.id as team_id,
    t.name as team_name,
    t.initial_market_cap,
    cls.current_market_cap,
    cls.current_shares_outstanding,
    cls.current_share_price,
    cls.last_updated,
    
    -- Calculate performance metrics
    (cls.current_market_cap - t.initial_market_cap) as total_market_cap_change,
    ROUND(((cls.current_market_cap - t.initial_market_cap) / t.initial_market_cap * 100), 2) as market_cap_change_percent,
    
    -- Count match results
    (SELECT COUNT(*) FROM total_ledger WHERE team_id = t.id AND ledger_type = 'match_win') as wins,
    (SELECT COUNT(*) FROM total_ledger WHERE team_id = t.id AND ledger_type = 'match_loss') as losses,
    (SELECT COUNT(*) FROM total_ledger WHERE team_id = t.id AND ledger_type = 'match_draw') as draws,
    
    -- Count share transactions
    (SELECT COUNT(*) FROM total_ledger WHERE team_id = t.id AND ledger_type = 'share_purchase') as share_purchases,
    (SELECT COUNT(*) FROM total_ledger WHERE team_id = t.id AND ledger_type = 'share_sale') as share_sales,
    
    -- Total volume traded
    (SELECT COALESCE(SUM(shares_traded), 0) FROM total_ledger WHERE team_id = t.id AND ledger_type IN ('share_purchase', 'share_sale')) as total_shares_traded,
    (SELECT COALESCE(SUM(amount_transferred), 0) FROM total_ledger WHERE team_id = t.id AND ledger_type IN ('share_purchase', 'share_sale')) as total_trade_volume
    
FROM teams t
LEFT JOIN current_team_states cls ON t.id = cls.team_id
ORDER BY cls.current_market_cap DESC;

-- Function to create ledger entries
CREATE OR REPLACE FUNCTION create_ledger_entry(
    p_team_id INTEGER,
    p_ledger_type TEXT,
    p_amount_transferred DECIMAL(15,2) DEFAULT 0,
    p_price_impact DECIMAL(15,2) DEFAULT 0,
    p_shares_traded INTEGER DEFAULT 0,
    p_trigger_event_id INTEGER DEFAULT NULL,
    p_trigger_event_type TEXT DEFAULT NULL,
    p_opponent_team_id INTEGER DEFAULT NULL,
    p_opponent_team_name TEXT DEFAULT NULL,
    p_match_result TEXT DEFAULT NULL,
    p_match_score TEXT DEFAULT NULL,
    p_is_home_match BOOLEAN DEFAULT NULL,
    p_event_description TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_ledger_id INTEGER;
    v_current_state RECORD;
    v_opponent_name TEXT;
BEGIN
    -- Get current team state
    SELECT 
        market_cap,
        shares_outstanding,
        CASE 
            WHEN shares_outstanding > 0 THEN market_cap / shares_outstanding
            ELSE 20.00
        END as current_share_price
    INTO v_current_state
    FROM teams
    WHERE id = p_team_id;
    
    -- Get opponent name if not provided
    IF p_opponent_team_id IS NOT NULL AND p_opponent_team_name IS NULL THEN
        SELECT name INTO v_opponent_name FROM teams WHERE id = p_opponent_team_id;
    ELSE
        v_opponent_name := p_opponent_team_name;
    END IF;
    
    -- Create ledger entry
    INSERT INTO total_ledger (
        team_id,
        ledger_type,
        event_description,
        trigger_event_id,
        trigger_event_type,
        opponent_team_id,
        opponent_team_name,
        match_result,
        match_score,
        is_home_match,
        amount_transferred,
        price_impact,
        market_cap_before,
        market_cap_after,
        shares_outstanding_before,
        shares_outstanding_after,
        shares_traded,
        share_price_before,
        share_price_after,
        notes
    ) VALUES (
        p_team_id,
        p_ledger_type,
        COALESCE(p_event_description, p_ledger_type),
        p_trigger_event_id,
        p_trigger_event_type,
        p_opponent_team_id,
        v_opponent_name,
        p_match_result,
        p_match_score,
        p_is_home_match,
        p_amount_transferred,
        p_price_impact,
        v_current_state.market_cap,
        v_current_state.market_cap + p_price_impact,
        v_current_state.shares_outstanding,
        v_current_state.shares_outstanding + p_shares_traded,
        p_shares_traded,
        v_current_state.current_share_price,
        CASE 
            WHEN (v_current_state.shares_outstanding + p_shares_traded) > 0 
            THEN (v_current_state.market_cap + p_price_impact) / (v_current_state.shares_outstanding + p_shares_traded)
            ELSE v_current_state.current_share_price
        END,
        p_notes
    ) RETURNING id INTO v_ledger_id;
    
    RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get team timeline
CREATE OR REPLACE FUNCTION get_team_timeline(p_team_id INTEGER)
RETURNS TABLE (
    event_order INTEGER,
    event_type TEXT,
    event_date TIMESTAMP WITH TIME ZONE,
    description TEXT,
    market_cap_before DECIMAL(15,2),
    market_cap_after DECIMAL(15,2),
    shares_outstanding INTEGER,
    share_price_before DECIMAL(10,2),
    share_price_after DECIMAL(10,2),
    price_impact DECIMAL(15,2),
    shares_traded INTEGER,
    trade_amount DECIMAL(15,2),
    opponent_team_id INTEGER,
    opponent_name TEXT,
    match_result TEXT,
    score TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ROW_NUMBER() OVER (ORDER BY tl.event_date)::INTEGER as event_order,
        tl.ledger_type as event_type,
        tl.event_date,
        CASE 
            WHEN tl.ledger_type LIKE 'match_%' AND tl.opponent_team_name IS NOT NULL THEN
                CASE 
                    WHEN tl.is_home_match THEN 'vs ' || tl.opponent_team_name
                    ELSE '@ ' || tl.opponent_team_name
                END
            ELSE tl.event_description
        END as description,
        tl.market_cap_before,
        tl.market_cap_after,
        tl.shares_outstanding_after as shares_outstanding,
        tl.share_price_before,
        tl.share_price_after,
        tl.price_impact,
        tl.shares_traded,
        tl.amount_transferred as trade_amount,
        tl.opponent_team_id,
        tl.opponent_team_name as opponent_name,
        tl.match_result,
        tl.match_score as score
    FROM total_ledger tl
    WHERE tl.team_id = p_team_id
    ORDER BY tl.event_date;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to automatically create ledger entries
CREATE OR REPLACE FUNCTION total_ledger_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_ledger_type TEXT;
    v_price_impact DECIMAL(15,2);
    v_shares_traded INTEGER;
    v_transfer_exists BOOLEAN := FALSE;
    v_recent_transfer RECORD;
    v_fixture RECORD;
BEGIN
    -- Calculate changes
    v_price_impact := NEW.market_cap - OLD.market_cap;
    v_shares_traded := NEW.shares_outstanding - OLD.shares_outstanding;
    
    -- Determine ledger type and create entry
    IF v_shares_traded != 0 THEN
        -- Share transaction
        IF v_shares_traded > 0 THEN
            v_ledger_type := 'share_purchase';
        ELSE
            v_ledger_type := 'share_sale';
        END IF;
        
        PERFORM create_ledger_entry(
            NEW.id,
            v_ledger_type,
            ABS(v_price_impact),
            v_price_impact,
            v_shares_traded,
            NULL, -- Will be set by order processing
            'order',
            NULL, NULL, NULL, NULL, NULL,
            CONCAT(ABS(v_shares_traded), ' shares ', CASE WHEN v_shares_traded > 0 THEN 'purchased' ELSE 'sold' END)
        );
        
    ELSIF v_price_impact != 0 THEN
        -- Market cap change - check if it's from a match
        SELECT EXISTS(
            SELECT 1 FROM transfers_ledger 
            WHERE (winner_team_id = NEW.id OR loser_team_id = NEW.id)
            AND applied_at >= NOW() - INTERVAL '5 minutes'
        ) INTO v_transfer_exists;
        
        IF v_transfer_exists THEN
            -- Get transfer and fixture details
            SELECT * INTO v_recent_transfer
            FROM transfers_ledger 
            WHERE (winner_team_id = NEW.id OR loser_team_id = NEW.id)
            AND applied_at >= NOW() - INTERVAL '5 minutes'
            ORDER BY applied_at DESC
            LIMIT 1;
            
            -- Get fixture details
            SELECT * INTO v_fixture
            FROM fixtures 
            WHERE id = v_recent_transfer.fixture_id;
            
            -- Determine match result
            IF v_recent_transfer.winner_team_id = NEW.id THEN
                v_ledger_type := 'match_win';
            ELSIF v_recent_transfer.loser_team_id = NEW.id THEN
                v_ledger_type := 'match_loss';
            ELSE
                v_ledger_type := 'match_draw';
            END IF;
            
            PERFORM create_ledger_entry(
                NEW.id,
                v_ledger_type,
                v_recent_transfer.transfer_amount,
                v_price_impact,
                0,
                v_recent_transfer.id,
                'fixture',
                CASE WHEN v_fixture.home_team_id = NEW.id THEN v_fixture.away_team_id ELSE v_fixture.home_team_id END,
                NULL, -- Will be filled by function
                CASE 
                    WHEN v_ledger_type = 'match_win' THEN 'win'
                    WHEN v_ledger_type = 'match_loss' THEN 'loss'
                    ELSE 'draw'
                END,
                CASE 
                    WHEN v_fixture.home_score IS NOT NULL AND v_fixture.away_score IS NOT NULL 
                    THEN CONCAT(v_fixture.home_score, '-', v_fixture.away_score)
                    ELSE NULL
                END,
                (v_fixture.home_team_id = NEW.id),
                CONCAT('Match vs ', CASE WHEN v_fixture.home_team_id = NEW.id THEN 'away team' ELSE 'home team' END)
            );
        ELSE
            -- Manual adjustment or other market cap change
            PERFORM create_ledger_entry(
                NEW.id,
                'manual_adjustment',
                0,
                v_price_impact,
                0,
                NULL,
                'manual',
                NULL, NULL, NULL, NULL, NULL,
                'Market cap adjustment'
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER total_ledger_trigger
    AFTER UPDATE ON teams
    FOR EACH ROW
    WHEN (OLD.market_cap != NEW.market_cap OR OLD.shares_outstanding != NEW.shares_outstanding)
    EXECUTE FUNCTION total_ledger_trigger();

-- Populate initial ledger entries for all teams
INSERT INTO total_ledger (
    team_id,
    ledger_type,
    event_description,
    trigger_event_type,
    amount_transferred,
    price_impact,
    market_cap_before,
    market_cap_after,
    shares_outstanding_before,
    shares_outstanding_after,
    shares_traded,
    share_price_before,
    share_price_after,
    notes
)
SELECT 
    id,
    'initial_state',
    'Initial State',
    'initial',
    0,
    0,
    initial_market_cap,
    market_cap,
    shares_outstanding,
    shares_outstanding,
    0,
    CASE 
        WHEN shares_outstanding > 0 THEN initial_market_cap / shares_outstanding
        ELSE launch_price
    END,
    CASE 
        WHEN shares_outstanding > 0 THEN market_cap / shares_outstanding
        ELSE launch_price
    END,
    'Initial team state'
FROM teams;

-- Test the system
SELECT 
    'Total Ledger System Setup Complete' as status,
    COUNT(*) as total_teams,
    (SELECT COUNT(*) FROM total_ledger WHERE ledger_type = 'initial_state') as initial_entries,
    (SELECT COUNT(*) FROM total_ledger) as total_entries
FROM teams;

