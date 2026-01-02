-- Prevent duplicate match entries in total_ledger
-- Add a unique constraint on (team_id, trigger_event_id, ledger_type) for match-related entries

-- First, ensure there are no existing duplicates (should be cleaned by previous migration)
-- Create a unique partial index for match-related ledger types
CREATE UNIQUE INDEX IF NOT EXISTS idx_total_ledger_unique_match_entry
ON total_ledger (team_id, trigger_event_id, ledger_type)
WHERE ledger_type IN ('match_win', 'match_loss', 'match_draw')
  AND trigger_event_id IS NOT NULL;

-- Also update the fixture_result_trigger function (the one actually called by the trigger) 
-- to check for existing entries before inserting
CREATE OR REPLACE FUNCTION fixture_result_trigger()
RETURNS TRIGGER AS $$
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
        ) ON CONFLICT DO NOTHING; -- Additional safety with unique index
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
        ) ON CONFLICT DO NOTHING; -- Additional safety with unique index
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
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fixture_result_trigger IS 'Prevents duplicate match entries by checking for existing entries before inserting. Idempotent trigger function.';

-- Also update process_match_result_atomic function to prevent duplicates
-- This function is called by the INSERT trigger
CREATE OR REPLACE FUNCTION process_match_result_atomic(p_fixture_id INTEGER)
RETURNS JSON AS $$
DECLARE
  v_fixture RECORD;
  v_transfer_amount NUMERIC;
  v_winner_team_id INTEGER;
  v_loser_team_id INTEGER;
  v_home_snapshot_cap NUMERIC;
  v_away_snapshot_cap NUMERIC;
  v_winner_before_cap NUMERIC;
  v_winner_after_cap NUMERIC;
  v_loser_before_cap NUMERIC;
  v_loser_after_cap NUMERIC;
  v_total_shares INTEGER;
  v_winner_price_before NUMERIC;
  v_winner_price_after NUMERIC;
  v_loser_price_before NUMERIC;
  v_loser_price_after NUMERIC;
  v_opponent_team_id INTEGER;
  v_opponent_team_name TEXT;
  v_is_home_winner BOOLEAN;
  v_match_score TEXT;
  v_home_entry_exists BOOLEAN;
  v_away_entry_exists BOOLEAN;
