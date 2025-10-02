-- =====================================================
-- FIXED TIMELINE FUNCTION WITH OPPONENT NAMES
-- =====================================================
-- This creates a timeline function that properly shows opponent names
-- =====================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_team_complete_timeline(INTEGER);

-- Create the function to get complete team timeline with opponent names
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
            CASE 
                WHEN v_initial_shares > 0 THEN v_initial_cap / v_initial_shares
                ELSE (SELECT launch_price FROM teams WHERE id = p_team_id)
            END as share_price_before,
            CASE 
                WHEN v_initial_shares > 0 THEN v_initial_cap / v_initial_shares
                ELSE (SELECT launch_price FROM teams WHERE id = p_team_id)
            END as share_price_after,
            0::DECIMAL(15,2) as price_impact,
            0 as shares_traded,
            0::DECIMAL(15,2) as trade_amount,
            NULL::INTEGER as opponent_team_id,
            NULL::TEXT as opponent_name,
            NULL::TEXT as match_result,
            NULL::TEXT as score
        
        UNION ALL
        
        -- Match results (from snapshots with fixture data)
        SELECT 
            ROW_NUMBER() OVER (ORDER BY s.effective_at)::INTEGER as event_order,
            'match'::TEXT as event_type,
            s.effective_at as event_date,
            CASE 
                WHEN f.home_team_id = p_team_id THEN 'vs ' || away_team.name
                ELSE '@ ' || home_team.name
            END as description,
            (s.market_cap - s.price_impact) as market_cap_before,
            s.market_cap as market_cap_after,
            s.shares_outstanding,
            ((s.market_cap - s.price_impact) / s.shares_outstanding) as share_price_before,
            (s.market_cap / s.shares_outstanding) as share_price_after,
            s.price_impact,
            0 as shares_traded,
            0::DECIMAL(15,2) as trade_amount,
            CASE WHEN f.home_team_id = p_team_id THEN f.away_team_id ELSE f.home_team_id END as opponent_team_id,
            CASE WHEN f.home_team_id = p_team_id THEN away_team.name ELSE home_team.name END as opponent_name,
            s.match_result,
            CASE 
                WHEN f.home_score IS NOT NULL AND f.away_score IS NOT NULL 
                THEN CONCAT(f.home_score, '-', f.away_score)
                ELSE NULL
            END as score
        FROM team_state_snapshots s
        LEFT JOIN transfers_ledger tl ON s.trigger_event_id = tl.id
        LEFT JOIN fixtures f ON tl.fixture_id = f.id
        LEFT JOIN teams home_team ON f.home_team_id = home_team.id
        LEFT JOIN teams away_team ON f.away_team_id = away_team.id
        WHERE s.team_id = p_team_id
        AND s.snapshot_type = 'match_result'
        AND s.match_result IS NOT NULL
        
        UNION ALL
        
        -- Share purchases (from snapshots)
        SELECT 
            (ROW_NUMBER() OVER (ORDER BY s.effective_at) + 1000)::INTEGER as event_order,
            'purchase'::TEXT as event_type,
            s.effective_at as event_date,
            CONCAT(s.shares_traded, ' shares purchased at $', ROUND(s.trade_amount / s.shares_traded, 2)) as description,
            (s.market_cap - s.price_impact) as market_cap_before,
            s.market_cap as market_cap_after,
            s.shares_outstanding,
            ((s.market_cap - s.price_impact) / (s.shares_outstanding - s.shares_traded)) as share_price_before,
            (s.market_cap / s.shares_outstanding) as share_price_after,
            s.price_impact,
            s.shares_traded,
            s.trade_amount,
            NULL::INTEGER as opponent_team_id,
            NULL::TEXT as opponent_name,
            NULL::TEXT as match_result,
            NULL::TEXT as score
        FROM team_state_snapshots s
        WHERE s.team_id = p_team_id
        AND s.snapshot_type = 'share_purchase'
        AND s.shares_traded > 0
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

-- Test the function
SELECT 
    'Timeline Function Test' as test_type,
    event_order,
    event_type,
    event_date,
    description,
    market_cap_before,
    market_cap_after,
    share_price_before,
    share_price_after,
    price_impact,
    opponent_name,
    match_result
FROM get_team_complete_timeline(21) -- Test with team 21
ORDER BY event_order, event_date
LIMIT 5;
