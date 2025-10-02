-- Create a simple, robust timeline function that works with current database schema
-- This function will handle missing tables gracefully and provide basic timeline data

DROP FUNCTION IF EXISTS get_team_complete_timeline(INTEGER);

-- Simple timeline function that works with existing tables
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
BEGIN
    -- Return initial state if team exists
    RETURN QUERY
    SELECT 
        0 as event_order,
        'initial'::TEXT as event_type,
        '2024-08-17 14:00:00+00'::TIMESTAMP WITH TIME ZONE as event_date,
        'Initial State'::TEXT as description,
        t.initial_market_cap as market_cap_before,
        t.initial_market_cap as market_cap_after,
        t.shares_outstanding as shares_outstanding,
        CASE 
            WHEN t.shares_outstanding > 0 THEN (t.initial_market_cap / t.shares_outstanding)::DECIMAL(10,2)
            ELSE 20.0::DECIMAL(10,2)
        END as share_price_before,
        CASE 
            WHEN t.shares_outstanding > 0 THEN (t.initial_market_cap / t.shares_outstanding)::DECIMAL(10,2)
            ELSE 20.0::DECIMAL(10,2)
        END as share_price_after,
        0::DECIMAL(15,2) as price_impact,
        0 as shares_traded,
        0::DECIMAL(15,2) as trade_amount,
        NULL::INTEGER as opponent_team_id,
        NULL::TEXT as opponent_name,
        NULL::TEXT as match_result,
        NULL::TEXT as score
    FROM teams t 
    WHERE t.id = p_team_id;

    -- Check if total_ledger table exists and add events
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'total_ledger' 
        AND table_schema = 'public'
    ) THEN
        RETURN QUERY
        SELECT 
            tl.id::INTEGER as event_order,
            tl.event_type,
            tl.event_date,
            tl.description,
            tl.market_cap_before,
            tl.market_cap_after,
            tl.shares_outstanding_after as shares_outstanding,
            tl.share_price_before,
            tl.share_price_after,
            tl.price_impact,
            tl.shares_traded,
            tl.amount_transferred as trade_amount,
            tl.opponent_team_id,
            tl.opponent_name,
            tl.match_result,
            tl.score
        FROM total_ledger tl
        WHERE tl.team_id = p_team_id
        ORDER BY tl.event_date ASC, tl.id ASC;
    ELSE
        -- Return a placeholder event if total_ledger doesn't exist
        RETURN QUERY
        SELECT 
            1::INTEGER as event_order,
            'placeholder'::TEXT as event_type,
            NOW()::TIMESTAMP WITH TIME ZONE as event_date,
            'Timeline data unavailable'::TEXT as description,
            t.market_cap as market_cap_before,
            t.market_cap as market_cap_after,
            t.shares_outstanding as shares_outstanding,
            CASE 
                WHEN t.shares_outstanding > 0 THEN (t.market_cap / t.shares_outstanding)::DECIMAL(10,2)
                ELSE 20.0::DECIMAL(10,2)
            END as share_price_before,
            CASE 
                WHEN t.shares_outstanding > 0 THEN (t.market_cap / t.shares_outstanding)::DECIMAL(10,2)
                ELSE 20.0::DECIMAL(10,2)
            END as share_price_after,
            0::DECIMAL(15,2) as price_impact,
            0 as shares_traded,
            0::DECIMAL(15,2) as trade_amount,
            NULL::INTEGER as opponent_team_id,
            NULL::TEXT as opponent_name,
            NULL::TEXT as match_result,
            NULL::TEXT as score
        FROM teams t 
        WHERE t.id = p_team_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Test the function
SELECT 'Simple Timeline Function Test' as test_description, COUNT(*) as event_count
FROM get_team_complete_timeline(28)
LIMIT 5;
