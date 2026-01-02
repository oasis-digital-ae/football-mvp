-- Fix Trigger Security Definer
-- Make fixture_result_trigger run as SECURITY DEFINER so it can insert into total_ledger
-- This allows the trigger to bypass RLS when inserting ledger entries

CREATE OR REPLACE FUNCTION public.fixture_result_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER -- CRITICAL: Run with service_role permissions to bypass RLS
SET search_path = public
AS $$
DECLARE
    v_transfer_percentage NUMERIC := 0.10;  -- 10% transfer
    v_transfer_amount NUMERIC;
    v_winner_team_id INTEGER;
    v_loser_team_id INTEGER;
    v_home_ledger_type TEXT;
    v_away_ledger_type TEXT;
    v_home_price_impact NUMERIC;
    v_away_price_impact NUMERIC;
    v_match_score TEXT;
    
    -- Team data
    v_home_team RECORD;
    v_away_team RECORD;
    v_home_current_cap NUMERIC;
    v_away_current_cap NUMERIC;
    v_home_shares INTEGER;
    v_away_shares INTEGER;
    v_opponent_team_id INTEGER;
    v_opponent_team_name TEXT;
    
    -- Check for existing entries
    v_home_entry_exists BOOLEAN;
    v_away_entry_exists BOOLEAN;
