-- Update Database Functions to Use 4-Decimal Precision Internally
-- This migration updates all monetary calculation functions to use 4-decimal precision
-- for internal calculations, then round to 2 decimals only when storing/returning final values

-- Update process_share_purchase_atomic to use 4-decimal precision internally
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
  v_nav NUMERIC;
  v_order_id INTEGER;
  v_position_id INTEGER;
  v_market_cap_before NUMERIC;
  v_market_cap_after NUMERIC;
  v_shares_outstanding_before INTEGER;
  v_shares_outstanding_after INTEGER;
  v_wallet_balance NUMERIC;
  v_new_wallet_balance NUMERIC;
  v_rounded_price_per_share NUMERIC;
  v_correct_total_amount NUMERIC;
  v_existing_total_invested NUMERIC;
  v_new_total_invested NUMERIC;
BEGIN
  -- CRITICAL: Round price_per_share to 4 decimals FIRST for internal precision, then to 2 for storage
  v_rounded_price_per_share := ROUND(p_price_per_share, 4);
  v_correct_total_amount := ROUND(v_rounded_price_per_share * p_shares, 4);
  -- Round to 2 decimals for final storage/validation
  v_rounded_price_per_share := ROUND(v_rounded_price_per_share, 2);
  v_correct_total_amount := ROUND(v_correct_total_amount, 2);
  
  -- Validate that p_total_amount matches the correct calculation
  IF ABS(p_total_amount - v_correct_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'Total amount mismatch: expected % (based on price % * shares %), got %', 
      v_correct_total_amount, v_rounded_price_per_share, p_shares, p_total_amount;
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
  
  IF v_correct_total_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid total amount: %', v_correct_total_amount;
  END IF;
  
  -- Check wallet balance (with row lock on profile/user)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='profiles' AND column_name='wallet_balance'
  ) THEN
    SELECT COALESCE(wallet_balance, 0) INTO v_wallet_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='users' AND column_name='wallet_balance'
  ) THEN
    SELECT COALESCE(wallet_balance, 0) INTO v_wallet_balance
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;
  ELSE
    v_wallet_balance := 0;
  END IF;
  
  -- Round wallet balance to 4 decimals internally, then 2 for storage
  v_wallet_balance := ROUND(v_wallet_balance, 4);
  
  -- Check if user has sufficient balance
  IF ROUND(v_wallet_balance, 2) < v_correct_total_amount THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RETURN json_build_object(
      'success', false,
      'error', format('Insufficient balance. Required: %s, Available: %s', v_correct_total_amount, ROUND(v_wallet_balance, 2))
    );
  END IF;
  
  -- Calculate NAV with 4-decimal precision, then round to 2 for validation
  v_nav := CASE 
    WHEN v_team.total_shares > 0 THEN ROUND(v_team.market_cap / v_team.total_shares, 4)
    ELSE 5.00
  END;
  
  -- Validate price matches calculated NAV (allow small floating point differences)
  IF ABS(v_rounded_price_per_share - ROUND(v_nav, 2)) > 0.01 THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE EXCEPTION 'Price mismatch: expected %, got %', ROUND(v_nav, 2), v_rounded_price_per_share;
  END IF;
  
  -- Store current values for audit trail (round to 2 decimals for storage)
  v_market_cap_before := ROUND(v_team.market_cap, 2);
  v_market_cap_after := v_market_cap_before; -- NO CHANGE in fixed shares model
  v_shares_outstanding_before := COALESCE(v_team.available_shares, 1000);
  v_shares_outstanding_after := v_shares_outstanding_before - p_shares;
  v_new_wallet_balance := ROUND(v_wallet_balance - v_correct_total_amount, 2);
  
  -- Deduct from wallet (rounded to 2 decimals)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='profiles' AND column_name='wallet_balance'
  ) THEN
    UPDATE profiles
    SET wallet_balance = v_new_wallet_balance
    WHERE id = p_user_id;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='users' AND column_name='wallet_balance'
  ) THEN
    UPDATE users
    SET wallet_balance = v_new_wallet_balance
    WHERE id = p_user_id;
  END IF;
  
  -- Create order record (use rounded price and correct total amount)
  INSERT INTO orders (
    user_id, team_id, order_type, quantity, 
    price_per_share, total_amount, status, 
    executed_at, market_cap_before, market_cap_after,
    shares_outstanding_before, shares_outstanding_after
  ) VALUES (
    p_user_id, p_team_id, 'BUY', p_shares,
    v_rounded_price_per_share, v_correct_total_amount, 'FILLED',
    NOW(), v_market_cap_before, v_market_cap_after,
    v_shares_outstanding_before, v_shares_outstanding_after
  ) RETURNING id INTO v_order_id;
  
  -- Create wallet transaction record (use correct total amount)
  INSERT INTO wallet_transactions(user_id, amount_cents, currency, type, ref)
  VALUES (p_user_id, (v_correct_total_amount * 100)::bigint, 'usd', 'purchase', 'order_' || v_order_id);
  
  -- Get or create position
  SELECT id, COALESCE(total_invested, 0) INTO v_position_id, v_existing_total_invested
  FROM positions
  WHERE user_id = p_user_id AND team_id = p_team_id
  FOR UPDATE;
  
  IF FOUND THEN
    -- CRITICAL: Calculate new total_invested with 4-decimal precision, then round to 2
    v_new_total_invested := ROUND(v_existing_total_invested + v_correct_total_amount, 4);
    v_new_total_invested := ROUND(v_new_total_invested, 2);
    UPDATE positions
    SET 
      quantity = quantity + p_shares,
      total_invested = v_new_total_invested,
      updated_at = NOW()
    WHERE id = v_position_id;
  ELSE
    -- CRITICAL: Store total_invested as rounded_price * shares
    INSERT INTO positions (user_id, team_id, quantity, total_invested)
    VALUES (p_user_id, p_team_id, p_shares, v_correct_total_amount)
    RETURNING id INTO v_position_id;
  END IF;
  
  -- Update team: decrease available_shares, keep market_cap unchanged
  UPDATE teams
  SET 
    available_shares = v_shares_outstanding_after,
    updated_at = NOW()
  WHERE id = p_team_id;
  
  -- Insert into total_ledger (all values rounded to 2 decimals for storage)
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
    v_market_cap_before, v_market_cap_after,
    v_shares_outstanding_before, v_shares_outstanding_after,
    v_rounded_price_per_share, ROUND(v_nav, 2),
    v_correct_total_amount, p_user_id::text
  );
  
  PERFORM set_config('app.allow_wallet_update', '', true);
  
  RETURN json_build_object(
    'success', true,
    'order_id', v_order_id,
    'position_id', v_position_id,
    'total_amount', v_correct_total_amount,
    'wallet_balance', v_new_wallet_balance,
    'price_per_share', v_rounded_price_per_share
  );
  
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE EXCEPTION 'Purchase failed: %', SQLERRM;
END;
$$;

