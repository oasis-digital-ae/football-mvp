-- Fix the timeline function to show accurate cumulative market cap progression
-- This will ensure each event shows the correct before/after values based on cumulative changes

-- Drop the existing function
DROP FUNCTION IF EXISTS get_team_complete_timeline(INTEGER);

-- Create the updated function with cumulative calculations
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
BEGIN
    -- Get initial team state
    SELECT t.initial_market_cap, t.shares_outstanding INTO v_initial_cap, v_initial_shares
    FROM teams t WHERE t.id = p_team_id;

    -- Return timeline with cumulative market cap calculations
    RETURN QUERY
    WITH cumulative_ledger AS (
        SELECT 
            tl.*,
            -- Calculate cumulative market cap from initial + all price impacts up to this point
            v_initial_cap + SUM(tl.price_impact) OVER (
                ORDER BY tl.event_date 
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) as cumulative_market_cap,
            -- Calculate cumulative shares outstanding
            v_initial_shares + SUM(tl.shares_traded) OVER (
                ORDER BY tl.event_date 
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) as cumulative_shares_outstanding
        FROM total_ledger tl
        WHERE tl.team_id = p_team_id
        ORDER BY tl.event_date
    )
    SELECT 
        ROW_NUMBER() OVER (ORDER BY cl.event_date)::INTEGER as event_order,
        CASE 
            WHEN cl.ledger_type = 'initial_state' THEN 'initial'
            WHEN cl.ledger_type LIKE 'match_%' THEN 'match'
            WHEN cl.ledger_type LIKE 'share_%' THEN 'purchase'
            ELSE 'other'
        END as event_type,
        cl.event_date,
        CASE 
            WHEN cl.ledger_type LIKE 'match_%' AND cl.opponent_team_name IS NOT NULL THEN
                CASE 
                    WHEN cl.is_home_match THEN 'vs ' || cl.opponent_team_name
                    ELSE '@ ' || cl.opponent_team_name
                END
            ELSE cl.event_description
        END as description,
        -- Market cap before = cumulative market cap - current price impact
        (cl.cumulative_market_cap - cl.price_impact) as market_cap_before,
        -- Market cap after = cumulative market cap
        cl.cumulative_market_cap as market_cap_after,
        -- Shares outstanding after this event
        cl.cumulative_shares_outstanding as shares_outstanding,
        -- Share price before = (market cap before) / (shares before)
        CASE 
            WHEN (cl.cumulative_shares_outstanding - cl.shares_traded) > 0 
            THEN (cl.cumulative_market_cap - cl.price_impact) / (cl.cumulative_shares_outstanding - cl.shares_traded)
            ELSE cl.share_price_before
        END as share_price_before,
        -- Share price after = (market cap after) / (shares after)
        CASE 
            WHEN cl.cumulative_shares_outstanding > 0 
            THEN cl.cumulative_market_cap / cl.cumulative_shares_outstanding
            ELSE cl.share_price_after
        END as share_price_after,
        cl.price_impact,
        cl.shares_traded,
        cl.amount_transferred as trade_amount,
        cl.opponent_team_id,
        cl.opponent_team_name,
        cl.match_result,
        cl.match_score as score
    FROM cumulative_ledger cl
    ORDER BY cl.event_date ASC;
END;
$$ LANGUAGE plpgsql;

-- Test the updated function
DO $$
DECLARE
    v_test_team_id INTEGER := 24; -- Everton (from your example)
    v_timeline_count INTEGER;
BEGIN
    -- Test the function
    SELECT COUNT(*) INTO v_timeline_count
    FROM get_team_complete_timeline(v_test_team_id);
    
    RAISE NOTICE 'Timeline function test for team %: % events found', v_test_team_id, v_timeline_count;
    
    -- Show sample timeline data with cumulative progression
    RAISE NOTICE 'Sample timeline data (cumulative):';
    DECLARE
        v_timeline_entry RECORD;
    BEGIN
        FOR v_timeline_entry IN 
            SELECT 
                event_type, 
                description, 
                opponent_name, 
                match_result, 
                market_cap_before,
                market_cap_after,
                price_impact,
                share_price_before,
                share_price_after
            FROM get_team_complete_timeline(v_test_team_id)
            ORDER BY event_date
            LIMIT 5
        LOOP
            RAISE NOTICE '  %: % (vs % - %) | Market Cap: % → % (impact: %) | Share Price: % → %', 
                v_timeline_entry.event_type, 
                v_timeline_entry.description, 
                v_timeline_entry.opponent_name, 
                v_timeline_entry.match_result,
                v_timeline_entry.market_cap_before,
                v_timeline_entry.market_cap_after,
                v_timeline_entry.price_impact,
                v_timeline_entry.share_price_before,
                v_timeline_entry.share_price_after;
        END LOOP;
    END;
END $$;

