-- Enforce Two Decimal Precision for All Monetary Values
-- This migration ensures ALL money values are stored with exactly 2 decimal places
-- Prevents money leakage from floating-point precision errors

-- Step 1: Round all existing total_invested values to 2 decimals
UPDATE positions
SET total_invested = ROUND(total_invested, 2)
WHERE total_invested != ROUND(total_invested, 2);

-- Step 2: Round all existing wallet balances to 2 decimals
UPDATE profiles
SET wallet_balance = ROUND(wallet_balance, 2)
WHERE wallet_balance IS NOT NULL AND wallet_balance != ROUND(wallet_balance, 2);

-- Step 3: Update purchase function to round p_total_amount and total_invested
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
  v_rounded_total_amount NUMERIC;
  v_existing_total_invested NUMERIC;
  v_new_total_invested NUMERIC;
BEGIN
  -- CRITICAL: Round total amount to 2 decimals immediately
  v_rounded_total_amount := ROUND(p_total_amount, 2);
  
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
  
  IF v_rounded_total_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid total amount: %', v_rounded_total_amount;
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
  
  -- Round wallet balance to 2 decimals
  v_wallet_balance := ROUND(v_wallet_balance, 2);
  
  -- Check if user has sufficient balance
  IF v_wallet_balance < v_rounded_total_amount THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RETURN json_build_object(
      'success', false,
      'error', format('Insufficient balance. Required: %s, Available: %s', v_rounded_total_amount, v_wallet_balance)
    );
  END IF;
  
  -- Calculate NAV and validate price
  v_nav := CASE 
    WHEN v_team.total_shares > 0 THEN ROUND(v_team.market_cap / v_team.total_shares, 2)
    ELSE 5.00
  END;
  
  -- Validate price matches calculated NAV (allow small floating point differences)
  IF ABS(p_price_per_share - v_nav) > 0.01 THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE EXCEPTION 'Price mismatch: expected %, got %', v_nav, p_price_per_share;
  END IF;
  
  -- Store current values for audit trail
  v_market_cap_before := ROUND(v_team.market_cap, 2);
  v_market_cap_after := v_market_cap_before; -- NO CHANGE in fixed shares model
  v_shares_outstanding_before := COALESCE(v_team.available_shares, 1000);
  v_shares_outstanding_after := v_shares_outstanding_before - p_shares;
  v_new_wallet_balance := ROUND(v_wallet_balance - v_rounded_total_amount, 2);
  
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
  
  -- Create order record (use rounded total amount)
  INSERT INTO orders (
    user_id, team_id, order_type, quantity, 
    price_per_share, total_amount, status, 
    executed_at, market_cap_before, market_cap_after,
    shares_outstanding_before, shares_outstanding_after
  ) VALUES (
    p_user_id, p_team_id, 'BUY', p_shares,
    ROUND(p_price_per_share, 2), v_rounded_total_amount, 'FILLED',
    NOW(), v_market_cap_before, v_market_cap_after,
    v_shares_outstanding_before, v_shares_outstanding_after
  ) RETURNING id INTO v_order_id;
  
  -- Create wallet transaction record (use rounded total amount)
  INSERT INTO wallet_transactions(user_id, amount_cents, currency, type, ref)
  VALUES (p_user_id, (v_rounded_total_amount * 100)::bigint, 'usd', 'purchase', 'order_' || v_order_id);
  
  -- Get or create position
  SELECT id, COALESCE(total_invested, 0) INTO v_position_id, v_existing_total_invested
  FROM positions
  WHERE user_id = p_user_id AND team_id = p_team_id
  FOR UPDATE;
  
  IF FOUND THEN
    -- CRITICAL: Round total_invested when updating
    v_new_total_invested := ROUND(v_existing_total_invested + v_rounded_total_amount, 2);
    UPDATE positions
    SET 
      quantity = quantity + p_shares,
      total_invested = v_new_total_invested,
      updated_at = NOW()
    WHERE id = v_position_id;
  ELSE
    -- CRITICAL: Round total_invested when inserting
    INSERT INTO positions (user_id, team_id, quantity, total_invested)
    VALUES (p_user_id, p_team_id, p_shares, v_rounded_total_amount)
    RETURNING id INTO v_position_id;
  END IF;
  
  -- Update team: decrease available_shares, keep market_cap unchanged
  UPDATE teams
  SET 
    available_shares = v_shares_outstanding_after,
    updated_at = NOW()
  WHERE id = p_team_id;
  
  -- Insert into total_ledger (all values rounded)
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
    ROUND(p_price_per_share, 2), v_nav,
    v_rounded_total_amount, p_user_id::text
  );
  
  PERFORM set_config('app.allow_wallet_update', '', true);
  
  RETURN json_build_object(
    'success', true,
    'order_id', v_order_id,
    'position_id', v_position_id,
    'total_amount', v_rounded_total_amount,
    'wallet_balance', v_new_wallet_balance
  );
  
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE EXCEPTION 'Purchase failed: %', SQLERRM;
END;
$$;

