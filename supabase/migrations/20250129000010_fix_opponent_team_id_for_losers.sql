-- Fix incorrect opponent_team_id for loser entries
-- The logic was backwards - when home wins, loser (away) should have opponent = home (winner)
-- But the code was setting opponent = away team

-- First, fix the existing incorrect entries
UPDATE total_ledger tl
SET 
  opponent_team_id = CASE 
    WHEN f.result = 'home_win' AND tl.team_id = f.away_team_id THEN f.home_team_id  -- Away team lost, opponent is home team
    WHEN f.result = 'home_win' AND tl.team_id = f.home_team_id THEN f.away_team_id  -- Home team won, opponent is away team
    WHEN f.result = 'away_win' AND tl.team_id = f.home_team_id THEN f.away_team_id  -- Home team lost, opponent is away team
    WHEN f.result = 'away_win' AND tl.team_id = f.away_team_id THEN f.home_team_id  -- Away team won, opponent is home team
    WHEN f.result = 'draw' AND tl.team_id = f.home_team_id THEN f.away_team_id
    WHEN f.result = 'draw' AND tl.team_id = f.away_team_id THEN f.home_team_id
    ELSE tl.opponent_team_id
  END,
  opponent_team_name = (
    SELECT name FROM teams WHERE id = CASE 
      WHEN f.result = 'home_win' AND tl.team_id = f.away_team_id THEN f.home_team_id
      WHEN f.result = 'home_win' AND tl.team_id = f.home_team_id THEN f.away_team_id
      WHEN f.result = 'away_win' AND tl.team_id = f.home_team_id THEN f.away_team_id
      WHEN f.result = 'away_win' AND tl.team_id = f.away_team_id THEN f.home_team_id
      WHEN f.result = 'draw' AND tl.team_id = f.home_team_id THEN f.away_team_id
      WHEN f.result = 'draw' AND tl.team_id = f.away_team_id THEN f.home_team_id
      ELSE tl.opponent_team_id
    END
  )
FROM fixtures f
WHERE tl.trigger_event_type = 'fixture'
  AND tl.trigger_event_id = f.id
  AND tl.ledger_type IN ('match_win', 'match_loss', 'match_draw')
  AND tl.opponent_team_id != CASE 
    WHEN f.result = 'home_win' AND tl.team_id = f.away_team_id THEN f.home_team_id
    WHEN f.result = 'home_win' AND tl.team_id = f.home_team_id THEN f.away_team_id
    WHEN f.result = 'away_win' AND tl.team_id = f.home_team_id THEN f.away_team_id
    WHEN f.result = 'away_win' AND tl.team_id = f.away_team_id THEN f.home_team_id
    WHEN f.result = 'draw' AND tl.team_id = f.home_team_id THEN f.away_team_id
    WHEN f.result = 'draw' AND tl.team_id = f.away_team_id THEN f.home_team_id
    ELSE tl.opponent_team_id
  END;

