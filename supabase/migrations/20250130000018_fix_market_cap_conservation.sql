-- Fix Market Cap Conservation Issue
-- Ensure total market cap always equals exactly $100,000 (20 teams × $5,000 initial)
-- This fixes floating point precision errors and ensures no money is created/destroyed

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
  v_winner_current_cap NUMERIC;
  v_loser_current_cap NUMERIC;
  v_total_market_cap NUMERIC;
  v_target_total NUMERIC := 100000.00; -- Target total: 20 teams × $5,000
  v_normalization_factor NUMERIC;
  v_actual_transfer NUMERIC;
  v_winner_new_cap NUMERIC;
  v_loser_new_cap NUMERIC;
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
    -- Round transfer amount to 2 decimal places to avoid precision issues
    v_transfer_amount := ROUND(v_away_snapshot_cap * 0.10, 2);
    v_is_home_winner := TRUE;
    v_opponent_team_id := v_fixture.away_team_id;
    v_match_score := COALESCE(v_fixture.home_score, 0) || '-' || COALESCE(v_fixture.away_score, 0);
    v_winner_before_cap := v_home_snapshot_cap;
    v_loser_before_cap := v_away_snapshot_cap;
  ELSIF v_fixture.result = 'away_win' THEN
    v_winner_team_id := v_fixture.away_team_id;
    v_loser_team_id := v_fixture.home_team_id;
    -- Round transfer amount to 2 decimal places to avoid precision issues
    v_transfer_amount := ROUND(v_home_snapshot_cap * 0.10, 2);
    v_is_home_winner := FALSE;
    v_opponent_team_id := v_fixture.home_team_id;
    v_match_score := COALESCE(v_fixture.home_score, 0) || '-' || COALESCE(v_fixture.away_score, 0);
    v_winner_before_cap := v_away_snapshot_cap;
    v_loser_before_cap := v_home_snapshot_cap;
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
      v_winner_price_before := CASE WHEN v_total_shares > 0 THEN ROUND(v_home_snapshot_cap / v_total_shares, 2) ELSE 20.00 END;
      
      INSERT INTO total_ledger (
        team_id, ledger_type, event_date, opponent_team_id, is_home_match,
        market_cap_before, market_cap_after, shares_outstanding_before, shares_outstanding_after,
        share_price_before, share_price_after, price_impact, match_result, match_score,
        trigger_event_type, trigger_event_id, event_description, created_by
      ) VALUES (
        v_fixture.home_team_id, 'match_draw', v_fixture.kickoff_at, v_fixture.away_team_id, TRUE,
        ROUND(v_home_snapshot_cap, 2), ROUND(v_home_snapshot_cap, 2),
        v_total_shares, v_total_shares,
        v_winner_price_before, v_winner_price_before, 0,
        'draw', v_match_score,
        'fixture', p_fixture_id, 'Draw: No market cap transfer', 'system'
      ) ON CONFLICT DO NOTHING;
    END IF;
    
    -- Log draw for away team (only if doesn't exist)
    IF NOT v_away_entry_exists THEN
      v_winner_price_before := CASE WHEN v_total_shares > 0 THEN ROUND(v_away_snapshot_cap / v_total_shares, 2) ELSE 20.00 END;
      
      INSERT INTO total_ledger (
        team_id, ledger_type, event_date, opponent_team_id, is_home_match,
        market_cap_before, market_cap_after, shares_outstanding_before, shares_outstanding_after,
        share_price_before, share_price_after, price_impact, match_result, match_score,
        trigger_event_type, trigger_event_id, event_description, created_by
      ) VALUES (
        v_fixture.away_team_id, 'match_draw', v_fixture.kickoff_at, v_fixture.home_team_id, FALSE,
        ROUND(v_away_snapshot_cap, 2), ROUND(v_away_snapshot_cap, 2),
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
  
  -- Calculate prices and after values using snapshot values (for accurate display)
  v_winner_price_before := CASE WHEN v_total_shares > 0 THEN ROUND(v_winner_before_cap / v_total_shares, 2) ELSE 20.00 END;
  v_loser_price_before := CASE WHEN v_total_shares > 0 THEN ROUND(v_loser_before_cap / v_total_shares, 2) ELSE 20.00 END;

  -- Calculate after values based on snapshot + transfer (rounded)
  -- Use the same transfer amount that will be used for actual updates
  -- This ensures displayed values match actual values
  v_winner_after_cap := ROUND(v_winner_before_cap + v_transfer_amount, 2);
  v_loser_after_cap := ROUND(v_loser_before_cap - v_transfer_amount, 2);

  -- Ensure loser doesn't go below minimum ($10) - adjust transfer amount if needed
  IF v_loser_after_cap < 10 THEN
    -- Recalculate transfer amount to only take what's available above $10 minimum
    v_transfer_amount := ROUND(v_loser_before_cap - 10.00, 2);
    v_loser_after_cap := 10.00;
    -- Recalculate winner's gain with adjusted transfer amount
    v_winner_after_cap := ROUND(v_winner_before_cap + v_transfer_amount, 2);
  END IF;

  -- Calculate new prices using total_shares (fixed denominator)
  v_winner_price_after := CASE WHEN v_total_shares > 0 THEN ROUND(v_winner_after_cap / v_total_shares, 2) ELSE 20.00 END;
  v_loser_price_after := CASE WHEN v_total_shares > 0 THEN ROUND(v_loser_after_cap / v_total_shares, 2) ELSE 20.00 END;

  -- Get CURRENT market caps for updating teams table (to maintain consistency)
  SELECT market_cap INTO v_winner_current_cap FROM teams WHERE id = v_winner_team_id FOR UPDATE;
  SELECT market_cap INTO v_loser_current_cap FROM teams WHERE id = v_loser_team_id FOR UPDATE;

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
  
  -- Calculate the actual transfer amount based on current caps (to maintain consistency)
  -- This ensures we're working with the actual current state, not snapshots
  -- Use the SAME transfer amount for both winner and loser to ensure they match exactly
  IF v_fixture.result = 'home_win' THEN
    v_actual_transfer := ROUND(v_loser_current_cap * 0.10, 2);
  ELSE
    v_actual_transfer := ROUND(v_winner_current_cap * 0.10, 2);
  END IF;

  -- Ensure loser doesn't go below minimum ($10) BEFORE calculating final caps
  -- This ensures the transfer amount is adjusted if needed, and both teams use the same adjusted amount
  IF (v_loser_current_cap - v_actual_transfer) < 10 THEN
    -- Adjust transfer to only take what's available above $10 minimum
    v_actual_transfer := ROUND(v_loser_current_cap - 10.00, 2);
    -- Update v_transfer_amount to match for logging consistency (so displayed amounts match actual amounts)
    v_transfer_amount := v_actual_transfer;
    -- Also update the snapshot-based after_cap values to match
    v_loser_after_cap := 10.00;
    v_winner_after_cap := ROUND(v_winner_before_cap + v_transfer_amount, 2);
  END IF;

  -- Calculate final caps using the same transfer amount for both teams
  v_winner_new_cap := ROUND(v_winner_current_cap + v_actual_transfer, 2);
  v_loser_new_cap := ROUND(v_loser_current_cap - v_actual_transfer, 2);
  
  -- Ensure loser is exactly at minimum if it was adjusted
  IF v_loser_new_cap < 10 THEN
    v_loser_new_cap := 10.00;
  END IF;

  -- Update teams atomically (only if entries don't exist)
  IF NOT v_home_entry_exists AND NOT v_away_entry_exists THEN
    UPDATE teams SET
      market_cap = v_winner_new_cap,
      updated_at = NOW()
    WHERE id = v_winner_team_id;
    
    UPDATE teams SET
      market_cap = v_loser_new_cap,
      updated_at = NOW()
    WHERE id = v_loser_team_id;
    
    -- Normalize total market cap to exactly $100,000
    SELECT SUM(market_cap) INTO v_total_market_cap FROM teams;
    
    IF ABS(v_total_market_cap - v_target_total) > 0.01 THEN
      -- Calculate normalization factor
      v_normalization_factor := v_target_total / v_total_market_cap;
      
      -- Apply normalization to all teams proportionally
      UPDATE teams SET
        market_cap = ROUND(market_cap * v_normalization_factor, 2),
        updated_at = NOW();
    END IF;
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
  -- Use snapshot-based values for accurate historical display
  IF NOT EXISTS(
    SELECT 1 FROM total_ledger 
    WHERE trigger_event_id = p_fixture_id 
      AND team_id = v_winner_team_id
      AND ledger_type IN ('match_win', 'match_loss', 'match_draw')
  ) THEN
    INSERT INTO total_ledger (
      team_id, ledger_type, event_date, amount_transferred, opponent_team_id, opponent_team_name, is_home_match,
      market_cap_before, market_cap_after, shares_outstanding_before, shares_outstanding_after,
      share_price_before, share_price_after, price_impact, match_result, match_score,
      trigger_event_type, trigger_event_id, event_description, created_by
    ) VALUES (
      v_winner_team_id, 'match_win', v_fixture.kickoff_at, v_transfer_amount, v_opponent_team_id, v_opponent_team_name, v_is_home_winner,
      ROUND(v_winner_before_cap, 2), ROUND(v_winner_after_cap, 2), v_total_shares, v_total_shares,
      v_winner_price_before, v_winner_price_after, ROUND(v_winner_price_after - v_winner_price_before, 2), 'win', v_match_score,
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
      team_id, ledger_type, event_date, amount_transferred, opponent_team_id, opponent_team_name, is_home_match,
      market_cap_before, market_cap_after, shares_outstanding_before, shares_outstanding_after,
      share_price_before, share_price_after, price_impact, match_result, match_score,
      trigger_event_type, trigger_event_id, event_description, created_by
    ) VALUES (
      v_loser_team_id, 'match_loss', v_fixture.kickoff_at, v_transfer_amount, 
      v_winner_team_id,
      (SELECT name FROM teams WHERE id = v_winner_team_id),
      NOT v_is_home_winner,
      ROUND(v_loser_before_cap, 2), ROUND(v_loser_after_cap, 2), v_total_shares, v_total_shares,
      v_loser_price_before, v_loser_price_after, ROUND(v_loser_price_after - v_loser_price_before, 2), 'loss', v_match_score,
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

COMMENT ON FUNCTION process_match_result_atomic IS 'Fixed shares model: Price = market_cap / total_shares (1000). Ensures total market cap always equals exactly $100,000 through normalization. Uses ROUND() to prevent floating point precision errors.';

-- Also create a function to normalize existing market caps
CREATE OR REPLACE FUNCTION normalize_market_caps()
RETURNS void AS $$
DECLARE
  v_total_market_cap NUMERIC;
  v_target_total NUMERIC := 100000.00;
  v_normalization_factor NUMERIC;
BEGIN
  SELECT SUM(market_cap) INTO v_total_market_cap FROM teams;
  
  IF v_total_market_cap != v_target_total AND v_total_market_cap > 0 THEN
    v_normalization_factor := v_target_total / v_total_market_cap;
    
    UPDATE teams SET
      market_cap = ROUND(market_cap * v_normalization_factor, 2),
      updated_at = NOW();
    
    RAISE NOTICE 'Normalized market caps: Total was %, normalized to %', v_total_market_cap, v_target_total;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION normalize_market_caps IS 'Normalizes all team market caps so total equals exactly $100,000. Use this to fix any accumulated floating point errors.';