-- Step 4: Update sell function to round all monetary values
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
  v_rounded_total_amount NUMERIC;
  v_position_total_invested NUMERIC;
  v_position_quantity NUMERIC;
  v_proportional_cost NUMERIC;
  v_new_position_total_invested NUMERIC;
BEGIN
  -- CRITICAL: Round total amount to 2 decimals immediately
  v_rounded_total_amount := ROUND(p_total_amount, 2);
  
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
  
  IF v_rounded_total_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid total amount: %', v_rounded_total_amount;
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
  
  -- Round existing values
  v_position_quantity := ROUND(v_position_quantity, 2);
  v_position_total_invested := ROUND(v_position_total_invested, 2);
  
  -- Validate user has enough shares
  IF v_position_quantity < p_shares THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RETURN json_build_object(
      'success', false,
      'error', format('Insufficient shares. Required: %, Available: %', p_shares, v_position_quantity)
    );
  END IF;
  
  -- Calculate proportional cost basis (rounded)
  IF v_position_quantity > 0 THEN
    v_proportional_cost := ROUND((v_position_total_invested / v_position_quantity) * p_shares, 2);
  ELSE
    v_proportional_cost := 0;
  END IF;
  
  -- Calculate new position values (rounded)
  v_new_position_total_invested := ROUND(v_position_total_invested - v_proportional_cost, 2);
  
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
  
  -- Round wallet balance
  v_wallet_balance := ROUND(v_wallet_balance, 2);
  v_new_wallet_balance := ROUND(v_wallet_balance + v_rounded_total_amount, 2);
  
  -- Calculate NAV
  v_nav := CASE 
    WHEN v_team.total_shares > 0 THEN ROUND(v_team.market_cap / v_team.total_shares, 2)
    ELSE 5.00
  END;
  
  -- Validate price
  IF ABS(p_price_per_share - v_nav) > 0.01 THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE EXCEPTION 'Price mismatch: expected %, got %', v_nav, p_price_per_share;
  END IF;
  
  -- Store current values
  v_market_cap_before := ROUND(v_team.market_cap, 2);
  v_market_cap_after := v_market_cap_before; -- NO CHANGE in fixed shares model
  v_shares_outstanding_before := COALESCE(v_team.available_shares, 1000);
  v_shares_outstanding_after := v_shares_outstanding_before + p_shares;
  
  -- Credit wallet (rounded)
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
  
  -- Create order record (rounded)
  INSERT INTO orders (
    user_id, team_id, order_type, quantity, 
    price_per_share, total_amount, status, 
    executed_at, market_cap_before, market_cap_after,
    shares_outstanding_before, shares_outstanding_after
  ) VALUES (
    p_user_id, p_team_id, 'SELL', p_shares,
    ROUND(p_price_per_share, 2), v_rounded_total_amount, 'FILLED',
    NOW(), v_market_cap_before, v_market_cap_after,
    v_shares_outstanding_before, v_shares_outstanding_after
  ) RETURNING id INTO v_order_id;
  
  -- Create wallet transaction (rounded)
  INSERT INTO wallet_transactions(user_id, amount_cents, currency, type, ref)
  VALUES (p_user_id, (v_rounded_total_amount * 100)::bigint, 'usd', 'sale', 'order_' || v_order_id);
  
  -- Update position (rounded)
  IF v_position_quantity - p_shares <= 0.01 THEN
    -- Delete position if quantity becomes zero or near-zero
    DELETE FROM positions WHERE id = v_position_id;
  ELSE
    UPDATE positions
    SET 
      quantity = ROUND(v_position_quantity - p_shares, 2),
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
  
  -- Insert into total_ledger (rounded)
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
    ROUND(p_price_per_share, 2), v_nav,
    v_rounded_total_amount, p_user_id::text
  );
  
  PERFORM set_config('app.allow_wallet_update', '', true);
  
  RETURN json_build_object(
    'success', true,
    'order_id', v_order_id,
    'total_amount', v_rounded_total_amount,
    'wallet_balance', v_new_wallet_balance,
    'proportional_cost', v_proportional_cost
  );
  
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE EXCEPTION 'Sale failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION process_share_purchase_atomic IS 'All monetary values are rounded to 2 decimal places to prevent money leakage. total_invested, wallet_balance, and all amounts are stored with exactly 2 decimals.';
COMMENT ON FUNCTION process_share_sale_atomic IS 'All monetary values are rounded to 2 decimal places to prevent money leakage. total_invested, wallet_balance, and all amounts are stored with exactly 2 decimals.';


