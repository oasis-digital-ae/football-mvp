-- =====================================================
-- SETUP: Team Timeline Function for Frontend
-- =====================================================
-- This creates the function that the frontend will call
-- =====================================================

-- Create the function to get complete team timeline
CREATE OR REPLACE FUNCTION get_team_complete_timeline(p_team_id INTEGER)
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
DECLARE
    v_initial_cap DECIMAL(15,2);
    v_initial_shares INTEGER;
    v_current_cap DECIMAL(15,2);
    v_current_shares INTEGER;
BEGIN
    -- Get initial and current team state
    SELECT t.initial_market_cap, t.shares_outstanding INTO v_initial_cap, v_initial_shares
    FROM teams t WHERE t.id = p_team_id;
    
    SELECT t.market_cap, t.shares_outstanding INTO v_current_cap, v_current_shares
    FROM teams t WHERE t.id = p_team_id;

    -- Return complete timeline combining all events
    RETURN QUERY
    WITH team_events AS (
        -- Initial state
        SELECT 
            0 as event_order,
            'initial'::TEXT as event_type,
            (SELECT MIN(kickoff_at) FROM fixtures WHERE (home_team_id = p_team_id OR away_team_id = p_team_id) AND status = 'applied') as event_date,
            'Initial State'::TEXT as description,
            v_initial_cap as market_cap_before,
            v_initial_cap as market_cap_after,
            v_initial_shares as shares_outstanding,
            (SELECT launch_price FROM teams WHERE id = p_team_id) as share_price_before,
            (SELECT launch_price FROM teams WHERE id = p_team_id) as share_price_after,
            0::DECIMAL(15,2) as price_impact,
            0 as shares_traded,
            0::DECIMAL(15,2) as trade_amount,
            NULL::INTEGER as opponent_team_id,
            NULL::TEXT as opponent_name,
            NULL::TEXT as match_result,
            NULL::TEXT as score
        
        UNION ALL
        
        -- Match results (from snapshots) - simplified version without fixture dependency
        SELECT 
            ROW_NUMBER() OVER (ORDER BY s.effective_at)::INTEGER as event_order,
            'match'::TEXT as event_type,
            s.effective_at as event_date,
            'Match Result' as description,
            -- Use snapshot data for accurate historical values
            (s.market_cap - s.price_impact) as market_cap_before,
            s.market_cap as market_cap_after,
            s.shares_outstanding,
            CASE 
                WHEN s.shares_outstanding > 0 
                THEN ((s.market_cap - s.price_impact) / s.shares_outstanding)
                ELSE s.current_share_price
            END as share_price_before,
            CASE 
                WHEN s.shares_outstanding > 0 
                THEN (s.market_cap / s.shares_outstanding)
                ELSE s.current_share_price
            END as share_price_after,
            s.price_impact,
            0 as shares_traded,
            0::DECIMAL(15,2) as trade_amount,
            NULL::INTEGER as opponent_team_id,
            NULL::TEXT as opponent_name,
            s.match_result,
            NULL::TEXT as score
        FROM team_state_snapshots s
        WHERE s.team_id = p_team_id
        AND s.snapshot_type = 'match_result'
        
        UNION ALL
        
        -- Share purchases (from orders) - simplified version
        SELECT 
            (ROW_NUMBER() OVER (ORDER BY o.created_at) + 1000)::INTEGER as event_order,
            'purchase'::TEXT as event_type,
            o.created_at as event_date,
            CONCAT(o.quantity, ' shares purchased at $', o.price_per_share) as description,
            -- Use current values as placeholders for now
            (v_current_cap - o.total_amount) as market_cap_before,
            v_current_cap as market_cap_after,
            v_current_shares as shares_outstanding,
            o.price_per_share as share_price_before,
            o.price_per_share as share_price_after,
            o.total_amount as price_impact,
            o.quantity as shares_traded,
            o.total_amount as trade_amount,
            NULL::INTEGER as opponent_team_id,
            NULL::TEXT as opponent_name,
            NULL::TEXT as match_result,
            NULL::TEXT as score
        FROM orders o
        WHERE o.team_id = p_team_id
        AND o.order_type = 'BUY'
        AND o.status = 'FILLED'
    )
    SELECT 
        te.event_order,
        te.event_type,
        te.event_date,
        te.description,
        te.market_cap_before,
        te.market_cap_after,
        te.shares_outstanding,
        te.share_price_before,
        te.share_price_after,
        te.price_impact,
        te.shares_traded,
        te.trade_amount,
        te.opponent_team_id,
        te.opponent_name,
        te.match_result,
        te.score
    FROM team_events te
    ORDER BY te.event_order ASC, te.event_date ASC;
END;
$$ LANGUAGE plpgsql;

-- Debug Brighton snapshots
SELECT 
    'Brighton Snapshots' as debug_type,
    s.id,
    s.team_id,
    s.snapshot_type,
    s.match_result,
    s.market_cap,
    s.price_impact,
    s.effective_at,
    s.trigger_event_id,
    s.trigger_event_type,
    f.kickoff_at as fixture_date,
    ht.name as home_team,
    at.name as away_team
FROM team_state_snapshots s
LEFT JOIN fixtures f ON s.trigger_event_id = f.id AND s.trigger_event_type = 'fixture'
LEFT JOIN teams ht ON f.home_team_id = ht.id
LEFT JOIN teams at ON f.away_team_id = at.id
WHERE s.team_id = 37  -- Brighton & Hove Albion FC
ORDER BY s.effective_at
LIMIT 10;

-- Test Brighton timeline
SELECT 
    'Brighton Timeline' as test_description,
    event_order,
    event_type,
    event_date,
    description,
    market_cap_before,
    market_cap_after,
    share_price_before,
    share_price_after,
    price_impact,
    shares_traded,
    trade_amount,
    opponent_name,
    match_result,
    score
FROM get_team_complete_timeline(37)
LIMIT 10;

-- Test if function exists
SELECT 'Function Check' as test_type, 
       routine_name, 
       routine_type 
FROM information_schema.routines 
WHERE routine_name = 'get_team_complete_timeline';

-- Simple test query
SELECT 'Simple Test' as test_type, 
       COUNT(*) as snapshot_count 
FROM team_state_snapshots 
WHERE team_id = 37 AND snapshot_type = 'match_result';

-- Check what snapshots exist for Brighton
SELECT 
    'All Brighton Snapshots' as debug_type,
    s.id,
    s.team_id,
    s.snapshot_type,
    s.match_result,
    s.market_cap,
    s.price_impact,
    s.effective_at,
    s.trigger_event_id,
    s.trigger_event_type
FROM team_state_snapshots s
WHERE s.team_id = 37
ORDER BY s.effective_at;
