-- Update Database Functions to Use Fixed-Point Arithmetic (Integer Cents)
-- All monetary values are now BIGINT (cents), so all calculations use integer arithmetic
-- This eliminates rounding errors completely

-- ============================================================================
-- FUNCTION 1: process_match_result_atomic
-- ============================================================================
CREATE OR REPLACE FUNCTION process_match_result_atomic(p_fixture_id INTEGER)
RETURNS JSON AS $$
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
    -- Draw handling
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
    IF NOT v_home_entry_exists THEN
      -- Share price in cents per share: ROUND(market_cap_cents / total_shares) to get nearest cent
      v_winner_price_before_cents := CASE WHEN v_total_shares > 0 THEN ROUND(v_home_snapshot_cap_cents::NUMERIC / v_total_shares)::BIGINT ELSE 2000 END;
      INSERT INTO total_ledger (team_id, ledger_type, event_date, opponent_team_id, is_home_match, market_cap_before, market_cap_after, shares_outstanding_before, shares_outstanding_after, share_price_before, share_price_after, price_impact, match_result, match_score, trigger_event_type, trigger_event_id, event_description, created_by) VALUES (v_fixture.home_team_id, 'match_draw', v_fixture.kickoff_at, v_fixture.away_team_id, TRUE, v_home_snapshot_cap_cents, v_home_snapshot_cap_cents, v_total_shares, v_total_shares, v_winner_price_before_cents, v_winner_price_before_cents, 0, 'draw', v_match_score, 'fixture', p_fixture_id, 'Draw: No market cap transfer', 'system') ON CONFLICT DO NOTHING;
    END IF;
    IF NOT v_away_entry_exists THEN
      v_winner_price_before_cents := CASE WHEN v_total_shares > 0 THEN ROUND(v_away_snapshot_cap_cents::NUMERIC / v_total_shares)::BIGINT ELSE 2000 END;
      INSERT INTO total_ledger (team_id, ledger_type, event_date, opponent_team_id, is_home_match, market_cap_before, market_cap_after, shares_outstanding_before, shares_outstanding_after, share_price_before, share_price_after, price_impact, match_result, match_score, trigger_event_type, trigger_event_id, event_description, created_by) VALUES (v_fixture.away_team_id, 'match_draw', v_fixture.kickoff_at, v_fixture.home_team_id, FALSE, v_away_snapshot_cap_cents, v_away_snapshot_cap_cents, v_total_shares, v_total_shares, v_winner_price_before_cents, v_winner_price_before_cents, 0, 'draw', v_match_score, 'fixture', p_fixture_id, 'Draw: No market cap transfer', 'system') ON CONFLICT DO NOTHING;
    END IF;
    RETURN json_build_object('success', true, 'transfer_amount', 0, 'message', 'Draw - no market cap transfer');
  END IF;

  SELECT name INTO v_opponent_team_name FROM teams WHERE id = v_opponent_team_id;
  SELECT total_shares INTO v_total_shares FROM teams WHERE id = v_winner_team_id;
  v_total_shares := COALESCE(v_total_shares, 1000);
  
  -- Lock rows to prevent race conditions
  SELECT market_cap INTO v_winner_current_cap_cents FROM teams WHERE id = v_winner_team_id FOR UPDATE;
  SELECT market_cap INTO v_loser_current_cap_cents FROM teams WHERE id = v_loser_team_id FOR UPDATE;
  
  -- Check if entries already exist
  SELECT EXISTS(SELECT 1 FROM total_ledger WHERE trigger_event_id = p_fixture_id AND team_id = v_winner_team_id AND ledger_type IN ('match_win', 'match_loss', 'match_draw')) INTO v_home_entry_exists;
  SELECT EXISTS(SELECT 1 FROM total_ledger WHERE trigger_event_id = p_fixture_id AND team_id = v_loser_team_id AND ledger_type IN ('match_win', 'match_loss', 'match_draw')) INTO v_away_entry_exists;
  IF v_home_entry_exists AND v_away_entry_exists THEN
    RETURN json_build_object('success', true, 'transfer_amount', (v_transfer_amount_cents / 100.0)::NUMERIC(15,2), 'message', 'Match result already processed');
  END IF;

  -- CRITICAL: Calculate pair total BEFORE transfer (for perfect conservation)
  v_pair_total_before_cents := v_winner_current_cap_cents + v_loser_current_cap_cents;

  -- EXPLICIT CHECK: If loser is at or below $10 minimum (1000 cents), no transfer possible
  IF v_loser_current_cap_cents <= 1000 THEN
    v_transfer_amount_cents := 0;
    v_winner_new_cap_cents := v_winner_current_cap_cents;
    v_loser_new_cap_cents := v_loser_current_cap_cents;
  ELSE
    -- Ensure loser doesn't go below minimum ($10 = 1000 cents) - adjust transfer if needed
    IF (v_loser_current_cap_cents - v_transfer_amount_cents) < 1000 THEN
      -- Recalculate transfer to only take what's available above $10 minimum
      v_transfer_amount_cents := v_loser_current_cap_cents - 1000;
    END IF;

    -- Calculate new caps using integer arithmetic
    -- Winner gets exactly transfer_amount_cents
    v_winner_new_cap_cents := v_winner_current_cap_cents + v_transfer_amount_cents;
    
    -- Loser loses exactly transfer_amount_cents
    v_loser_new_cap_cents := v_loser_current_cap_cents - v_transfer_amount_cents;

    -- ENFORCE PERFECT CONSERVATION: If drift exists, adjust LOSER's cap (not winner's)
    -- The winner earned transfer_amount_cents - we cannot steal from their winnings
    v_pair_total_after_cents := v_winner_new_cap_cents + v_loser_new_cap_cents;
    v_conservation_drift_cents := v_pair_total_before_cents - v_pair_total_after_cents;

    -- If there's any drift due to integer division, adjust the LOSER's cap to eliminate it
    -- This ensures the winner keeps their full winnings
    IF v_conservation_drift_cents != 0 THEN
      v_loser_new_cap_cents := v_loser_new_cap_cents - v_conservation_drift_cents;
      -- Recalculate pair total to verify
      v_pair_total_after_cents := v_winner_new_cap_cents + v_loser_new_cap_cents;
      
      -- Final validation: if still not exact, raise exception (this should never happen)
      IF v_pair_total_after_cents != v_pair_total_before_cents THEN
        RAISE EXCEPTION 'Conservation violation: Before=%, After=%, Drift=%', 
          v_pair_total_before_cents, v_pair_total_after_cents, v_conservation_drift_cents;
      END IF;
    END IF;
  END IF;

  -- Use the final values for storage
  v_winner_after_cap_cents := v_winner_new_cap_cents;
  v_loser_after_cap_cents := v_loser_new_cap_cents;

  -- CRITICAL: Calculate price impact directly from transfer amount to ensure perfect symmetry
  -- Price impact per share = transfer_amount_cents / total_shares, rounded to nearest cent
  -- This ensures winner and loser impacts are exactly opposite
  IF v_total_shares > 0 AND v_transfer_amount_cents > 0 THEN
    v_winner_price_impact_cents := ROUND(v_transfer_amount_cents::NUMERIC / v_total_shares)::BIGINT;
    v_loser_price_impact_cents := -v_winner_price_impact_cents; -- Exactly opposite
  ELSE
    v_winner_price_impact_cents := 0;
    v_loser_price_impact_cents := 0;
  END IF;
  
  -- Calculate share prices in cents per share (use ROUND to get nearest cent, not truncation)
  -- price_cents_per_share = ROUND(market_cap_cents / total_shares) to get nearest cent
  v_winner_price_before_cents := CASE WHEN v_total_shares > 0 THEN ROUND(v_winner_before_cap_cents::NUMERIC / v_total_shares)::BIGINT ELSE 2000 END;
  v_loser_price_before_cents := CASE WHEN v_total_shares > 0 THEN ROUND(v_loser_before_cap_cents::NUMERIC / v_total_shares)::BIGINT ELSE 2000 END;
  
  -- Calculate after prices from before prices + impact (ensures consistency)
  v_winner_price_after_cents := v_winner_price_before_cents + v_winner_price_impact_cents;
  v_loser_price_after_cents := v_loser_price_before_cents + v_loser_price_impact_cents;

  -- Update teams atomically (only if entries don't exist)
  IF NOT v_home_entry_exists AND NOT v_away_entry_exists THEN
    UPDATE teams SET
      market_cap = v_winner_new_cap_cents,
      updated_at = NOW()
    WHERE id = v_winner_team_id;

    UPDATE teams SET
      market_cap = v_loser_new_cap_cents,
      updated_at = NOW()
    WHERE id = v_loser_team_id;
  END IF;

  -- Record transfer in transfers_ledger (only if entries don't exist)
  IF NOT v_home_entry_exists AND NOT v_away_entry_exists THEN
    INSERT INTO transfers_ledger (
      fixture_id, winner_team_id, loser_team_id, transfer_amount
    ) VALUES (
      p_fixture_id, v_winner_team_id, v_loser_team_id, v_transfer_amount_cents
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
      v_winner_team_id, 'match_win', v_fixture.kickoff_at, v_transfer_amount_cents, v_opponent_team_id, v_opponent_team_name, v_is_home_winner,
      v_winner_before_cap_cents, v_winner_after_cap_cents, v_total_shares, v_total_shares,
      v_winner_price_before_cents, v_winner_price_after_cents, v_winner_price_impact_cents, 'win', v_match_score,
      'fixture', p_fixture_id, 'Match win: Gained ' || (v_transfer_amount_cents / 100.0)::TEXT || ' from ' || v_opponent_team_name, 'system'
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
      v_loser_team_id, 'match_loss', v_fixture.kickoff_at, v_transfer_amount_cents,
      v_winner_team_id,
      (SELECT name FROM teams WHERE id = v_winner_team_id),
      NOT v_is_home_winner,
      v_loser_before_cap_cents, v_loser_after_cap_cents, v_total_shares, v_total_shares,
      v_loser_price_before_cents, v_loser_price_after_cents, v_loser_price_impact_cents, 'loss', v_match_score,
      'fixture', p_fixture_id, 'Match loss: Lost ' || (v_transfer_amount_cents / 100.0)::TEXT || ' to opponent', 'system'
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN json_build_object(
    'success', true,
    'transfer_amount', (v_transfer_amount_cents / 100.0)::NUMERIC(15,2),
    'winner_team_id', v_winner_team_id,
    'loser_team_id', v_loser_team_id,
    'pair_total_before', (v_pair_total_before_cents / 100.0)::NUMERIC(15,2),
    'pair_total_after', (v_pair_total_after_cents / 100.0)::NUMERIC(15,2),
    'conservation_verified', (v_pair_total_after_cents = v_pair_total_before_cents)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Match result processing failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION process_match_result_atomic IS 'Fixed-point arithmetic: All values in cents (BIGINT). Transfer: (loser_cap_cents * 10) / 100. Share price: market_cap_cents / total_shares. Perfect conservation guaranteed.';

-- ============================================================================
-- FUNCTION 2: process_share_purchase_atomic
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_share_purchase_atomic(
  p_user_id uuid,
  p_team_id integer,
  p_shares integer,
  p_price_per_share numeric,
  p_total_amount numeric
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_team RECORD;
  v_nav_cents_per_share BIGINT;
  v_order_id INTEGER;
  v_position_id INTEGER;
  v_market_cap_before_cents BIGINT;
  v_market_cap_after_cents BIGINT;
  v_shares_outstanding_before INTEGER;
  v_shares_outstanding_after INTEGER;
  v_wallet_balance_cents BIGINT;
  v_new_wallet_balance_cents BIGINT;
  v_price_per_share_cents BIGINT;
  v_total_amount_cents BIGINT;
  v_existing_total_invested_cents BIGINT;
  v_new_total_invested_cents BIGINT;
BEGIN
  -- Convert dollars to cents (round to nearest cent)
  v_price_per_share_cents := ROUND(p_price_per_share * 100)::BIGINT;
  v_total_amount_cents := ROUND(p_total_amount * 100)::BIGINT;
  
  -- Validate that p_total_amount matches the correct calculation
  IF ABS(v_total_amount_cents - (v_price_per_share_cents * p_shares)) > 0 THEN
    RAISE EXCEPTION 'Total amount mismatch: expected % cents (based on price % cents * shares %), got % cents', 
      (v_price_per_share_cents * p_shares), v_price_per_share_cents, p_shares, v_total_amount_cents;
  END IF;
  
  -- Set session variable to allow wallet_balance update
  PERFORM set_config('app.allow_wallet_update', 'true', true);
  
  -- Get current team data with row lock to prevent race conditions
  SELECT * INTO v_team 
  FROM teams 
  WHERE id = p_team_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found: %', p_team_id;
  END IF;
  
  -- Validate inputs
  IF p_shares <= 0 THEN
    RAISE EXCEPTION 'Invalid share quantity: %', p_shares;
  END IF;
  
  IF v_total_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Invalid total amount: % cents', v_total_amount_cents;
  END IF;
  
  -- Check wallet balance (with row lock on profile/user)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='profiles' AND column_name='wallet_balance'
  ) THEN
    SELECT COALESCE(wallet_balance, 0) INTO v_wallet_balance_cents
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='users' AND column_name='wallet_balance'
  ) THEN
    SELECT COALESCE(wallet_balance, 0) INTO v_wallet_balance_cents
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;
  ELSE
    v_wallet_balance_cents := 0;
  END IF;
  
  -- Check if user has sufficient balance
  IF v_wallet_balance_cents < v_total_amount_cents THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RETURN json_build_object(
      'success', false,
      'error', format('Insufficient balance. Required: %s cents, Available: %s cents', v_total_amount_cents, v_wallet_balance_cents)
    );
  END IF;
  
  -- Calculate NAV in cents per share (use ROUND to get nearest cent)
  v_nav_cents_per_share := CASE 
    WHEN v_team.total_shares > 0 THEN ROUND(v_team.market_cap::NUMERIC / v_team.total_shares)::BIGINT
    ELSE 500
  END;
  
  -- Validate price matches calculated NAV (allow 1 cent difference for rounding)
  IF ABS(v_price_per_share_cents - v_nav_cents_per_share) > 1 THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE EXCEPTION 'Price mismatch: expected % cents, got % cents', v_nav_cents_per_share, v_price_per_share_cents;
  END IF;
  
  -- Store current values for audit trail
  v_market_cap_before_cents := v_team.market_cap;
  v_market_cap_after_cents := v_market_cap_before_cents; -- NO CHANGE in fixed shares model
  v_shares_outstanding_before := COALESCE(v_team.available_shares, 1000);
  v_shares_outstanding_after := v_shares_outstanding_before - p_shares;
  v_new_wallet_balance_cents := v_wallet_balance_cents - v_total_amount_cents;
  
  -- Deduct from wallet
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='profiles' AND column_name='wallet_balance'
  ) THEN
    UPDATE profiles
    SET wallet_balance = v_new_wallet_balance_cents
    WHERE id = p_user_id;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='users' AND column_name='wallet_balance'
  ) THEN
    UPDATE users
    SET wallet_balance = v_new_wallet_balance_cents
    WHERE id = p_user_id;
  END IF;
  
  -- Create order record
  INSERT INTO orders (
    user_id, team_id, order_type, quantity, 
    price_per_share, total_amount, status, 
    executed_at, market_cap_before, market_cap_after,
    shares_outstanding_before, shares_outstanding_after
  ) VALUES (
    p_user_id, p_team_id, 'BUY', p_shares,
    v_price_per_share_cents, v_total_amount_cents, 'FILLED',
    NOW(), v_market_cap_before_cents, v_market_cap_after_cents,
    v_shares_outstanding_before, v_shares_outstanding_after
  ) RETURNING id INTO v_order_id;
  
  -- Create wallet transaction record
  INSERT INTO wallet_transactions(user_id, amount_cents, currency, type, ref)
  VALUES (p_user_id, v_total_amount_cents, 'usd', 'purchase', 'order_' || v_order_id);
  
  -- Get or create position
  SELECT id, COALESCE(total_invested, 0) INTO v_position_id, v_existing_total_invested_cents
  FROM positions
  WHERE user_id = p_user_id AND team_id = p_team_id
  FOR UPDATE;
  
  IF FOUND THEN
    -- Calculate new total_invested using integer arithmetic
    v_new_total_invested_cents := v_existing_total_invested_cents + v_total_amount_cents;
    UPDATE positions
    SET 
      quantity = quantity + p_shares,
      total_invested = v_new_total_invested_cents,
      updated_at = NOW()
    WHERE id = v_position_id;
  ELSE
    -- Store total_invested as price_cents * shares
    INSERT INTO positions (user_id, team_id, quantity, total_invested)
    VALUES (p_user_id, p_team_id, p_shares, v_total_amount_cents)
    RETURNING id INTO v_position_id;
  END IF;
  
  -- Update team: decrease available_shares, keep market_cap unchanged
  UPDATE teams
  SET 
    available_shares = v_shares_outstanding_after,
    updated_at = NOW()
  WHERE id = p_team_id;
  
  -- Insert into total_ledger
  INSERT INTO total_ledger (
    team_id, ledger_type, event_date, event_description,
    trigger_event_id, trigger_event_type,
    market_cap_before, market_cap_after,
    shares_outstanding_before, shares_outstanding_after,
    share_price_before, share_price_after,
    price_impact, created_by
  ) VALUES (
    p_team_id, 'share_purchase', NOW(), 'Share purchase (no market cap change)',
    v_order_id, 'order',
    v_market_cap_before_cents, v_market_cap_after_cents,
    v_shares_outstanding_before, v_shares_outstanding_after,
    v_price_per_share_cents, v_nav_cents_per_share,
    v_total_amount_cents, p_user_id::text
  );
  
  PERFORM set_config('app.allow_wallet_update', '', true);
  
  RETURN json_build_object(
    'success', true,
    'order_id', v_order_id,
    'position_id', v_position_id,
    'total_amount', (v_total_amount_cents / 100.0)::NUMERIC(15,2),
    'wallet_balance', (v_new_wallet_balance_cents / 100.0)::NUMERIC(15,2),
    'price_per_share', (v_price_per_share_cents / 100.0)::NUMERIC(10,2)
  );
  
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE EXCEPTION 'Purchase failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION process_share_purchase_atomic IS 'Fixed-point arithmetic: All values in cents (BIGINT). Uses integer arithmetic for perfect precision.';

-- ============================================================================
-- FUNCTION 3: process_share_sale_atomic
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_share_sale_atomic(
  p_user_id uuid,
  p_team_id integer,
  p_shares integer,
  p_price_per_share numeric,
  p_total_amount numeric
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_team RECORD;
  v_position RECORD;
  v_nav_cents_per_share BIGINT;
  v_order_id INTEGER;
  v_position_id INTEGER;
  v_market_cap_before_cents BIGINT;
  v_market_cap_after_cents BIGINT;
  v_shares_outstanding_before INTEGER;
  v_shares_outstanding_after INTEGER;
  v_wallet_balance_cents BIGINT;
  v_new_wallet_balance_cents BIGINT;
  v_price_per_share_cents BIGINT;
  v_total_amount_cents BIGINT;
  v_position_total_invested_cents BIGINT;
  v_position_quantity INTEGER;
  v_proportional_cost_cents BIGINT;
  v_new_position_total_invested_cents BIGINT;
BEGIN
  -- Convert dollars to cents (round to nearest cent)
  v_price_per_share_cents := ROUND(p_price_per_share * 100)::BIGINT;
  v_total_amount_cents := ROUND(p_total_amount * 100)::BIGINT;
  
  -- Validate that p_total_amount matches the correct calculation
  IF ABS(v_total_amount_cents - (v_price_per_share_cents * p_shares)) > 0 THEN
    RAISE EXCEPTION 'Total amount mismatch: expected % cents (based on price % cents * shares %), got % cents', 
      (v_price_per_share_cents * p_shares), v_price_per_share_cents, p_shares, v_total_amount_cents;
  END IF;
  
  -- Set session variable to allow wallet_balance update
  PERFORM set_config('app.allow_wallet_update', 'true', true);
  
  -- Get current team data with row lock
  SELECT * INTO v_team 
  FROM teams 
  WHERE id = p_team_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found: %', p_team_id;
  END IF;
  
  -- Validate inputs
  IF p_shares <= 0 THEN
    RAISE EXCEPTION 'Invalid share quantity: %', p_shares;
  END IF;
  
  IF v_total_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Invalid total amount: % cents', v_total_amount_cents;
  END IF;
  
  -- Get position with lock
  SELECT id, quantity, COALESCE(total_invested, 0) INTO v_position_id, v_position_quantity, v_position_total_invested_cents
  FROM positions
  WHERE user_id = p_user_id AND team_id = p_team_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RETURN json_build_object(
      'success', false,
      'error', 'No position found for this team'
    );
  END IF;
  
  -- Validate user has enough shares
  IF v_position_quantity < p_shares THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RETURN json_build_object(
      'success', false,
      'error', format('Insufficient shares. Required: %, Available: %', p_shares, v_position_quantity)
    );
  END IF;
  
  -- Calculate proportional cost basis using integer arithmetic
  IF v_position_quantity > 0 THEN
    -- proportional_cost_cents = (total_invested_cents * shares_to_sell) / total_shares
    v_proportional_cost_cents := (v_position_total_invested_cents * p_shares) / v_position_quantity;
  ELSE
    v_proportional_cost_cents := 0;
  END IF;
  
  -- Calculate new position values using integer arithmetic
  v_new_position_total_invested_cents := v_position_total_invested_cents - v_proportional_cost_cents;
  
  -- Check wallet balance
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='profiles' AND column_name='wallet_balance'
  ) THEN
    SELECT COALESCE(wallet_balance, 0) INTO v_wallet_balance_cents
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='users' AND column_name='wallet_balance'
  ) THEN
    SELECT COALESCE(wallet_balance, 0) INTO v_wallet_balance_cents
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;
  ELSE
    v_wallet_balance_cents := 0;
  END IF;
  
  v_new_wallet_balance_cents := v_wallet_balance_cents + v_total_amount_cents;
  
  -- Calculate NAV in cents per share (use ROUND to get nearest cent)
  v_nav_cents_per_share := CASE 
    WHEN v_team.total_shares > 0 THEN ROUND(v_team.market_cap::NUMERIC / v_team.total_shares)::BIGINT
    ELSE 500
  END;
  
  -- Validate price (allow 1 cent difference for rounding)
  IF ABS(v_price_per_share_cents - v_nav_cents_per_share) > 1 THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE EXCEPTION 'Price mismatch: expected % cents, got % cents', v_nav_cents_per_share, v_price_per_share_cents;
  END IF;
  
  -- Store current values
  v_market_cap_before_cents := v_team.market_cap;
  v_market_cap_after_cents := v_market_cap_before_cents; -- NO CHANGE in fixed shares model
  v_shares_outstanding_before := COALESCE(v_team.available_shares, 1000);
  v_shares_outstanding_after := v_shares_outstanding_before + p_shares;
  
  -- Credit wallet
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='profiles' AND column_name='wallet_balance'
  ) THEN
    UPDATE profiles
    SET wallet_balance = v_new_wallet_balance_cents
    WHERE id = p_user_id;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='users' AND column_name='wallet_balance'
  ) THEN
    UPDATE users
    SET wallet_balance = v_new_wallet_balance_cents
    WHERE id = p_user_id;
  END IF;
  
  -- Create order record
  INSERT INTO orders (
    user_id, team_id, order_type, quantity, 
    price_per_share, total_amount, status, 
    executed_at, market_cap_before, market_cap_after,
    shares_outstanding_before, shares_outstanding_after
  ) VALUES (
    p_user_id, p_team_id, 'SELL', p_shares,
    v_price_per_share_cents, v_total_amount_cents, 'FILLED',
    NOW(), v_market_cap_before_cents, v_market_cap_after_cents,
    v_shares_outstanding_before, v_shares_outstanding_after
  ) RETURNING id INTO v_order_id;
  
  -- Create wallet transaction
  INSERT INTO wallet_transactions(user_id, amount_cents, currency, type, ref)
  VALUES (p_user_id, v_total_amount_cents, 'usd', 'sale', 'order_' || v_order_id);
  
  -- Update position
  IF v_position_quantity - p_shares <= 0 THEN
    -- Delete position if quantity becomes zero
    DELETE FROM positions WHERE id = v_position_id;
  ELSE
    UPDATE positions
    SET 
      quantity = v_position_quantity - p_shares,
      total_invested = v_new_position_total_invested_cents,
      updated_at = NOW()
    WHERE id = v_position_id;
  END IF;
  
  -- Update team: increase available_shares
  UPDATE teams
  SET 
    available_shares = v_shares_outstanding_after,
    updated_at = NOW()
  WHERE id = p_team_id;
  
  -- Insert into total_ledger
  INSERT INTO total_ledger (
    team_id, ledger_type, event_date, event_description,
    trigger_event_id, trigger_event_type,
    market_cap_before, market_cap_after,
    shares_outstanding_before, shares_outstanding_after,
    share_price_before, share_price_after,
    price_impact, created_by
  ) VALUES (
    p_team_id, 'share_sale', NOW(), 'Share sale (no market cap change)',
    v_order_id, 'order',
    v_market_cap_before_cents, v_market_cap_after_cents,
    v_shares_outstanding_before, v_shares_outstanding_after,
    v_price_per_share_cents, v_nav_cents_per_share,
    v_total_amount_cents, p_user_id::text
  );
  
  PERFORM set_config('app.allow_wallet_update', '', true);
  
  RETURN json_build_object(
    'success', true,
    'order_id', v_order_id,
    'total_amount', (v_total_amount_cents / 100.0)::NUMERIC(15,2),
    'wallet_balance', (v_new_wallet_balance_cents / 100.0)::NUMERIC(15,2),
    'proportional_cost', (v_proportional_cost_cents / 100.0)::NUMERIC(15,2),
    'price_per_share', (v_price_per_share_cents / 100.0)::NUMERIC(10,2)
  );
  
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE EXCEPTION 'Sale failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION process_share_sale_atomic IS 'Fixed-point arithmetic: All values in cents (BIGINT). Uses integer arithmetic for perfect precision.';

