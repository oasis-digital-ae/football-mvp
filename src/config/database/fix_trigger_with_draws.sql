-- Fix the trigger to handle draws properly
-- Draws have no transfer_ledger entries, so we need to check fixtures directly

-- Drop the existing trigger
DROP TRIGGER IF EXISTS total_ledger_trigger ON teams;

-- Create a new trigger function that handles draws
CREATE OR REPLACE FUNCTION total_ledger_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_ledger_type TEXT;
    v_price_impact DECIMAL(15,2) := 0;
    v_shares_traded INTEGER := 0;
    v_recent_transfer RECORD;
    v_draw_fixture RECORD;
    v_fixture RECORD;
    v_transfer_exists BOOLEAN := FALSE;
    v_draw_exists BOOLEAN := FALSE;
BEGIN
    -- Calculate the changes
    v_price_impact := NEW.market_cap - OLD.market_cap;
    v_shares_traded := NEW.shares_outstanding - OLD.shares_outstanding;
    
    -- Only proceed if there are actual changes
    IF v_price_impact != 0 OR v_shares_traded != 0 THEN
        
        -- First, check for recent draw fixtures (no transfers for draws)
        SELECT * INTO v_draw_fixture
        FROM fixtures 
        WHERE (home_team_id = NEW.id OR away_team_id = NEW.id)
        AND result = 'draw'
        AND status = 'applied'
        AND updated_at >= NOW() - INTERVAL '1 hour'
        ORDER BY updated_at DESC
        LIMIT 1;
        
        v_draw_exists := (v_draw_fixture.id IS NOT NULL);
        
        IF v_draw_exists THEN
            -- Create match_draw entry
            PERFORM create_ledger_entry(
                NEW.id,
                'match_draw',
                0, -- No transfer amount for draws
                v_price_impact,
                v_shares_traded,
                v_draw_fixture.id,
                'fixture',
                CASE WHEN v_draw_fixture.home_team_id = NEW.id THEN v_draw_fixture.away_team_id ELSE v_draw_fixture.home_team_id END,
                NULL, -- Will be filled by function
                'draw',
                CASE 
                    WHEN v_draw_fixture.home_score IS NOT NULL AND v_draw_fixture.away_score IS NOT NULL 
                    THEN CONCAT(v_draw_fixture.home_score, '-', v_draw_fixture.away_score)
                    ELSE NULL
                END,
                (v_draw_fixture.home_team_id = NEW.id),
                CONCAT('Match vs ', CASE WHEN v_draw_fixture.home_team_id = NEW.id THEN 'away team' ELSE 'home team' END)
            );
            
        ELSE
            -- Look for the most recent transfer for this team (NO TIME WINDOW)
            SELECT * INTO v_recent_transfer
            FROM transfers_ledger 
            WHERE (winner_team_id = NEW.id OR loser_team_id = NEW.id)
            ORDER BY applied_at DESC
            LIMIT 1;
            
            -- Check if we found a transfer
            v_transfer_exists := (v_recent_transfer.id IS NOT NULL);
            
            IF v_transfer_exists THEN
                -- Get fixture details
                SELECT * INTO v_fixture
                FROM fixtures 
                WHERE id = v_recent_transfer.fixture_id;
                
                -- Determine match result and ledger type
                IF v_recent_transfer.winner_team_id = NEW.id THEN
                    v_ledger_type := 'match_win';
                ELSIF v_recent_transfer.loser_team_id = NEW.id THEN
                    v_ledger_type := 'match_loss';
                ELSE
                    v_ledger_type := 'match_draw';
                END IF;
                
                -- Create match entry
                PERFORM create_ledger_entry(
                    NEW.id,
                    v_ledger_type,
                    v_recent_transfer.transfer_amount,
                    v_price_impact,
                    v_shares_traded,
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
                
            ELSIF v_shares_traded != 0 THEN
                -- Share purchase/sale (no transfer found)
                IF v_shares_traded > 0 THEN
                    v_ledger_type := 'share_purchase';
                ELSE
                    v_ledger_type := 'share_sale';
                END IF;
                
                PERFORM create_ledger_entry(
                    NEW.id,
                    v_ledger_type,
                    ABS(v_shares_traded) * (OLD.market_cap / OLD.shares_outstanding),
                    v_price_impact,
                    v_shares_traded,
                    NULL,
                    'order',
                    NULL, NULL, NULL, NULL, NULL,
                    CONCAT(ABS(v_shares_traded), ' shares ', CASE WHEN v_shares_traded > 0 THEN 'purchased' ELSE 'sold' END)
                );
                
            ELSE
                -- Manual adjustment (market cap change without shares or transfer)
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
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER total_ledger_trigger
    AFTER UPDATE ON teams
    FOR EACH ROW
    WHEN (OLD.market_cap != NEW.market_cap OR OLD.shares_outstanding != NEW.shares_outstanding)
    EXECUTE FUNCTION total_ledger_trigger();

-- Test the fix by simulating a draw scenario
DO $$
DECLARE
    v_test_team_id INTEGER := 37; -- Brighton
    v_old_cap DECIMAL(15,2);
    v_new_cap DECIMAL(15,2);
    v_ledger_count INTEGER;
BEGIN
    -- Get current market cap
    SELECT market_cap INTO v_old_cap FROM teams WHERE id = v_test_team_id;
    v_new_cap := v_old_cap + 5; -- Small change for draw
    
    -- Count existing ledger entries
    SELECT COUNT(*) INTO v_ledger_count FROM total_ledger WHERE team_id = v_test_team_id;
    
    -- Update team to trigger the new trigger
    UPDATE teams 
    SET market_cap = v_new_cap
    WHERE id = v_test_team_id;
    
    RAISE NOTICE 'Updated team % market cap from % to %', v_test_team_id, v_old_cap, v_new_cap;
    RAISE NOTICE 'Ledger entries before: %, after: %', v_ledger_count, (SELECT COUNT(*) FROM total_ledger WHERE team_id = v_test_team_id);
    
    -- Show the latest ledger entry
    RAISE NOTICE 'Latest ledger entry:';
    DECLARE
        v_ledger_entry RECORD;
    BEGIN
        FOR v_ledger_entry IN 
            SELECT id, ledger_type, event_description, opponent_team_name, match_result
            FROM total_ledger 
            WHERE team_id = v_test_team_id 
            ORDER BY created_at DESC 
            LIMIT 1
        LOOP
            RAISE NOTICE '  ID: %, Type: %, Description: %, Opponent: %, Result: %', 
                v_ledger_entry.id, v_ledger_entry.ledger_type, v_ledger_entry.event_description, 
                v_ledger_entry.opponent_team_name, v_ledger_entry.match_result;
        END LOOP;
    END;
END $$;