-- Now fix the function to use correct logic
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
    v_opponent_team_id := v_fixture.away_team_id;  -- For winner (home), opponent is away
    v_match_score := COALESCE(v_fixture.home_score, 0) || '-' || COALESCE(v_fixture.away_score, 0);
    -- Use snapshot values for before_cap (for accurate display)
    v_winner_before_cap := v_home_snapshot_cap;
    v_loser_before_cap := v_away_snapshot_cap;
  ELSIF v_fixture.result = 'away_win' THEN
    v_winner_team_id := v_fixture.away_team_id;
    v_loser_team_id := v_fixture.home_team_id;
    v_transfer_amount := v_home_snapshot_cap * 0.10;
    v_is_home_winner := FALSE;
    v_opponent_team_id := v_fixture.home_team_id;  -- For winner (away), opponent is home
    v_match_score := COALESCE(v_fixture.home_score, 0) || '-' || COALESCE(v_fixture.away_score, 0);
    -- Use snapshot values for before_cap (for accurate display)
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
      v_winner_price_before := CASE WHEN v_total_shares > 0 THEN v_home_snapshot_cap / v_total_shares ELSE 20.00 END;
      
      INSERT INTO total_ledger (
        team_id, ledger_type, event_date, opponent_team_id, is_home_match,
        market_cap_before, market_cap_after, shares_outstanding_before, shares_outstanding_after,
        share_price_before, share_price_after, price_impact, match_result, match_score,
        trigger_event_type, trigger_event_id, event_description, created_by
      ) VALUES (
        v_fixture.home_team_id, 'match_draw', v_fixture.kickoff_at, v_fixture.away_team_id, TRUE,
        v_home_snapshot_cap, v_home_snapshot_cap,
        v_total_shares, v_total_shares,
        v_winner_price_before, v_winner_price_before, 0,
        'draw', v_match_score,
        'fixture', p_fixture_id, 'Draw: No market cap transfer', 'system'
      ) ON CONFLICT DO NOTHING;
    END IF;
    
    -- Log draw for away team (only if doesn't exist)
    IF NOT v_away_entry_exists THEN
      v_winner_price_before := CASE WHEN v_total_shares > 0 THEN v_away_snapshot_cap / v_total_shares ELSE 20.00 END;
      
      INSERT INTO total_ledger (
        team_id, ledger_type, event_date, opponent_team_id, is_home_match,
        market_cap_before, market_cap_after, shares_outstanding_before, shares_outstanding_after,
        share_price_before, share_price_after, price_impact, match_result, match_score,
        trigger_event_type, trigger_event_id, event_description, created_by
      ) VALUES (
        v_fixture.away_team_id, 'match_draw', v_fixture.kickoff_at, v_fixture.home_team_id, FALSE,
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
  
  -- Calculate prices and after values using snapshot values (for accurate display)
  v_winner_price_before := CASE WHEN v_total_shares > 0 THEN v_winner_before_cap / v_total_shares ELSE 20.00 END;
  v_loser_price_before := CASE WHEN v_total_shares > 0 THEN v_loser_before_cap / v_total_shares ELSE 20.00 END;
  
  -- Calculate after values based on snapshot + transfer
  v_winner_after_cap := v_winner_before_cap + v_transfer_amount;
  v_loser_after_cap := v_loser_before_cap - v_transfer_amount;
  
  -- Calculate new prices using total_shares (fixed denominator)
  v_winner_price_after := CASE WHEN v_total_shares > 0 THEN v_winner_after_cap / v_total_shares ELSE 20.00 END;
  v_loser_price_after := CASE WHEN v_total_shares > 0 THEN GREATEST(v_loser_after_cap, 10) / v_total_shares ELSE 20.00 END;
  
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
  
  -- Update teams atomically (only if entries don't exist)
  -- Use current cap + transfer amount to maintain consistency with other transactions
  IF NOT v_home_entry_exists AND NOT v_away_entry_exists THEN
    UPDATE teams SET
      market_cap = v_winner_current_cap + v_transfer_amount,
      updated_at = NOW()
    WHERE id = v_winner_team_id;
    
    UPDATE teams SET
      market_cap = GREATEST(v_loser_current_cap - v_transfer_amount, 10),
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
  -- Use snapshot-based values for accurate historical display
  -- Include event_date set to kickoff_at
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
      v_winner_before_cap, v_winner_after_cap, v_total_shares, v_total_shares,
      v_winner_price_before, v_winner_price_after, v_winner_price_after - v_winner_price_before, 'win', v_match_score,
      'fixture', p_fixture_id, 'Match win: Gained ' || v_transfer_amount::text || ' from ' || v_opponent_team_name, 'system'
    ) ON CONFLICT DO NOTHING;
  END IF;
  
  -- Log LOSER to total_ledger (only if doesn't exist)
  -- Use snapshot-based values for accurate historical display
  -- Include event_date set to kickoff_at
  -- FIXED: Loser's opponent should be the winner, not the other way around
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
      v_winner_team_id,  -- FIXED: Loser's opponent is the winner
      (SELECT name FROM teams WHERE id = v_winner_team_id),  -- FIXED: Get winner's name
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

COMMENT ON FUNCTION process_match_result_atomic IS 'Fixed shares model: Price = market_cap / total_shares (1000). Uses snapshot values for accurate historical display. Sets event_date to fixture kickoff_at. Fixed opponent_team_id for losers.';




