-- Create a fixture-based trigger to handle all match results
-- This trigger fires when fixture result changes from 'pending' to any result

-- Drop existing triggers
DROP TRIGGER IF EXISTS total_ledger_trigger ON teams;
DROP TRIGGER IF EXISTS fixture_result_trigger ON fixtures;

-- Create fixture-based trigger function
CREATE OR REPLACE FUNCTION fixture_result_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_home_team RECORD;
    v_away_team RECORD;
    v_home_ledger_type TEXT;
    v_away_ledger_type TEXT;
    v_home_price_impact DECIMAL(15,2) := 0;
    v_away_price_impact DECIMAL(15,2) := 0;
    v_transfer_amount DECIMAL(15,2) := 10.00; -- Default transfer amount
BEGIN
    -- Only proceed if result changed from 'pending' to something else
    IF OLD.result = 'pending' AND NEW.result != 'pending' THEN
        
        -- Get team details
        SELECT * INTO v_home_team FROM teams WHERE id = NEW.home_team_id;
        SELECT * INTO v_away_team FROM teams WHERE id = NEW.away_team_id;
        
        -- Determine ledger types and price impacts based on result
        CASE NEW.result
            WHEN 'home_win' THEN
                v_home_ledger_type := 'match_win';
                v_away_ledger_type := 'match_loss';
                v_home_price_impact := v_transfer_amount;
                v_away_price_impact := -v_transfer_amount;
            WHEN 'away_win' THEN
                v_home_ledger_type := 'match_loss';
                v_away_ledger_type := 'match_win';
                v_home_price_impact := -v_transfer_amount;
                v_away_price_impact := v_transfer_amount;
            WHEN 'draw' THEN
                v_home_ledger_type := 'match_draw';
                v_away_ledger_type := 'match_draw';
                v_home_price_impact := 0;
                v_away_price_impact := 0;
        END CASE;
        
        -- Create ledger entry for home team
        PERFORM create_ledger_entry(
            NEW.home_team_id,
            v_home_ledger_type,
            CASE WHEN NEW.result = 'draw' THEN 0 ELSE v_transfer_amount END,
            v_home_price_impact,
            0, -- No shares traded
            NEW.id, -- Use fixture ID as trigger event
            'fixture',
            NEW.away_team_id,
            v_away_team.name,
            CASE 
                WHEN v_home_ledger_type = 'match_win' THEN 'win'
                WHEN v_home_ledger_type = 'match_loss' THEN 'loss'
                ELSE 'draw'
            END,
            CASE 
                WHEN NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL 
                THEN CONCAT(NEW.home_score, '-', NEW.away_score)
                ELSE NULL
            END,
            true, -- Home match
            CONCAT('Match vs ', v_away_team.name)
        );
        
        -- Create ledger entry for away team
        PERFORM create_ledger_entry(
            NEW.away_team_id,
            v_away_ledger_type,
            CASE WHEN NEW.result = 'draw' THEN 0 ELSE v_transfer_amount END,
            v_away_price_impact,
            0, -- No shares traded
            NEW.id, -- Use fixture ID as trigger event
            'fixture',
            NEW.home_team_id,
            v_home_team.name,
            CASE 
                WHEN v_away_ledger_type = 'match_win' THEN 'win'
                WHEN v_away_ledger_type = 'match_loss' THEN 'loss'
                ELSE 'draw'
            END,
            CASE 
                WHEN NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL 
                THEN CONCAT(NEW.home_score, '-', NEW.away_score)
                ELSE NULL
            END,
            false, -- Away match
            CONCAT('Match @ ', v_home_team.name)
        );
        
        -- Update team market caps
        UPDATE teams 
        SET market_cap = market_cap + v_home_price_impact
        WHERE id = NEW.home_team_id;
        
        UPDATE teams 
        SET market_cap = market_cap + v_away_price_impact
        WHERE id = NEW.away_team_id;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the fixture trigger
CREATE TRIGGER fixture_result_trigger
    AFTER UPDATE ON fixtures
    FOR EACH ROW
    WHEN (OLD.result = 'pending' AND NEW.result != 'pending')
    EXECUTE FUNCTION fixture_result_trigger();

-- Test the trigger by updating a pending fixture to draw
DO $$
DECLARE
    v_test_fixture_id INTEGER;
    v_ledger_count_before INTEGER;
    v_ledger_count_after INTEGER;
BEGIN
    -- Find a pending fixture
    SELECT id INTO v_test_fixture_id
    FROM fixtures 
    WHERE result = 'pending' 
    AND status = 'applied'
    LIMIT 1;
    
    IF v_test_fixture_id IS NOT NULL THEN
        -- Count existing ledger entries
        SELECT COUNT(*) INTO v_ledger_count_before FROM total_ledger;
        
        -- Update fixture to draw to test the trigger
        UPDATE fixtures 
        SET result = 'draw', home_score = 1, away_score = 1
        WHERE id = v_test_fixture_id;
        
        -- Count new ledger entries
        SELECT COUNT(*) INTO v_ledger_count_after FROM total_ledger;
        
        RAISE NOTICE 'Test fixture % updated to draw', v_test_fixture_id;
        RAISE NOTICE 'Ledger entries before: %, after: %', v_ledger_count_before, v_ledger_count_after;
        RAISE NOTICE 'New entries created: %', (v_ledger_count_after - v_ledger_count_before);
    ELSE
        RAISE NOTICE 'No pending fixtures found for testing';
    END IF;
END $$;

