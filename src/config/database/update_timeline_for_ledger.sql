-- Update the timeline function to use total_ledger instead of team_state_snapshots
-- This will make the frontend display the correct match history with opponent names

-- Drop the existing function
DROP FUNCTION IF EXISTS get_team_complete_timeline(INTEGER);

-- Create the updated function that uses total_ledger
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
    -- Return timeline from total_ledger
    RETURN QUERY
    SELECT 
        ROW_NUMBER() OVER (ORDER BY tl.event_date)::INTEGER as event_order,
        CASE 
            WHEN tl.ledger_type = 'initial_state' THEN 'initial'
            WHEN tl.ledger_type LIKE 'match_%' THEN 'match'
            WHEN tl.ledger_type LIKE 'share_%' THEN 'purchase'
            ELSE 'other'
        END as event_type,
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
        tl.opponent_team_name,
        tl.match_result,
        tl.match_score as score
    FROM total_ledger tl
    WHERE tl.team_id = p_team_id
    ORDER BY tl.event_date ASC;
END;
$$ LANGUAGE plpgsql;

-- Test the updated function
DO $$
DECLARE
    v_test_team_id INTEGER := 37; -- Brighton
    v_timeline_count INTEGER;
BEGIN
    -- Test the function
    SELECT COUNT(*) INTO v_timeline_count
    FROM get_team_complete_timeline(v_test_team_id);
    
    RAISE NOTICE 'Timeline function test for team %: % events found', v_test_team_id, v_timeline_count;
    
    -- Show sample timeline data
    RAISE NOTICE 'Sample timeline data:';
    DECLARE
        v_timeline_entry RECORD;
    BEGIN
        FOR v_timeline_entry IN 
            SELECT event_type, description, opponent_name, match_result, price_impact
            FROM get_team_complete_timeline(v_test_team_id)
            ORDER BY event_date
            LIMIT 5
        LOOP
            RAISE NOTICE '  %: % (vs % - % - impact: %)', 
                v_timeline_entry.event_type, 
                v_timeline_entry.description, 
                v_timeline_entry.opponent_name, 
                v_timeline_entry.match_result,
                v_timeline_entry.price_impact;
        END LOOP;
    END;
END $$;