BEGIN
  
  -- Get fixture with snapshot market cap data
  SELECT f.*, f.snapshot_home_cap, f.snapshot_away_cap
  INTO v_fixture
  FROM fixtures f
  WHERE f.id = p_fixture_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fixture not found: %', p_fixture_id;
  END IF;
  
  IF v_fixture.result = 'pending' THEN
    RAISE EXCEPTION 'Cannot process pending fixture';
  END IF;

  -- Use snapshot values if available, otherwise use current market caps
  IF v_fixture.snapshot_home_cap IS NOT NULL AND v_fixture.snapshot_away_cap IS NOT NULL THEN
    v_home_snapshot_cap := v_fixture.snapshot_home_cap;
    v_away_snapshot_cap := v_fixture.snapshot_away_cap;
  ELSE
    SELECT market_cap INTO v_home_snapshot_cap FROM teams WHERE id = v_fixture.home_team_id;
    SELECT market_cap INTO v_away_snapshot_cap FROM teams WHERE id = v_fixture.away_team_id;
  END IF;

  -- Calculate transfer amount and identify winner/loser
  IF v_fixture.result = 'home_win' THEN
    v_winner_team_id := v_fixture.home_team_id;
    v_loser_team_id := v_fixture.away_team_id;
    v_transfer_amount := v_away_snapshot_cap * 0.10;
    v_is_home_winner := TRUE;
    v_opponent_team_id := v_fixture.away_team_id;
    v_match_score := COALESCE(v_fixture.home_score, 0) || '-' || COALESCE(v_fixture.away_score, 0);
  ELSIF v_fixture.result = 'away_win' THEN
    v_winner_team_id := v_fixture.away_team_id;
    v_loser_team_id := v_fixture.home_team_id;
    v_transfer_amount := v_home_snapshot_cap * 0.10;
    v_is_home_winner := FALSE;
    v_opponent_team_id := v_fixture.home_team_id;
    v_match_score := COALESCE(v_fixture.home_score, 0) || '-' || COALESCE(v_fixture.away_score, 0);
  ELSE
    -- Draw - no transfer, but still log to total_ledger for both teams
    v_match_score := COALESCE(v_fixture.home_score, 0) || '-' || COALESCE(v_fixture.away_score, 0);
    
    -- Check if entries already exist for draw
    SELECT EXISTS(
        SELECT 1 FROM total_ledger 
        WHERE trigger_event_id = p_fixture_id 
          AND team_id = v_fixture.home_team_id
          AND ledger_type = 'match_draw'
    ) INTO v_home_entry_exists;
    
    SELECT EXISTS(
        SELECT 1 FROM total_ledger 
        WHERE trigger_event_id = p_fixture_id 
          AND team_id = v_fixture.away_team_id
          AND ledger_type = 'match_draw'
    ) INTO v_away_entry_exists;
    
    -- If entries already exist, return success without processing (idempotent)
    IF v_home_entry_exists AND v_away_entry_exists THEN
      RETURN json_build_object('success', true, 'transfer_amount', 0, 'message', 'Draw - already processed');
    END IF;
    
    -- Get total_shares for price calculation (should be 1000)
    SELECT total_shares INTO v_total_shares FROM teams WHERE id = v_fixture.home_team_id;
    v_total_shares := COALESCE(v_total_shares, 1000);
    
    -- Log draw for home team (only if doesn't exist)
    IF NOT v_home_entry_exists THEN
      SELECT market_cap,
             CASE WHEN v_total_shares > 0 THEN market_cap / v_total_shares ELSE 20.00 END
      INTO v_home_snapshot_cap, v_winner_price_before
      FROM teams WHERE id = v_fixture.home_team_id;
      
      INSERT INTO total_ledger (
        team_id, ledger_type, opponent_team_id, is_home_match,
        market_cap_before, market_cap_after, shares_outstanding_before, shares_outstanding_after,
        share_price_before, share_price_after, price_impact, match_result, match_score,
        trigger_event_type, trigger_event_id, event_description, created_by
      ) VALUES (
        v_fixture.home_team_id, 'match_draw', v_fixture.away_team_id, TRUE,
        v_home_snapshot_cap, v_home_snapshot_cap,
        v_total_shares, v_total_shares,
        v_winner_price_before, v_winner_price_before, 0,
        'draw', v_match_score,
        'fixture', p_fixture_id, 'Draw: No market cap transfer', 'system'
      ) ON CONFLICT DO NOTHING;
    END IF;
    
    -- Log draw for away team (only if doesn't exist)
    IF NOT v_away_entry_exists THEN
      SELECT market_cap,
             CASE WHEN v_total_shares > 0 THEN market_cap / v_total_shares ELSE 20.00 END
      INTO v_away_snapshot_cap, v_winner_price_before
      FROM teams WHERE id = v_fixture.away_team_id;
      
      INSERT INTO total_ledger (
        team_id, ledger_type, opponent_team_id, is_home_match,
        market_cap_before, market_cap_after, shares_outstanding_before, shares_outstanding_after,
        share_price_before, share_price_after, price_impact, match_result, match_score,
        trigger_event_type, trigger_event_id, event_description, created_by
      ) VALUES (
        v_fixture.away_team_id, 'match_draw', v_fixture.home_team_id, FALSE,
        v_away_snapshot_cap, v_away_snapshot_cap,
        v_total_shares, v_total_shares,
        v_winner_price_before, v_winner_price_before, 0,
        'draw', v_match_score,
        'fixture', p_fixture_id, 'Draw: No market cap transfer', 'system'
      ) ON CONFLICT DO NOTHING;
    END IF;
    
    RETURN json_build_object('success', true, 'transfer_amount', 0, 'message', 'Draw - no market cap transfer');
  END IF;
  
  -- Get opponent team name
  SELECT name INTO v_opponent_team_name FROM teams WHERE id = v_opponent_team_id;
  
  -- Get total_shares (should be 1000 for all teams)
  SELECT total_shares INTO v_total_shares FROM teams WHERE id = v_winner_team_id;
  v_total_shares := COALESCE(v_total_shares, 1000);
  
  -- Get current state of both teams (use total_shares for price calculation)
  SELECT market_cap,
         CASE WHEN v_total_shares > 0 THEN market_cap / v_total_shares ELSE 20.00 END
  INTO v_winner_before_cap, v_winner_price_before
  FROM teams WHERE id = v_winner_team_id FOR UPDATE;
  
  SELECT market_cap,
         CASE WHEN v_total_shares > 0 THEN market_cap / v_total_shares ELSE 20.00 END
  INTO v_loser_before_cap, v_loser_price_before
  FROM teams WHERE id = v_loser_team_id FOR UPDATE;
  
  -- Check if entries already exist for win/loss
  SELECT EXISTS(
      SELECT 1 FROM total_ledger 
      WHERE trigger_event_id = p_fixture_id 
        AND team_id = v_winner_team_id
        AND ledger_type IN ('match_win', 'match_loss', 'match_draw')
  ) INTO v_home_entry_exists;
  
  SELECT EXISTS(
      SELECT 1 FROM total_ledger 
      WHERE trigger_event_id = p_fixture_id 
        AND team_id = v_loser_team_id
        AND ledger_type IN ('match_win', 'match_loss', 'match_draw')
  ) INTO v_away_entry_exists;
  
  -- If entries already exist, return success without processing (idempotent)
  IF v_home_entry_exists AND v_away_entry_exists THEN
    RETURN json_build_object('success', true, 'transfer_amount', v_transfer_amount, 'message', 'Match result already processed');
  END IF;
  
  -- Calculate after values
  v_winner_after_cap := v_winner_before_cap + v_transfer_amount;
  v_loser_after_cap := v_loser_before_cap - v_transfer_amount;
  
  -- Calculate new prices using total_shares (fixed denominator)
  v_winner_price_after := CASE WHEN v_total_shares > 0 THEN v_winner_after_cap / v_total_shares ELSE 20.00 END;
  v_loser_price_after := CASE WHEN v_total_shares > 0 THEN GREATEST(v_loser_after_cap, 10) / v_total_shares ELSE 20.00 END;
  
  -- Update teams atomically (only if entries don't exist)
  IF NOT v_home_entry_exists AND NOT v_away_entry_exists THEN
    UPDATE teams SET
      market_cap = v_winner_after_cap,
      updated_at = NOW()
    WHERE id = v_winner_team_id;
    
    UPDATE teams SET
      market_cap = GREATEST(v_loser_after_cap, 10),
      updated_at = NOW()
    WHERE id = v_loser_team_id;
  END IF;
  
  -- Record transfer in transfers_ledger (only if entries don't exist)
  IF NOT v_home_entry_exists AND NOT v_away_entry_exists THEN
    INSERT INTO transfers_ledger (
      fixture_id, winner_team_id, loser_team_id, transfer_amount
    ) VALUES (
      p_fixture_id, v_winner_team_id, v_loser_team_id, v_transfer_amount
    );
  END IF;
  
  -- Log WINNER to total_ledger (only if doesn't exist)
  IF NOT EXISTS(
    SELECT 1 FROM total_ledger 
    WHERE trigger_event_id = p_fixture_id 
      AND team_id = v_winner_team_id
      AND ledger_type IN ('match_win', 'match_loss', 'match_draw')
  ) THEN
    INSERT INTO total_ledger (
      team_id, ledger_type, amount_transferred, opponent_team_id, opponent_team_name, is_home_match,
      market_cap_before, market_cap_after, shares_outstanding_before, shares_outstanding_after,
      share_price_before, share_price_after, price_impact, match_result, match_score,
      trigger_event_type, trigger_event_id, event_description, created_by
    ) VALUES (
      v_winner_team_id, 'match_win', v_transfer_amount, v_opponent_team_id, v_opponent_team_name, v_is_home_winner,
      v_winner_before_cap, v_winner_after_cap, v_total_shares, v_total_shares,
      v_winner_price_before, v_winner_price_after, v_winner_price_after - v_winner_price_before, 'win', v_match_score,
      'fixture', p_fixture_id, 'Match win: Gained ' || v_transfer_amount::text || ' from ' || v_opponent_team_name, 'system'
    ) ON CONFLICT DO NOTHING;
  END IF;
  
  -- Log LOSER to total_ledger (only if doesn't exist)
  IF NOT EXISTS(
    SELECT 1 FROM total_ledger 
    WHERE trigger_event_id = p_fixture_id 
      AND team_id = v_loser_team_id
      AND ledger_type IN ('match_win', 'match_loss', 'match_draw')
  ) THEN
    INSERT INTO total_ledger (
      team_id, ledger_type, amount_transferred, opponent_team_id, opponent_team_name, is_home_match,
      market_cap_before, market_cap_after, shares_outstanding_before, shares_outstanding_after,
      share_price_before, share_price_after, price_impact, match_result, match_score,
      trigger_event_type, trigger_event_id, event_description, created_by
    ) VALUES (
      v_loser_team_id, 'match_loss', v_transfer_amount, 
      CASE WHEN v_is_home_winner THEN v_fixture.away_team_id ELSE v_fixture.home_team_id END,
      (SELECT name FROM teams WHERE id = CASE WHEN v_is_home_winner THEN v_fixture.away_team_id ELSE v_fixture.home_team_id END),
      NOT v_is_home_winner,
      v_loser_before_cap, GREATEST(v_loser_after_cap, 10), v_total_shares, v_total_shares,
      v_loser_price_before, v_loser_price_after, v_loser_price_after - v_loser_price_before, 'loss', v_match_score,
      'fixture', p_fixture_id, 'Match loss: Lost ' || v_transfer_amount::text || ' to opponent', 'system'
    ) ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'transfer_amount', v_transfer_amount,
    'winner_team_id', v_winner_team_id,
    'loser_team_id', v_loser_team_id
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Match result processing failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION process_match_result_atomic IS 'Fixed shares model: Price = market_cap / total_shares (1000). Prevents duplicate entries.';







