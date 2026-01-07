-- Fix all race conditions, add constraints, enforce perfect conservation
-- This migration:
-- 1. Adds database constraint to prevent market cap below $10
-- 2. Fixes race condition by moving idempotency check inside locked section
-- 3. Adds explicit handling for $10 minimum before transfer calculation
-- 4. Adds validation/warning for missing snapshots
-- 5. Removes normalization and enforces perfect conservation
-- 6. Ensures perfect conservation by calculating pair total before/after

-- Step 1: Add database constraint to prevent market cap below $10
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'teams_market_cap_minimum'
  ) THEN
    ALTER TABLE teams ADD CONSTRAINT teams_market_cap_minimum 
      CHECK (market_cap >= 10.00);
  END IF;
END $$;

-- Step 2: Replace function with all fixes
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
  v_winner_new_cap NUMERIC;
  v_loser_new_cap NUMERIC;
  v_pair_total_before NUMERIC;
  v_pair_total_after NUMERIC;
  v_conservation_drift NUMERIC;
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

  -- Validate snapshots exist (warn if missing, but continue)
  IF v_fixture.snapshot_home_cap IS NULL OR v_fixture.snapshot_away_cap IS NULL THEN
    RAISE WARNING 'Fixture % missing snapshots - using current caps (may be inaccurate)', p_fixture_id;
    SELECT market_cap INTO v_home_snapshot_cap FROM teams WHERE id = v_fixture.home_team_id;
    SELECT market_cap INTO v_away_snapshot_cap FROM teams WHERE id = v_fixture.away_team_id;
  ELSE
    v_home_snapshot_cap := v_fixture.snapshot_home_cap;
    v_away_snapshot_cap := v_fixture.snapshot_away_cap;
  END IF;

  -- Calculate transfer amount and identify winner/loser
  IF v_fixture.result = 'home_win' THEN
    v_winner_team_id := v_fixture.home_team_id;
    v_loser_team_id := v_fixture.away_team_id;
    v_transfer_amount := ROUND(v_away_snapshot_cap * 0.10, 2);
    v_is_home_winner := TRUE;
    v_opponent_team_id := v_fixture.away_team_id;
    v_match_score := COALESCE(v_fixture.home_score, 0) || '-' || COALESCE(v_fixture.away_score, 0);
    v_winner_before_cap := v_home_snapshot_cap;
    v_loser_before_cap := v_away_snapshot_cap;
  ELSIF v_fixture.result = 'away_win' THEN
    v_winner_team_id := v_fixture.away_team_id;
    v_loser_team_id := v_fixture.home_team_id;
    v_transfer_amount := ROUND(v_home_snapshot_cap * 0.10, 2);
    v_is_home_winner := FALSE;
    v_opponent_team_id := v_fixture.home_team_id;
    v_match_score := COALESCE(v_fixture.home_score, 0) || '-' || COALESCE(v_fixture.away_score, 0);
    v_winner_before_cap := v_away_snapshot_cap;
    v_loser_before_cap := v_home_snapshot_cap;
  ELSE
    -- Draw - no transfer, but still log to total_ledger for both teams
    v_match_score := COALESCE(v_fixture.home_score, 0) || '-' || COALESCE(v_fixture.away_score, 0);

    -- Lock rows FIRST to prevent race conditions
    SELECT market_cap INTO v_winner_current_cap FROM teams WHERE id = v_fixture.home_team_id FOR UPDATE;
    SELECT market_cap INTO v_loser_current_cap FROM teams WHERE id = v_fixture.away_team_id FOR UPDATE;

    -- Check if entries already exist (INSIDE locked section)
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

  -- CRITICAL FIX: Lock rows FIRST to prevent race conditions
  -- This ensures idempotency check happens while holding locks
  SELECT market_cap INTO v_winner_current_cap FROM teams WHERE id = v_winner_team_id FOR UPDATE;
  SELECT market_cap INTO v_loser_current_cap FROM teams WHERE id = v_loser_team_id FOR UPDATE;

  -- Check if entries already exist (INSIDE locked section - prevents race conditions)
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

  -- CRITICAL: Calculate pair total BEFORE transfer (for perfect conservation)
  v_pair_total_before := v_winner_current_cap + v_loser_current_cap;

  -- EXPLICIT CHECK: If loser is at or below $10 minimum, no transfer possible
  IF v_loser_current_cap <= 10.00 THEN
    v_transfer_amount := 0.00;
    v_winner_new_cap := v_winner_current_cap;
    v_loser_new_cap := v_loser_current_cap;
  ELSE
    -- Calculate new caps with rounding
    v_winner_new_cap := ROUND(v_winner_current_cap + v_transfer_amount, 2);
    v_loser_new_cap := ROUND(v_loser_current_cap - v_transfer_amount, 2);

    -- Ensure loser doesn't go below minimum ($10) - adjust transfer if needed
    IF v_loser_new_cap < 10.00 THEN
      -- Recalculate transfer to only take what's available above $10 minimum
      v_transfer_amount := ROUND(v_loser_current_cap - 10.00, 2);
      v_loser_new_cap := 10.00;
      v_winner_new_cap := ROUND(v_winner_current_cap + v_transfer_amount, 2);
    END IF;
  END IF;

  -- ENFORCE PERFECT CONSERVATION: Ensure pair total is exactly preserved
  v_pair_total_after := v_winner_new_cap + v_loser_new_cap;
  v_conservation_drift := v_pair_total_before - v_pair_total_after;

  -- If there's any drift due to rounding, adjust the winner's cap to eliminate it
  -- This ensures: winner_after + loser_after = winner_before + loser_before (exactly)
  IF ABS(v_conservation_drift) > 0.0001 THEN
    v_winner_new_cap := ROUND(v_winner_new_cap + v_conservation_drift, 2);
    -- Recalculate pair total to verify
    v_pair_total_after := v_winner_new_cap + v_loser_new_cap;
    
    -- Final validation: if still not exact, raise exception (this should never happen)
    IF ABS(v_pair_total_after - v_pair_total_before) > 0.0001 THEN
      RAISE EXCEPTION 'Conservation violation: Before=%, After=%, Drift=%', 
        v_pair_total_before, v_pair_total_after, v_conservation_drift;
    END IF;
  END IF;

  -- Update snapshot-based display values to match final adjusted values
  v_winner_after_cap := v_winner_new_cap;
  v_loser_after_cap := v_loser_new_cap;

  -- Calculate prices for ledger logging
  v_winner_price_before := CASE WHEN v_total_shares > 0 THEN ROUND(v_winner_before_cap / v_total_shares, 2) ELSE 20.00 END;
  v_loser_price_before := CASE WHEN v_total_shares > 0 THEN ROUND(v_loser_before_cap / v_total_shares, 2) ELSE 20.00 END;
  v_winner_price_after := CASE WHEN v_total_shares > 0 THEN ROUND(v_winner_after_cap / v_total_shares, 2) ELSE 20.00 END;
  v_loser_price_after := CASE WHEN v_total_shares > 0 THEN ROUND(v_loser_after_cap / v_total_shares, 2) ELSE 20.00 END;

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
    'loser_team_id', v_loser_team_id,
    'pair_total_before', v_pair_total_before,
    'pair_total_after', v_pair_total_after,
    'conservation_verified', (ABS(v_pair_total_after - v_pair_total_before) < 0.0001)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Match result processing failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION process_match_result_atomic IS 'Fixed shares model: Price = market_cap / total_shares (1000). Enforces PERFECT conservation: winner_after + loser_after = winner_before + loser_before exactly. Any rounding drift is eliminated by adjusting winner cap. Total market cap always equals $100,000. No normalization needed. Race conditions prevented by locking rows before idempotency check.';





