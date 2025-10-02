-- Fix transfer amount consistency across all systems
-- Update fixture trigger to use 10% of losing team's market cap instead of fixed $10

-- Drop the existing trigger
DROP TRIGGER IF EXISTS fixture_result_trigger ON fixtures;

-- Create the updated fixture trigger function with consistent transfer calculation
CREATE OR REPLACE FUNCTION fixture_result_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_home_team RECORD;
    v_away_team RECORD;
    v_home_ledger_type TEXT;
    v_away_ledger_type TEXT;
    v_home_price_impact DECIMAL(15,2) := 0;
    v_away_price_impact DECIMAL(15,2) := 0;
    v_transfer_percentage DECIMAL(5,4) := 0.10; -- 10% transfer rate
    v_transfer_amount DECIMAL(15,2) := 0;
    v_home_current_cap DECIMAL(15,2);
    v_away_current_cap DECIMAL(15,2);
    v_home_shares INTEGER;
    v_away_shares INTEGER;
BEGIN
    -- Only proceed if result changed from 'pending' to something else
    IF OLD.result = 'pending' AND NEW.result != 'pending' THEN
        
        -- Get current team states (market cap and shares)
        SELECT market_cap, shares_outstanding INTO v_home_current_cap, v_home_shares 
        FROM teams WHERE id = NEW.home_team_id;
        
        SELECT market_cap, shares_outstanding INTO v_away_current_cap, v_away_shares 
        FROM teams WHERE id = NEW.away_team_id;
        
        -- Get team details for names
        SELECT * INTO v_home_team FROM teams WHERE id = NEW.home_team_id;
        SELECT * INTO v_away_team FROM teams WHERE id = NEW.away_team_id;
        
        -- Calculate transfer amount based on losing team's market cap
        CASE NEW.result
            WHEN 'home_win' THEN
                v_home_ledger_type := 'match_win';
                v_away_ledger_type := 'match_loss';
                v_transfer_amount := v_away_current_cap * v_transfer_percentage; -- 10% of away team (loser)
                v_home_price_impact := v_transfer_amount;
                v_away_price_impact := -v_transfer_amount;
            WHEN 'away_win' THEN
                v_home_ledger_type := 'match_loss';
                v_away_ledger_type := 'match_win';
                v_transfer_amount := v_home_current_cap * v_transfer_percentage; -- 10% of home team (loser)
                v_home_price_impact := -v_transfer_amount;
                v_away_price_impact := v_transfer_amount;
            WHEN 'draw' THEN
                v_home_ledger_type := 'match_draw';
                v_away_ledger_type := 'match_draw';
                v_transfer_amount := 0;
                v_home_price_impact := 0;
                v_away_price_impact := 0;
        END CASE;
        
        -- Create ledger entry for home team with correct market cap values
        INSERT INTO total_ledger (
            team_id,
            ledger_type,
            event_date,
            event_description,
            trigger_event_id,
            trigger_event_type,
            opponent_team_id,
            opponent_team_name,
            match_result,
            match_score,
            is_home_match,
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
            created_by
        ) VALUES (
            NEW.home_team_id,
            v_home_ledger_type,
            NEW.updated_at,
            CONCAT('Match vs ', v_away_team.name),
            NEW.id,
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
            true,
            v_transfer_amount,
            v_home_price_impact,
            v_home_current_cap,  -- Correct market cap before
            v_home_current_cap + v_home_price_impact,  -- Correct market cap after
            v_home_shares,
            v_home_shares,
            0,
            CASE WHEN v_home_shares > 0 THEN v_home_current_cap / v_home_shares ELSE 0 END,
            CASE WHEN v_home_shares > 0 THEN (v_home_current_cap + v_home_price_impact) / v_home_shares ELSE 0 END,
            NOW(),
            'system'
        );
        
        -- Create ledger entry for away team with correct market cap values
        INSERT INTO total_ledger (
            team_id,
            ledger_type,
            event_date,
            event_description,
            trigger_event_id,
            trigger_event_type,
            opponent_team_id,
            opponent_team_name,
            match_result,
            match_score,
            is_home_match,
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
            created_by
        ) VALUES (
            NEW.away_team_id,
            v_away_ledger_type,
            NEW.updated_at,
            CONCAT('Match @ ', v_home_team.name),
            NEW.id,
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
            false,
            v_transfer_amount,
            v_away_price_impact,
            v_away_current_cap,  -- Correct market cap before
            v_away_current_cap + v_away_price_impact,  -- Correct market cap after
            v_away_shares,
            v_away_shares,
            0,
            CASE WHEN v_away_shares > 0 THEN v_away_current_cap / v_away_shares ELSE 0 END,
            CASE WHEN v_away_shares > 0 THEN (v_away_current_cap + v_away_price_impact) / v_away_shares ELSE 0 END,
            NOW(),
            'system'
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

-- Recreate the trigger
CREATE TRIGGER fixture_result_trigger
    AFTER UPDATE ON fixtures
    FOR EACH ROW
    WHEN (OLD.result = 'pending' AND NEW.result != 'pending')
    EXECUTE FUNCTION fixture_result_trigger();

-- Test the fix by checking transfer calculation
DO $$
DECLARE
    v_test_team_cap DECIMAL(15,2) := 100.00;
    v_transfer_percentage DECIMAL(5,4) := 0.10;
    v_calculated_transfer DECIMAL(15,2);
BEGIN
    v_calculated_transfer := v_test_team_cap * v_transfer_percentage;
    
    RAISE NOTICE 'Transfer calculation test:';
    RAISE NOTICE '  Team market cap: $%', v_test_team_cap;
    RAISE NOTICE '  Transfer percentage: %', v_transfer_percentage;
    RAISE NOTICE '  Calculated transfer: $%', v_calculated_transfer;
    RAISE NOTICE '  Expected market cap change: $%', v_calculated_transfer;
END $$;