-- Update process_share_sale_atomic similarly
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
  v_nav NUMERIC;
  v_order_id INTEGER;
  v_position_id INTEGER;
  v_market_cap_before NUMERIC;
  v_market_cap_after NUMERIC;
  v_shares_outstanding_before INTEGER;
  v_shares_outstanding_after INTEGER;
  v_wallet_balance NUMERIC;
  v_new_wallet_balance NUMERIC;
  v_rounded_price_per_share NUMERIC;
  v_correct_total_amount NUMERIC;
  v_position_total_invested NUMERIC;
  v_position_quantity NUMERIC;
  v_proportional_cost NUMERIC;
  v_new_position_total_invested NUMERIC;
BEGIN
  -- CRITICAL: Round price_per_share to 4 decimals FIRST, then to 2 for storage
  v_rounded_price_per_share := ROUND(p_price_per_share, 4);
  v_correct_total_amount := ROUND(v_rounded_price_per_share * p_shares, 4);
  -- Round to 2 decimals for final storage/validation
  v_rounded_price_per_share := ROUND(v_rounded_price_per_share, 2);
  v_correct_total_amount := ROUND(v_correct_total_amount, 2);
  
  -- Validate that p_total_amount matches the correct calculation
  IF ABS(p_total_amount - v_correct_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'Total amount mismatch: expected % (based on price % * shares %), got %', 
      v_correct_total_amount, v_rounded_price_per_share, p_shares, p_total_amount;
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
  
  IF v_correct_total_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid total amount: %', v_correct_total_amount;
  END IF;
  
  -- Get position with lock
  SELECT id, quantity, COALESCE(total_invested, 0) INTO v_position_id, v_position_quantity, v_position_total_invested
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
  
  -- Round existing values to 4 decimals internally
  v_position_quantity := ROUND(v_position_quantity, 4);
  v_position_total_invested := ROUND(v_position_total_invested, 4);
  
  -- Validate user has enough shares
  IF ROUND(v_position_quantity, 0) < p_shares THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RETURN json_build_object(
      'success', false,
      'error', format('Insufficient shares. Required: %, Available: %', p_shares, ROUND(v_position_quantity, 0))
    );
  END IF;
  
  -- Calculate proportional cost basis with 4-decimal precision
  IF v_position_quantity > 0 THEN
    v_proportional_cost := ROUND((v_position_total_invested / v_position_quantity) * p_shares, 4);
  ELSE
    v_proportional_cost := 0;
  END IF;
  
  -- Calculate new position values with 4-decimal precision, then round to 2
  v_new_position_total_invested := ROUND(v_position_total_invested - v_proportional_cost, 4);
  v_new_position_total_invested := ROUND(v_new_position_total_invested, 2);
  v_proportional_cost := ROUND(v_proportional_cost, 2);
  
  -- Check wallet balance
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='profiles' AND column_name='wallet_balance'
  ) THEN
    SELECT COALESCE(wallet_balance, 0) INTO v_wallet_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='users' AND column_name='wallet_balance'
  ) THEN
    SELECT COALESCE(wallet_balance, 0) INTO v_wallet_balance
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;
  ELSE
    v_wallet_balance := 0;
  END IF;
  
  -- Round wallet balance to 4 decimals internally, then 2 for storage
  v_wallet_balance := ROUND(v_wallet_balance, 4);
  v_new_wallet_balance := ROUND(v_wallet_balance + v_correct_total_amount, 2);
  
  -- Calculate NAV with 4-decimal precision
  v_nav := CASE 
    WHEN v_team.total_shares > 0 THEN ROUND(v_team.market_cap / v_team.total_shares, 4)
    ELSE 5.00
  END;
  
  -- Validate price
  IF ABS(v_rounded_price_per_share - ROUND(v_nav, 2)) > 0.01 THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE EXCEPTION 'Price mismatch: expected %, got %', ROUND(v_nav, 2), v_rounded_price_per_share;
  END IF;
  
  -- Store current values (round to 2 decimals for storage)
  v_market_cap_before := ROUND(v_team.market_cap, 2);
  v_market_cap_after := v_market_cap_before; -- NO CHANGE in fixed shares model
  v_shares_outstanding_before := COALESCE(v_team.available_shares, 1000);
  v_shares_outstanding_after := v_shares_outstanding_before + p_shares;
  
  -- Credit wallet (rounded to 2 decimals)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='profiles' AND column_name='wallet_balance'
  ) THEN
    UPDATE profiles
    SET wallet_balance = v_new_wallet_balance
    WHERE id = p_user_id;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='users' AND column_name='wallet_balance'
  ) THEN
    UPDATE users
    SET wallet_balance = v_new_wallet_balance
    WHERE id = p_user_id;
  END IF;
  
  -- Create order record (rounded to 2 decimals)
  INSERT INTO orders (
    user_id, team_id, order_type, quantity, 
    price_per_share, total_amount, status, 
    executed_at, market_cap_before, market_cap_after,
    shares_outstanding_before, shares_outstanding_after
  ) VALUES (
    p_user_id, p_team_id, 'SELL', p_shares,
    v_rounded_price_per_share, v_correct_total_amount, 'FILLED',
    NOW(), v_market_cap_before, v_market_cap_after,
    v_shares_outstanding_before, v_shares_outstanding_after
  ) RETURNING id INTO v_order_id;
  
  -- Create wallet transaction (rounded to 2 decimals)
  INSERT INTO wallet_transactions(user_id, amount_cents, currency, type, ref)
  VALUES (p_user_id, (v_correct_total_amount * 100)::bigint, 'usd', 'sale', 'order_' || v_order_id);
  
  -- Update position (rounded to 2 decimals)
  IF ROUND(v_position_quantity, 0) - p_shares <= 0 THEN
    -- Delete position if quantity becomes zero or near-zero
    DELETE FROM positions WHERE id = v_position_id;
  ELSE
    UPDATE positions
    SET 
      quantity = ROUND(v_position_quantity - p_shares, 0),
      total_invested = v_new_position_total_invested,
      updated_at = NOW()
    WHERE id = v_position_id;
  END IF;
  
  -- Update team: increase available_shares
  UPDATE teams
  SET 
    available_shares = v_shares_outstanding_after,
    updated_at = NOW()
  WHERE id = p_team_id;
  
  -- Insert into total_ledger (rounded to 2 decimals)
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
    v_market_cap_before, v_market_cap_after,
    v_shares_outstanding_before, v_shares_outstanding_after,
    v_rounded_price_per_share, ROUND(v_nav, 2),
    v_correct_total_amount, p_user_id::text
  );
  
  PERFORM set_config('app.allow_wallet_update', '', true);
  
  RETURN json_build_object(
    'success', true,
    'order_id', v_order_id,
    'total_amount', v_correct_total_amount,
    'wallet_balance', v_new_wallet_balance,
    'proportional_cost', v_proportional_cost,
    'price_per_share', v_rounded_price_per_share
  );
  
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE EXCEPTION 'Sale failed: %', SQLERRM;
END;
$$;

