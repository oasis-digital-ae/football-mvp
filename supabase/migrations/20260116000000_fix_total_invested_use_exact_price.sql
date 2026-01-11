-- Fix Total Invested to Use Exact Database-Calculated Price
-- This ensures total_invested uses the exact same price calculation as current price
-- (market_cap / total_shares), eliminating rounding errors in % change calculations
--
-- The issue: Previously, total_invested was calculated from frontend-provided price
-- (with 1 cent tolerance), which could differ slightly from the exact database-calculated
-- price, causing small % changes even when market cap hasn't changed.
--
-- The fix: Use v_nav_cents_per_share * p_shares for total_invested instead of
-- v_total_amount_cents from frontend. This ensures perfect consistency.

CREATE OR REPLACE FUNCTION process_share_purchase_atomic(
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
  v_exact_total_amount_cents BIGINT; -- NEW: Exact amount based on database-calculated price
  v_existing_total_invested_cents BIGINT;
  v_new_total_invested_cents BIGINT;
  v_total_pnl_cents BIGINT;
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
  
  IF v_wallet_balance_cents < v_total_amount_cents THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RETURN json_build_object(
      'success', false,
      'error', format('Insufficient wallet balance. Required: % cents, Available: % cents', v_total_amount_cents, v_wallet_balance_cents)
    );
  END IF;
  
  v_new_wallet_balance_cents := v_wallet_balance_cents - v_total_amount_cents;
  
  -- Calculate NAV in cents per share (use ROUND to get nearest cent)
  -- This is the EXACT price calculation used for current price display
  v_nav_cents_per_share := CASE 
    WHEN v_team.total_shares > 0 THEN ROUND(v_team.market_cap::NUMERIC / v_team.total_shares)::BIGINT
    ELSE 500
  END;
  
  -- CRITICAL FIX: Calculate exact total amount using database-calculated price
  -- This ensures total_invested matches exactly with how current price is calculated
  v_exact_total_amount_cents := v_nav_cents_per_share * p_shares;
  
  -- Validate price (allow 1 cent difference for rounding from frontend)
  IF ABS(v_price_per_share_cents - v_nav_cents_per_share) > 1 THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE EXCEPTION 'Price mismatch: expected % cents, got % cents', v_nav_cents_per_share, v_price_per_share_cents;
  END IF;
  
  -- Store current values
  v_market_cap_before_cents := v_team.market_cap;
  v_market_cap_after_cents := v_market_cap_before_cents; -- NO CHANGE in fixed shares model
  v_shares_outstanding_before := COALESCE(v_team.available_shares, 1000);
  v_shares_outstanding_after := v_shares_outstanding_before - p_shares;
  
  IF v_shares_outstanding_after < 0 THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RETURN json_build_object(
      'success', false,
      'error', format('Insufficient available shares. Required: %, Available: %', p_shares, v_shares_outstanding_before)
    );
  END IF;
  
  -- Debit wallet (use frontend-provided amount for wallet - what user actually paid)
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
  
  -- Create order record (use frontend-provided values for audit trail)
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
  
  -- Create wallet transaction record (use frontend-provided amount - what was actually charged)
  INSERT INTO wallet_transactions(user_id, amount_cents, currency, type, ref)
  VALUES (p_user_id, v_total_amount_cents, 'usd', 'purchase', 'order_' || v_order_id);
  
  -- Get or create position
  SELECT id, COALESCE(total_invested, 0) INTO v_position_id, v_existing_total_invested_cents
  FROM positions
  WHERE user_id = p_user_id AND team_id = p_team_id
  FOR UPDATE;
  
  IF FOUND THEN
    -- CRITICAL FIX: Use exact database-calculated price for total_invested
    -- This ensures avgCost = total_invested / quantity = v_nav_cents_per_share exactly
    -- which matches how current price is calculated (market_cap / total_shares)
    v_new_total_invested_cents := v_existing_total_invested_cents + v_exact_total_amount_cents;
    
    UPDATE positions
    SET 
      quantity = quantity + p_shares,
      total_invested = v_new_total_invested_cents,
      updated_at = NOW()
    WHERE id = v_position_id;
    
    -- Calculate total P&L after updating position (includes the new purchase)
    v_total_pnl_cents := calculate_position_total_pnl(p_user_id, p_team_id);
    
    -- Update total_pnl
    UPDATE positions
    SET total_pnl = v_total_pnl_cents,
        updated_at = NOW()
    WHERE id = v_position_id;
  ELSE
    -- CRITICAL FIX: Store total_invested using exact database-calculated price
    -- This ensures perfect consistency with current price calculation
    INSERT INTO positions (user_id, team_id, quantity, total_invested, total_pnl)
    VALUES (p_user_id, p_team_id, p_shares, v_exact_total_amount_cents, 0)
    RETURNING id INTO v_position_id;
    
    -- Calculate total P&L for the new position
    v_total_pnl_cents := calculate_position_total_pnl(p_user_id, p_team_id);
    
    -- Update total_pnl
    UPDATE positions
    SET total_pnl = v_total_pnl_cents
    WHERE id = v_position_id;
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

COMMENT ON FUNCTION process_share_purchase_atomic IS 
'Fixed-point arithmetic: All values in cents (BIGINT). Uses exact database-calculated price (market_cap / total_shares) for total_invested to ensure perfect consistency with current price calculation, eliminating rounding errors in % change.';
