CREATE OR REPLACE FUNCTION public.process_match_result_atomic(p_fixture_id integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fixture RECORD;
  v_transfer_amount_cents BIGINT;
  v_winner_team_id INTEGER;
  v_loser_team_id INTEGER;
  v_home_snapshot_cap_cents BIGINT;
  v_away_snapshot_cap_cents BIGINT;
  v_winner_before_cap_cents BIGINT;
  v_winner_after_cap_cents BIGINT;
  v_loser_before_cap_cents BIGINT;
  v_loser_after_cap_cents BIGINT;
  v_total_shares INTEGER;
  v_winner_price_before_cents BIGINT;
  v_winner_price_after_cents BIGINT;
  v_loser_price_before_cents BIGINT;
  v_loser_price_after_cents BIGINT;
  v_winner_price_impact_cents BIGINT;
  v_loser_price_impact_cents BIGINT;
  v_opponent_team_id INTEGER;
  v_opponent_team_name TEXT;
  v_is_home_winner BOOLEAN;
  v_match_score TEXT;
  v_home_entry_exists BOOLEAN;
  v_away_entry_exists BOOLEAN;
  v_winner_current_cap_cents BIGINT;
  v_loser_current_cap_cents BIGINT;
  v_winner_new_cap_cents BIGINT;
  v_loser_new_cap_cents BIGINT;
  v_pair_total_before_cents BIGINT;
  v_pair_total_after_cents BIGINT;
  v_conservation_drift_cents BIGINT;
BEGIN
  -- Get fixture with snapshot market cap data (now in cents)
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

  -- Validate snapshots exist (warn if missing, but continue)
  IF v_fixture.snapshot_home_cap IS NULL OR v_fixture.snapshot_away_cap IS NULL THEN
    RAISE WARNING 'Fixture % missing snapshots - using current caps (may be inaccurate)', p_fixture_id;
    SELECT market_cap INTO v_home_snapshot_cap_cents FROM teams WHERE id = v_fixture.home_team_id;
    SELECT market_cap INTO v_away_snapshot_cap_cents FROM teams WHERE id = v_fixture.away_team_id;
  ELSE
    v_home_snapshot_cap_cents := v_fixture.snapshot_home_cap;
    v_away_snapshot_cap_cents := v_fixture.snapshot_away_cap;
  END IF;

  -- Check if already processed (prevent duplicates)
  SELECT EXISTS(
    SELECT 1 FROM total_ledger 
    WHERE trigger_event_id = p_fixture_id 
      AND trigger_event_type = 'fixture'
      AND ledger_type IN ('match_win', 'match_loss', 'match_draw')
    LIMIT 1
  ) INTO v_home_entry_exists;
  
  IF v_home_entry_exists THEN
    RETURN json_build_object('success', true, 'transfer_amount', 0, 'message', 'Already processed');
  END IF;

  -- Calculate transfer amount and identify winner/loser
  IF v_fixture.result = 'home_win' THEN
    v_winner_team_id := v_fixture.home_team_id;
    v_loser_team_id := v_fixture.away_team_id;
    -- 10% transfer: (loser_cap_cents * 10) / 100 (integer division)
    v_transfer_amount_cents := (v_away_snapshot_cap_cents * 10) / 100;
    v_is_home_winner := TRUE;
    v_opponent_team_id := v_fixture.away_team_id;
    v_match_score := COALESCE(v_fixture.home_score, 0) || '-' || COALESCE(v_fixture.away_score, 0);
    v_winner_before_cap_cents := v_home_snapshot_cap_cents;
    v_loser_before_cap_cents := v_away_snapshot_cap_cents;
  ELSIF v_fixture.result = 'away_win' THEN
    v_winner_team_id := v_fixture.away_team_id;
    v_loser_team_id := v_fixture.home_team_id;
    -- 10% transfer: (loser_cap_cents * 10) / 100 (integer division)
    v_transfer_amount_cents := (v_home_snapshot_cap_cents * 10) / 100;
    v_is_home_winner := FALSE;
    v_opponent_team_id := v_fixture.home_team_id;
    v_match_score := COALESCE(v_fixture.home_score, 0) || '-' || COALESCE(v_fixture.away_score, 0);
    v_winner_before_cap_cents := v_away_snapshot_cap_cents;
    v_loser_before_cap_cents := v_home_snapshot_cap_cents;
  ELSE
    -- Draw handling - no transfer
    v_match_score := COALESCE(v_fixture.home_score, 0) || '-' || COALESCE(v_fixture.away_score, 0);
    SELECT market_cap INTO v_winner_current_cap_cents FROM teams WHERE id = v_fixture.home_team_id FOR UPDATE;
    SELECT market_cap INTO v_loser_current_cap_cents FROM teams WHERE id = v_fixture.away_team_id FOR UPDATE;
    SELECT EXISTS(SELECT 1 FROM total_ledger WHERE trigger_event_id = p_fixture_id AND team_id = v_fixture.home_team_id AND ledger_type = 'match_draw') INTO v_home_entry_exists;
    SELECT EXISTS(SELECT 1 FROM total_ledger WHERE trigger_event_id = p_fixture_id AND team_id = v_fixture.away_team_id AND ledger_type = 'match_draw') INTO v_away_entry_exists;
    IF v_home_entry_exists AND v_away_entry_exists THEN
      RETURN json_build_object('success', true, 'transfer_amount', 0, 'message', 'Draw - already processed');
    END IF;
    SELECT total_shares INTO v_total_shares FROM teams WHERE id = v_fixture.home_team_id;
    v_total_shares := COALESCE(v_total_shares, 1000);
    
    -- Process home team draw entry
    IF NOT v_home_entry_exists THEN
      SELECT market_cap INTO v_winner_current_cap_cents FROM teams WHERE id = v_fixture.home_team_id;
      v_winner_price_before_cents := CASE WHEN v_total_shares > 0 THEN ROUND(v_winner_current_cap_cents::NUMERIC / v_total_shares)::BIGINT ELSE 500 END;
      v_winner_price_after_cents := v_winner_price_before_cents; -- No change for draw
      v_winner_price_impact_cents := 0;
      
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
        v_fixture.home_team_id, 'match_draw', v_fixture.kickoff_at,
        'Match vs ' || (SELECT name FROM teams WHERE id = v_fixture.away_team_id),
        p_fixture_id, 'fixture',
        v_fixture.away_team_id, (SELECT name FROM teams WHERE id = v_fixture.away_team_id),
        'draw', v_match_score, TRUE,
        0, v_winner_price_impact_cents,
        v_winner_current_cap_cents, v_winner_current_cap_cents,
        v_total_shares, v_total_shares,
        v_winner_price_before_cents, v_winner_price_after_cents,
        'system'
      );
    END IF;
    
    -- Process away team draw entry
    IF NOT v_away_entry_exists THEN
      SELECT market_cap INTO v_loser_current_cap_cents FROM teams WHERE id = v_fixture.away_team_id;
      v_loser_price_before_cents := CASE WHEN v_total_shares > 0 THEN ROUND(v_loser_current_cap_cents::NUMERIC / v_total_shares)::BIGINT ELSE 500 END;
      v_loser_price_after_cents := v_loser_price_before_cents; -- No change for draw
      v_loser_price_impact_cents := 0;
      
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
        v_fixture.away_team_id, 'match_draw', v_fixture.kickoff_at,
        'Match vs ' || (SELECT name FROM teams WHERE id = v_fixture.home_team_id),
        p_fixture_id, 'fixture',
        v_fixture.home_team_id, (SELECT name FROM teams WHERE id = v_fixture.home_team_id),
        'draw', v_match_score, FALSE,
        0, v_loser_price_impact_cents,
        v_loser_current_cap_cents, v_loser_current_cap_cents,
        v_total_shares, v_total_shares,
        v_loser_price_before_cents, v_loser_price_after_cents,
        'system'
      );
    END IF;
    
    RETURN json_build_object('success', true, 'transfer_amount', 0, 'message', 'Draw processed');
  END IF;

  -- Get current market caps (for winner/loser calculations)
  SELECT market_cap INTO v_winner_current_cap_cents FROM teams WHERE id = v_winner_team_id FOR UPDATE;
  SELECT market_cap INTO v_loser_current_cap_cents FROM teams WHERE id = v_loser_team_id FOR UPDATE;
  
  -- Calculate new market caps
  v_winner_new_cap_cents := v_winner_current_cap_cents + v_transfer_amount_cents;
  v_loser_new_cap_cents := v_loser_current_cap_cents - v_transfer_amount_cents;
  
  -- Verify conservation
  v_pair_total_before_cents := v_winner_current_cap_cents + v_loser_current_cap_cents;
  v_pair_total_after_cents := v_winner_new_cap_cents + v_loser_new_cap_cents;
  v_conservation_drift_cents := v_pair_total_after_cents - v_pair_total_before_cents;
  
  IF v_conservation_drift_cents != 0 THEN
    RAISE WARNING 'Conservation drift detected: % cents', v_conservation_drift_cents;
    -- Adjust loser to maintain conservation
    v_loser_new_cap_cents := v_loser_new_cap_cents - v_conservation_drift_cents;
  END IF;
  
  -- Get team names
  SELECT name INTO v_opponent_team_name FROM teams WHERE id = v_opponent_team_id;
  
  -- Get total shares
  SELECT total_shares INTO v_total_shares FROM teams WHERE id = v_winner_team_id;
  v_total_shares := COALESCE(v_total_shares, 1000);
  
  -- Calculate share prices (in cents per share)
  v_winner_price_before_cents := CASE WHEN v_total_shares > 0 THEN ROUND(v_winner_current_cap_cents::NUMERIC / v_total_shares)::BIGINT ELSE 500 END;
  v_winner_price_after_cents := CASE WHEN v_total_shares > 0 THEN ROUND(v_winner_new_cap_cents::NUMERIC / v_total_shares)::BIGINT ELSE 500 END;
  v_winner_price_impact_cents := v_winner_price_after_cents - v_winner_price_before_cents;
  
  v_loser_price_before_cents := CASE WHEN v_total_shares > 0 THEN ROUND(v_loser_current_cap_cents::NUMERIC / v_total_shares)::BIGINT ELSE 500 END;
  v_loser_price_after_cents := CASE WHEN v_total_shares > 0 THEN ROUND(v_loser_new_cap_cents::NUMERIC / v_total_shares)::BIGINT ELSE 500 END;
  v_loser_price_impact_cents := v_loser_price_after_cents - v_loser_price_before_cents;
  
  -- Update team market caps
  UPDATE teams SET market_cap = v_winner_new_cap_cents WHERE id = v_winner_team_id;
  UPDATE teams SET market_cap = v_loser_new_cap_cents WHERE id = v_loser_team_id;
  
  -- Record transfer in transfers_ledger
  INSERT INTO transfers_ledger (
    fixture_id, winner_team_id, loser_team_id, transfer_amount
  ) VALUES (
    p_fixture_id, v_winner_team_id, v_loser_team_id, v_transfer_amount_cents
  );
  
  -- Log WINNER to total_ledger
  INSERT INTO total_ledger (
    team_id, ledger_type, event_date, amount_transferred, opponent_team_id, opponent_team_name, is_home_match,
    market_cap_before, market_cap_after, shares_outstanding_before, shares_outstanding_after,
    share_price_before, share_price_after, price_impact, match_result, match_score,
    trigger_event_type, trigger_event_id, event_description, created_by
  ) VALUES (
    v_winner_team_id, 'match_win', v_fixture.kickoff_at, v_transfer_amount_cents, v_opponent_team_id, v_opponent_team_name, v_is_home_winner,
    v_winner_current_cap_cents, v_winner_new_cap_cents, v_total_shares, v_total_shares,
    v_winner_price_before_cents, v_winner_price_after_cents, v_winner_price_impact_cents, 'win', v_match_score,
    'fixture', p_fixture_id, 'Match win: Gained ' || v_transfer_amount_cents::text || ' from ' || v_opponent_team_name, 'system'
  );
  
  -- Log LOSER to total_ledger
  INSERT INTO total_ledger (
    team_id, ledger_type, event_date, amount_transferred, opponent_team_id, opponent_team_name, is_home_match,
    market_cap_before, market_cap_after, shares_outstanding_before, shares_outstanding_after,
    share_price_before, share_price_after, price_impact, match_result, match_score,
    trigger_event_type, trigger_event_id, event_description, created_by
  ) VALUES (
    v_loser_team_id, 'match_loss', v_fixture.kickoff_at, v_transfer_amount_cents, v_opponent_team_id, v_opponent_team_name, NOT v_is_home_winner,
    v_loser_current_cap_cents, v_loser_new_cap_cents, v_total_shares, v_total_shares,
    v_loser_price_before_cents, v_loser_price_after_cents, v_loser_price_impact_cents, 'loss', v_match_score,
    'fixture', p_fixture_id, 'Match loss: Lost ' || v_transfer_amount_cents::text || ' to ' || v_opponent_team_name, 'system'
  );
  
  RETURN json_build_object(
    'success', true,
    'transfer_amount', v_transfer_amount_cents,
    'winner_team_id', v_winner_team_id,
    'loser_team_id', v_loser_team_id,
    'winner_new_cap', v_winner_new_cap_cents,
    'loser_new_cap', v_loser_new_cap_cents
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', SQLSTATE
    );
END;
$function$
;