BEGIN
    -- Skip if result is still pending
    IF NEW.result = 'pending' THEN
        RETURN NEW;
    END IF;
    
    -- Check if entries already exist for this fixture
    SELECT EXISTS(
        SELECT 1 FROM total_ledger 
        WHERE trigger_event_id = NEW.id 
          AND team_id = NEW.home_team_id
          AND ledger_type IN ('match_win', 'match_loss', 'match_draw')
    ) INTO v_home_entry_exists;
    
    SELECT EXISTS(
        SELECT 1 FROM total_ledger 
        WHERE trigger_event_id = NEW.id 
          AND team_id = NEW.away_team_id
          AND ledger_type IN ('match_win', 'match_loss', 'match_draw')
    ) INTO v_away_entry_exists;
    
    -- If entries already exist, skip insertion (idempotent)
    IF v_home_entry_exists AND v_away_entry_exists THEN
        RETURN NEW;
    END IF;
    
    -- Get team info
    SELECT * INTO v_home_team FROM teams WHERE id = NEW.home_team_id;
    SELECT * INTO v_away_team FROM teams WHERE id = NEW.away_team_id;
    
    IF v_home_team IS NULL OR v_away_team IS NULL THEN
        RETURN NEW;
    END IF;
    
    v_home_current_cap := v_home_team.market_cap;
    v_away_current_cap := v_away_team.market_cap;
    v_home_shares := v_home_team.shares_outstanding;
    v_away_shares := v_away_team.shares_outstanding;
    
    -- Build match score string
    IF NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL THEN
        v_match_score := CONCAT(NEW.home_score, '-', NEW.away_score);
    ELSE
        v_match_score := '0-0';
    END IF;
    
    -- Determine winner/loser and transfer amounts
    CASE NEW.result
        WHEN 'home_win' THEN
            v_winner_team_id := NEW.home_team_id;
            v_loser_team_id := NEW.away_team_id;
            v_home_ledger_type := 'match_win';
            v_away_ledger_type := 'match_loss';
            v_transfer_amount := v_away_current_cap * v_transfer_percentage;
            v_home_price_impact := v_transfer_amount;
            v_away_price_impact := -v_transfer_amount;
            v_opponent_team_id := NEW.away_team_id;
            v_opponent_team_name := v_away_team.name;
        WHEN 'away_win' THEN
            v_winner_team_id := NEW.away_team_id;
            v_loser_team_id := NEW.home_team_id;
            v_home_ledger_type := 'match_loss';
            v_away_ledger_type := 'match_win';
            v_transfer_amount := v_home_current_cap * v_transfer_percentage;
            v_home_price_impact := -v_transfer_amount;
            v_away_price_impact := v_transfer_amount;
            v_opponent_team_id := NEW.home_team_id;
            v_opponent_team_name := v_home_team.name;
        WHEN 'draw' THEN
            v_home_ledger_type := 'match_draw';
            v_away_ledger_type := 'match_draw';
            v_transfer_amount := 0;
            v_home_price_impact := 0;
            v_away_price_impact := 0;
            v_opponent_team_id := NEW.away_team_id;
            v_opponent_team_name := v_away_team.name;
    END CASE;
    
    -- Insert into total_ledger for home team (only if doesn't exist)
    IF NOT v_home_entry_exists THEN
        INSERT INTO total_ledger (
            team_id, ledger_type, event_date, event_description,
            trigger_event_id, trigger_event_type,
            opponent_team_id, opponent_team_name,
            match_result, match_score, is_home_match,
            amount_transferred, price_impact,
            market_cap_before, market_cap_after,
            shares_outstanding_before, shares_outstanding_after,
            share_price_before, share_price_after,
            created_by
        ) VALUES (
            NEW.home_team_id, v_home_ledger_type,
            NEW.kickoff_at,
            CONCAT('Match vs ', v_away_team.name),
            NEW.id, 'fixture',
            NEW.away_team_id, v_away_team.name,
            CASE 
                WHEN v_home_ledger_type = 'match_win' THEN 'win'
                WHEN v_home_ledger_type = 'match_loss' THEN 'loss'
                ELSE 'draw'
            END,
            v_match_score, true,
            v_transfer_amount, v_home_price_impact,
            v_home_current_cap, v_home_current_cap + v_home_price_impact,
            v_home_shares, v_home_shares,
            CASE WHEN v_home_shares > 0 THEN v_home_current_cap / v_home_shares ELSE 0 END,
            CASE WHEN v_home_shares > 0 THEN (v_home_current_cap + v_home_price_impact) / v_home_shares ELSE 0 END,
            'system'
        ) ON CONFLICT DO NOTHING;
    END IF;
    
    -- Insert into total_ledger for away team (only if doesn't exist)
    IF NOT v_away_entry_exists THEN
        INSERT INTO total_ledger (
            team_id, ledger_type, event_date, event_description,
            trigger_event_id, trigger_event_type,
            opponent_team_id, opponent_team_name,
            match_result, match_score, is_home_match,
            amount_transferred, price_impact,
            market_cap_before, market_cap_after,
            shares_outstanding_before, shares_outstanding_after,
            share_price_before, share_price_after,
            created_by
        ) VALUES (
            NEW.away_team_id, v_away_ledger_type,
            NEW.kickoff_at,
            CONCAT('Match vs ', v_home_team.name),
            NEW.id, 'fixture',
            NEW.home_team_id, v_home_team.name,
            CASE 
                WHEN v_away_ledger_type = 'match_win' THEN 'win'
                WHEN v_away_ledger_type = 'match_loss' THEN 'loss'
                ELSE 'draw'
            END,
            v_match_score, false,
            v_transfer_amount, v_away_price_impact,
            v_away_current_cap, v_away_current_cap + v_away_price_impact,
            v_away_shares, v_away_shares,
            CASE WHEN v_away_shares > 0 THEN v_away_current_cap / v_away_shares ELSE 0 END,
            CASE WHEN v_away_shares > 0 THEN (v_away_current_cap + v_away_price_impact) / v_away_shares ELSE 0 END,
            'system'
        ) ON CONFLICT DO NOTHING;
    END IF;
    
    -- Update team market caps (only if we inserted new entries)
    IF NOT v_home_entry_exists THEN
        UPDATE teams SET market_cap = v_home_current_cap + v_home_price_impact, updated_at = NOW() WHERE id = NEW.home_team_id;
    END IF;
    IF NOT v_away_entry_exists THEN
        UPDATE teams SET market_cap = v_away_current_cap + v_away_price_impact, updated_at = NOW() WHERE id = NEW.away_team_id;
    END IF;
    
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fixture_result_trigger() IS 
  'Trigger function that processes match results and updates market caps. Runs as SECURITY DEFINER to bypass RLS when inserting into total_ledger.';


