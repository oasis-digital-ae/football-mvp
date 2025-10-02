-- Diagnose trigger timing and transfer lookup issues
-- This script will help identify why the trigger isn't finding transfers

DO $$
DECLARE
    v_test_team_id INTEGER := 34; -- Liverpool
    v_recent_transfer RECORD;
    v_transfer_exists BOOLEAN := FALSE;
    v_team_update_time TIMESTAMP WITH TIME ZONE;
    v_transfer_time TIMESTAMP WITH TIME ZONE;
    v_time_diff INTERVAL;
BEGIN
    RAISE NOTICE '=== TRIGGER TIMING DIAGNOSTIC ===';
    
    -- Get the most recent team update time
    SELECT updated_at INTO v_team_update_time
    FROM teams 
    WHERE id = v_test_team_id;
    
    RAISE NOTICE 'Team % last updated at: %', v_test_team_id, v_team_update_time;
    
    -- Check for transfers within 5 minutes of team update
    SELECT EXISTS(
        SELECT 1 FROM transfers_ledger 
        WHERE (winner_team_id = v_test_team_id OR loser_team_id = v_test_team_id)
        AND applied_at >= v_team_update_time - INTERVAL '5 minutes'
        AND applied_at <= v_team_update_time + INTERVAL '5 minutes'
    ) INTO v_transfer_exists;
    
    RAISE NOTICE 'Transfer exists within 5 minutes of team update: %', v_transfer_exists;
    
    -- Get the most recent transfer for this team
    SELECT * INTO v_recent_transfer
    FROM transfers_ledger 
    WHERE (winner_team_id = v_test_team_id OR loser_team_id = v_test_team_id)
    ORDER BY applied_at DESC
    LIMIT 1;
    
    IF v_recent_transfer.id IS NOT NULL THEN
        v_transfer_time := v_recent_transfer.applied_at;
        v_time_diff := v_team_update_time - v_transfer_time;
        
        RAISE NOTICE 'Most recent transfer:';
        RAISE NOTICE '  Transfer ID: %', v_recent_transfer.id;
        RAISE NOTICE '  Transfer time: %', v_transfer_time;
        RAISE NOTICE '  Time difference: %', v_time_diff;
        RAISE NOTICE '  Winner team: %', v_recent_transfer.winner_team_id;
        RAISE NOTICE '  Loser team: %', v_recent_transfer.loser_team_id;
        RAISE NOTICE '  Transfer amount: %', v_recent_transfer.transfer_amount;
        
        -- Check if this transfer would be found by the trigger
        IF v_transfer_time >= v_team_update_time - INTERVAL '5 minutes' 
           AND v_transfer_time <= v_team_update_time + INTERVAL '5 minutes' THEN
            RAISE NOTICE '✅ This transfer WOULD be found by the trigger';
        ELSE
            RAISE NOTICE '❌ This transfer would NOT be found by the trigger (outside 5-minute window)';
        END IF;
    ELSE
        RAISE NOTICE 'No transfers found for team %', v_test_team_id;
    END IF;
    
    -- Show all recent transfers for this team
    RAISE NOTICE '';
    RAISE NOTICE 'All transfers for team %:', v_test_team_id;
    FOR v_recent_transfer IN 
        SELECT * FROM transfers_ledger 
        WHERE (winner_team_id = v_test_team_id OR loser_team_id = v_test_team_id)
        ORDER BY applied_at DESC
        LIMIT 5
    LOOP
        v_time_diff := v_team_update_time - v_recent_transfer.applied_at;
        RAISE NOTICE '  Transfer %: % (diff: %)', 
            v_recent_transfer.id, 
            v_recent_transfer.applied_at, 
            v_time_diff;
    END LOOP;
    
    -- Show recent team updates
    RAISE NOTICE '';
    RAISE NOTICE 'Recent team updates for team %:', v_test_team_id;
    FOR v_team_update_time IN 
        SELECT updated_at FROM teams 
        WHERE id = v_test_team_id
        ORDER BY updated_at DESC
        LIMIT 3
    LOOP
        RAISE NOTICE '  Team updated at: %', v_team_update_time;
    END LOOP;
    
END $$;

