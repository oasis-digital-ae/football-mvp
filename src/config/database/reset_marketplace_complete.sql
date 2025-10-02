-- Complete marketplace reset function
-- This will reset teams, clear all ledger data, and ensure no calculation issues

-- Create the complete reset function
CREATE OR REPLACE FUNCTION reset_marketplace_complete()
RETURNS TEXT AS $$
DECLARE
    v_teams_reset INTEGER := 0;
    v_ledger_cleared INTEGER := 0;
    v_transfers_cleared INTEGER := 0;
    v_orders_cleared INTEGER := 0;
    v_positions_cleared INTEGER := 0;
    v_fixtures_reset INTEGER := 0;
BEGIN
    -- Step 1: Clear all dependent data first (to avoid foreign key issues)
    
    -- Clear total_ledger (no dependencies)
    DELETE FROM total_ledger;
    GET DIAGNOSTICS v_ledger_cleared = ROW_COUNT;
    
    -- Clear transfers_ledger (no dependencies)
    DELETE FROM transfers_ledger;
    GET DIAGNOSTICS v_transfers_cleared = ROW_COUNT;
    
    -- Clear orders (no dependencies)
    DELETE FROM orders;
    GET DIAGNOSTICS v_orders_cleared = ROW_COUNT;
    
    -- Clear positions (no dependencies)
    DELETE FROM positions;
    GET DIAGNOSTICS v_positions_cleared = ROW_COUNT;
    
    -- Step 2: Reset fixtures to pending state
    UPDATE fixtures 
    SET 
        result = 'pending',
        home_score = 0,
        away_score = 0,
        status = 'scheduled',
        updated_at = NOW()
    WHERE result != 'pending';
    GET DIAGNOSTICS v_fixtures_reset = ROW_COUNT;
    
    -- Step 3: Reset teams to initial state
    UPDATE teams 
    SET 
        market_cap = initial_market_cap,
        shares_outstanding = 5,
        total_shares = 5,
        available_shares = 5,
        updated_at = NOW();
    GET DIAGNOSTICS v_teams_reset = ROW_COUNT;
    
    -- Step 4: Create initial ledger entries for all teams
    INSERT INTO total_ledger (
        team_id,
        ledger_type,
        event_date,
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
        created_at,
        created_by,
        notes
    )
    SELECT 
        t.id,
        'initial_state',
        NOW(),
        'Initial State',
        'initial',
        0,
        0,
        t.initial_market_cap,
        t.initial_market_cap,
        5,
        5,
        0,
        t.launch_price,
        t.launch_price,
        NOW(),
        'system',
        'Marketplace reset - initial state'
    FROM teams t;
    
    -- Return summary
    RETURN FORMAT(
        'Marketplace reset complete: %s teams reset, %s ledger entries cleared, %s transfers cleared, %s orders cleared, %s positions cleared, %s fixtures reset',
        v_teams_reset,
        v_ledger_cleared,
        v_transfers_cleared,
        v_orders_cleared,
        v_positions_cleared,
        v_fixtures_reset
    );
END;
$$ LANGUAGE plpgsql;

-- Test the reset function
DO $$
DECLARE
    v_result TEXT;
    v_team_count INTEGER;
    v_ledger_count INTEGER;
    v_transfer_count INTEGER;
BEGIN
    -- Show current state
    SELECT COUNT(*) INTO v_team_count FROM teams;
    SELECT COUNT(*) INTO v_ledger_count FROM total_ledger;
    SELECT COUNT(*) INTO v_transfer_count FROM transfers_ledger;
    
    RAISE NOTICE 'Before reset: % teams, % ledger entries, % transfers', v_team_count, v_ledger_count, v_transfer_count;
    
    -- Run the reset
    SELECT reset_marketplace_complete() INTO v_result;
    RAISE NOTICE '%', v_result;
    
    -- Show state after reset
    SELECT COUNT(*) INTO v_team_count FROM teams;
    SELECT COUNT(*) INTO v_ledger_count FROM total_ledger;
    SELECT COUNT(*) INTO v_transfer_count FROM transfers_ledger;
    
    RAISE NOTICE 'After reset: % teams, % ledger entries, % transfers', v_team_count, v_ledger_count, v_transfer_count;
    
    -- Show sample team data
    RAISE NOTICE 'Sample team data after reset:';
    DECLARE
        v_team RECORD;
    BEGIN
        FOR v_team IN 
            SELECT id, name, market_cap, shares_outstanding, launch_price
            FROM teams 
            ORDER BY id
            LIMIT 3
        LOOP
            RAISE NOTICE '  Team % (%): Market Cap: %, Shares: %, Launch Price: %', 
                v_team.id, v_team.name, v_team.market_cap, v_team.shares_outstanding, v_team.launch_price;
        END LOOP;
    END;
    
    -- Show sample ledger data
    RAISE NOTICE 'Sample ledger data after reset:';
    DECLARE
        v_ledger RECORD;
    BEGIN
        FOR v_ledger IN 
            SELECT team_id, ledger_type, market_cap_before, market_cap_after, share_price_before, share_price_after
            FROM total_ledger 
            ORDER BY team_id
            LIMIT 3
        LOOP
            RAISE NOTICE '  Team %: % | Market Cap: % → %, Share Price: % → %', 
                v_ledger.team_id, v_ledger.ledger_type, v_ledger.market_cap_before, v_ledger.market_cap_after, 
                v_ledger.share_price_before, v_ledger.share_price_after;
        END LOOP;
    END;
END $$;

