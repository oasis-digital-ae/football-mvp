-- =====================================================
-- COMPLETE TEAM MARKET CAP TIMELINE RECONSTRUCTION
-- =====================================================
-- This creates a chronological timeline showing the complete flow
-- from initial market cap to current market cap for any team
-- =====================================================

-- Function to get complete team timeline
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
    SELECT initial_market_cap, shares_outstanding INTO v_initial_cap, v_initial_shares
    FROM teams WHERE id = p_team_id;
    
    SELECT market_cap, shares_outstanding INTO v_current_cap, v_current_shares
    FROM teams WHERE id = p_team_id;

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
            (v_initial_cap / v_initial_shares) as share_price_before,
            (v_initial_cap / v_initial_shares) as share_price_after,
            0::DECIMAL(15,2) as price_impact,
            0 as shares_traded,
            0::DECIMAL(15,2) as trade_amount,
            NULL::INTEGER as opponent_team_id,
            NULL::TEXT as opponent_name,
            NULL::TEXT as match_result,
            NULL::TEXT as score
        
        UNION ALL
        
        -- Match results (from fixtures)
        SELECT 
            ROW_NUMBER() OVER (ORDER BY f.kickoff_at) as event_order,
            'match'::TEXT as event_type,
            f.kickoff_at as event_date,
            CASE 
                WHEN f.home_team_id = p_team_id THEN 'vs ' || away_team.name
                ELSE '@ ' || home_team.name
            END as description,
            -- Calculate pre-match market cap by working backwards from current state
            CASE 
                WHEN f.home_team_id = p_team_id THEN
                    CASE f.result
                        WHEN 'home_win' THEN v_current_cap - (away_team.market_cap * 0.10)
                        WHEN 'away_win' THEN v_current_cap + (v_current_cap * 0.10)
                        ELSE v_current_cap
                    END
                ELSE
                    CASE f.result
                        WHEN 'away_win' THEN v_current_cap - (home_team.market_cap * 0.10)
                        WHEN 'home_win' THEN v_current_cap + (v_current_cap * 0.10)
                        ELSE v_current_cap
                    END
            END as market_cap_before,
            v_current_cap as market_cap_after,
            v_current_shares as shares_outstanding,
            CASE 
                WHEN f.home_team_id = p_team_id THEN
                    CASE f.result
                        WHEN 'home_win' THEN (v_current_cap - (away_team.market_cap * 0.10)) / v_current_shares
                        WHEN 'away_win' THEN (v_current_cap + (v_current_cap * 0.10)) / v_current_shares
                        ELSE v_current_cap / v_current_shares
                    END
                ELSE
                    CASE f.result
                        WHEN 'away_win' THEN (v_current_cap - (home_team.market_cap * 0.10)) / v_current_shares
                        WHEN 'home_win' THEN (v_current_cap + (v_current_cap * 0.10)) / v_current_shares
                        ELSE v_current_cap / v_current_shares
                    END
            END as share_price_before,
            (v_current_cap / v_current_shares) as share_price_after,
            CASE 
                WHEN f.home_team_id = p_team_id THEN
                    CASE f.result
                        WHEN 'home_win' THEN away_team.market_cap * 0.10
                        WHEN 'away_win' THEN -(v_current_cap * 0.10)
                        ELSE 0
                    END
                ELSE
                    CASE f.result
                        WHEN 'away_win' THEN home_team.market_cap * 0.10
                        WHEN 'home_win' THEN -(v_current_cap * 0.10)
                        ELSE 0
                    END
            END as price_impact,
            0 as shares_traded,
            0::DECIMAL(15,2) as trade_amount,
            CASE 
                WHEN f.home_team_id = p_team_id THEN f.away_team_id
                ELSE f.home_team_id
            END as opponent_team_id,
            CASE 
                WHEN f.home_team_id = p_team_id THEN away_team.name
                ELSE home_team.name
            END as opponent_name,
            CASE f.result
                WHEN 'home_win' THEN CASE WHEN f.home_team_id = p_team_id THEN 'win' ELSE 'loss' END
                WHEN 'away_win' THEN CASE WHEN f.away_team_id = p_team_id THEN 'win' ELSE 'loss' END
                ELSE 'draw'
            END as match_result,
            CONCAT(f.home_score, '-', f.away_score) as score
        FROM fixtures f
        JOIN teams home_team ON f.home_team_id = home_team.id
        JOIN teams away_team ON f.away_team_id = away_team.id
        WHERE (f.home_team_id = p_team_id OR f.away_team_id = p_team_id)
        AND f.status = 'applied'
        AND f.result IS NOT NULL
        AND f.result != 'pending'
        
        UNION ALL
        
        -- Share purchases (from orders)
        SELECT 
            ROW_NUMBER() OVER (ORDER BY o.created_at) + 1000 as event_order,
            'purchase'::TEXT as event_type,
            o.created_at as event_date,
            CONCAT(o.quantity, ' shares purchased at $', o.price_per_share) as description,
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
    ORDER BY te.event_date ASC, te.event_order ASC;
END;
$$ LANGUAGE plpgsql;

-- Test the function with Manchester United
SELECT 
    'Manchester United Complete Timeline' as team_name,
    event_order,
    event_type,
    event_date,
    description,
    market_cap_before,
    market_cap_after,
    shares_outstanding,
    share_price_before,
    share_price_after,
    price_impact,
    shares_traded,
    trade_amount,
    opponent_name,
    match_result,
    score
FROM get_team_complete_timeline(28)
ORDER BY event_date ASC, event_order ASC;

-- Create a simpler view for easy access
CREATE OR REPLACE VIEW team_timeline_view AS
SELECT 
    t.id as team_id,
    t.name as team_name,
    t.initial_market_cap,
    t.market_cap as current_market_cap,
    t.shares_outstanding as current_shares,
    (t.market_cap / t.shares_outstanding) as current_share_price,
    (t.market_cap - t.initial_market_cap) as total_market_cap_change,
    ((t.market_cap - t.initial_market_cap) / t.initial_market_cap * 100) as market_cap_change_percent
FROM teams t;

-- Show summary for all teams
SELECT 
    'Team Market Cap Summary' as summary_type,
    team_id,
    team_name,
    initial_market_cap,
    current_market_cap,
    current_shares,
    current_share_price,
    total_market_cap_change,
    ROUND(market_cap_change_percent, 2) as change_percent
FROM team_timeline_view
ORDER BY current_market_cap DESC;