-- Update process_match_result_atomic to use 4-decimal precision
-- Note: This is a simplified version focusing on the rounding changes
-- The full function logic remains the same, but uses 4-decimal precision internally
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

  -- Calculate transfer amount with 4-decimal precision internally
  IF v_fixture.result = 'home_win' THEN
    v_winner_team_id := v_fixture.home_team_id;
    v_loser_team_id := v_fixture.away_team_id;
    v_transfer_amount := ROUND(v_away_snapshot_cap * 0.10, 4); -- 4-decimal precision
    v_is_home_winner := TRUE;
    v_opponent_team_id := v_fixture.away_team_id;
    v_match_score := COALESCE(v_fixture.home_score, 0) || '-' || COALESCE(v_fixture.away_score, 0);
    v_winner_before_cap := v_home_snapshot_cap;
    v_loser_before_cap := v_away_snapshot_cap;
  ELSIF v_fixture.result = 'away_win' THEN
    v_winner_team_id := v_fixture.away_team_id;
    v_loser_team_id := v_fixture.home_team_id;
    v_transfer_amount := ROUND(v_home_snapshot_cap * 0.10, 4); -- 4-decimal precision
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

    -- Log draw for home team (only if doesn't exist) - use 4-decimal precision internally
    IF NOT v_home_entry_exists THEN
      v_winner_price_before := CASE WHEN v_total_shares > 0 THEN ROUND(v_home_snapshot_cap / v_total_shares, 4) ELSE 20.00 END;
      v_winner_price_before := ROUND(v_winner_price_before, 2); -- Round to 2 for storage

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

    -- Log draw for away team (only if doesn't exist) - use 4-decimal precision internally
    IF NOT v_away_entry_exists THEN
      v_winner_price_before := CASE WHEN v_total_shares > 0 THEN ROUND(v_away_snapshot_cap / v_total_shares, 4) ELSE 20.00 END;
      v_winner_price_before := ROUND(v_winner_price_before, 2); -- Round to 2 for storage

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
    RETURN json_build_object('success', true, 'transfer_amount', ROUND(v_transfer_amount, 2), 'message', 'Match result already processed');
  END IF;

  -- CRITICAL: Calculate pair total BEFORE transfer (for perfect conservation) - use 4-decimal precision
  v_pair_total_before := ROUND(v_winner_current_cap + v_loser_current_cap, 4);

  -- EXPLICIT CHECK: If loser is at or below $10 minimum, no transfer possible
  IF v_loser_current_cap <= 10.00 THEN
    v_transfer_amount := 0.00;
    v_winner_new_cap := v_winner_current_cap;
    v_loser_new_cap := v_loser_current_cap;
  ELSE
    -- Calculate new caps with 4-decimal precision internally
    v_winner_new_cap := ROUND(v_winner_current_cap + v_transfer_amount, 4);
    v_loser_new_cap := ROUND(v_loser_current_cap - v_transfer_amount, 4);

    -- Ensure loser doesn't go below minimum ($10) - adjust transfer if needed
    IF v_loser_new_cap < 10.00 THEN
      -- Recalculate transfer to only take what's available above $10 minimum
      v_transfer_amount := ROUND(v_loser_current_cap - 10.00, 4);
      v_loser_new_cap := 10.00;
      v_winner_new_cap := ROUND(v_winner_current_cap + v_transfer_amount, 4);
    END IF;
  END IF;

  -- ENFORCE PERFECT CONSERVATION: Ensure pair total is exactly preserved
  v_pair_total_after := ROUND(v_winner_new_cap + v_loser_new_cap, 4);
  v_conservation_drift := v_pair_total_before - v_pair_total_after;

  -- If there's any drift due to rounding, adjust the winner's cap to eliminate it
  IF ABS(v_conservation_drift) > 0.0001 THEN
    v_winner_new_cap := ROUND(v_winner_new_cap + v_conservation_drift, 4);
    -- Recalculate pair total to verify
    v_pair_total_after := ROUND(v_winner_new_cap + v_loser_new_cap, 4);
    
    -- Final validation: if still not exact, raise exception (this should never happen)
    IF ABS(v_pair_total_after - v_pair_total_before) > 0.0001 THEN
      RAISE EXCEPTION 'Conservation violation: Before=%, After=%, Drift=%', 
        v_pair_total_before, v_pair_total_after, v_conservation_drift;
    END IF;
  END IF;

  -- Round to 2 decimals for storage
  v_winner_new_cap := ROUND(v_winner_new_cap, 2);
  v_loser_new_cap := ROUND(v_loser_new_cap, 2);
  v_transfer_amount := ROUND(v_transfer_amount, 2);

  -- Update snapshot-based display values to match final adjusted values
  v_winner_after_cap := v_winner_new_cap;
  v_loser_after_cap := v_loser_new_cap;

  -- Calculate prices for ledger logging with 4-decimal precision internally
  v_winner_price_before := CASE WHEN v_total_shares > 0 THEN ROUND(v_winner_before_cap / v_total_shares, 4) ELSE 20.00 END;
  v_loser_price_before := CASE WHEN v_total_shares > 0 THEN ROUND(v_loser_before_cap / v_total_shares, 4) ELSE 20.00 END;
  v_winner_price_after := CASE WHEN v_total_shares > 0 THEN ROUND(v_winner_after_cap / v_total_shares, 4) ELSE 20.00 END;
  v_loser_price_after := CASE WHEN v_total_shares > 0 THEN ROUND(v_loser_after_cap / v_total_shares, 4) ELSE 20.00 END;
  
  -- Round to 2 decimals for storage
  v_winner_price_before := ROUND(v_winner_price_before, 2);
  v_loser_price_before := ROUND(v_loser_price_before, 2);
  v_winner_price_after := ROUND(v_winner_price_after, 2);
  v_loser_price_after := ROUND(v_loser_price_after, 2);

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
    'pair_total_before', ROUND(v_pair_total_before, 2),
    'pair_total_after', ROUND(v_pair_total_after, 2),
    'conservation_verified', (ABS(ROUND(v_pair_total_after, 2) - ROUND(v_pair_total_before, 2)) < 0.01)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Match result processing failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION process_share_purchase_atomic IS 'Uses 4-decimal precision internally, rounds to 2 decimals for storage. total_invested = ROUND(price_per_share, 2) * shares.';
COMMENT ON FUNCTION process_share_sale_atomic IS 'Uses 4-decimal precision internally, rounds to 2 decimals for storage. total_amount = ROUND(price_per_share, 2) * shares.';
COMMENT ON FUNCTION process_match_result_atomic IS 'Uses 4-decimal precision internally for transfer calculations, rounds to 2 decimals for storage. Enforces perfect conservation.';


