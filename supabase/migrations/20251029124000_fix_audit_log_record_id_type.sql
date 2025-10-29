-- Fix audit_log record_id type issue in process_share_purchase_atomic
-- This migration updates the function to use integer instead of text for record_id

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
BEGIN
  -- Start transaction (implicit in function)
  
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
  
  IF p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid total amount: %', p_total_amount;
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
  
  -- Check if user has sufficient balance
  IF v_wallet_balance < p_total_amount THEN
    RETURN json_build_object(
      'success', false,
      'error', format('Insufficient balance. Required: %s, Available: %s', p_total_amount, v_wallet_balance)
    );
  END IF;
  
  -- Calculate NAV and validate price
  v_nav := CASE 
    WHEN v_team.shares_outstanding > 0 THEN v_team.market_cap / v_team.shares_outstanding
    ELSE 20.00
  END;
  
  -- Validate price matches calculated NAV (allow small floating point differences)
  IF ABS(p_price_per_share - v_nav) > 0.01 THEN
    RAISE EXCEPTION 'Price mismatch: expected %, got %', v_nav, p_price_per_share;
  END IF;
  
  -- Store current values for audit trail
  v_market_cap_before := v_team.market_cap;
  v_shares_outstanding_before := v_team.shares_outstanding;
  
  -- Calculate new values
  v_market_cap_after := v_market_cap_before + p_total_amount;
  v_shares_outstanding_after := v_shares_outstanding_before + p_shares;
  v_new_wallet_balance := v_wallet_balance - p_total_amount;
  
  -- Deduct from wallet
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
  
  -- Create order record with immutable snapshots
  INSERT INTO orders (
    user_id, team_id, order_type, quantity, 
    price_per_share, total_amount, status, 
    executed_at, market_cap_before, market_cap_after,
    shares_outstanding_before, shares_outstanding_after
  ) VALUES (
    p_user_id, p_team_id, 'BUY', p_shares,
    p_price_per_share, p_total_amount, 'FILLED',
    NOW(), v_market_cap_before, v_market_cap_after,
    v_shares_outstanding_before, v_shares_outstanding_after
  ) RETURNING id INTO v_order_id;
  
  -- Create wallet transaction record
  INSERT INTO wallet_transactions(user_id, amount_cents, currency, type, ref)
  VALUES (p_user_id, (p_total_amount * 100)::bigint, 'usd', 'purchase', 'order_' || v_order_id);
  
  -- Get or create position
  SELECT id INTO v_position_id
  FROM positions
  WHERE user_id = p_user_id AND team_id = p_team_id
  FOR UPDATE;
  
  IF FOUND THEN
    -- Update existing position
    UPDATE positions
    SET 
      quantity = quantity + p_shares,
      total_invested = total_invested + p_total_amount,
      updated_at = NOW()
    WHERE id = v_position_id;
  ELSE
    -- Create new position
    INSERT INTO positions (user_id, team_id, quantity, total_invested)
    VALUES (p_user_id, p_team_id, p_shares, p_total_amount)
    RETURNING id INTO v_position_id;
  END IF;
  
  -- Update team market cap and shares
  UPDATE teams
  SET 
    market_cap = v_market_cap_after,
    shares_outstanding = v_shares_outstanding_after,
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
    p_team_id, 'share_purchase', NOW(), 'Share purchase',
    v_order_id, 'order',
    v_market_cap_before, v_market_cap_after,
    v_shares_outstanding_before, v_shares_outstanding_after,
    p_price_per_share, v_nav,
    p_total_amount, p_user_id::text
  );
  
  -- Log the purchase for audit trail
  INSERT INTO audit_log (
    user_id,
    action,
    table_name,
    record_id,
    new_values,
    created_at
  ) VALUES (
    p_user_id,
    'share_purchase',
    'orders',
    v_order_id,  -- record_id is integer, use integer directly
    json_build_object(
      'team_id', p_team_id,
      'shares', p_shares,
      'price_per_share', p_price_per_share,
      'total_amount', p_total_amount,
      'market_cap_before', v_market_cap_before,
      'market_cap_after', v_market_cap_after
    ),
    NOW()
  );
  
  RETURN json_build_object(
    'success', true,
    'order_id', v_order_id,
    'position_id', v_position_id,
    'new_wallet_balance', v_new_wallet_balance
  );
END;
$$;

