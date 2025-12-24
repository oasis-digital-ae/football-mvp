-- Add Sell Shares Function for Fixed Shares Model
-- Market cap does NOT change on sale, only available_shares increases

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
  v_total_shares INTEGER;
  v_available_shares_before INTEGER;
  v_available_shares_after INTEGER;
  v_wallet_balance NUMERIC;
  v_new_wallet_balance NUMERIC;
  v_position_quantity NUMERIC;
  v_position_total_invested NUMERIC;
  v_new_position_quantity NUMERIC;
  v_new_position_total_invested NUMERIC;
  v_proportional_cost NUMERIC;
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
  
  -- Get user's position with row lock
  SELECT * INTO v_position
  FROM positions
  WHERE user_id = p_user_id AND team_id = p_team_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You do not have any shares of this team to sell'
    );
  END IF;
  
  -- Check if user has sufficient shares
  v_position_quantity := COALESCE(v_position.quantity, 0);
  IF v_position_quantity < p_shares THEN
    RETURN json_build_object(
      'success', false,
      'error', format('Insufficient shares. Required: %s, Available: %s', p_shares, v_position_quantity)
    );
  END IF;
  
  -- Get total_shares (should be 1000, but use actual value)
  v_total_shares := COALESCE(v_team.total_shares, 1000);
  
  -- Calculate NAV using total_shares (fixed denominator)
  v_nav := CASE 
    WHEN v_total_shares > 0 THEN v_team.market_cap / v_total_shares
    ELSE 20.00
  END;
  
  -- Validate price matches calculated NAV (allow small floating point differences)
  IF ABS(p_price_per_share - v_nav) > 0.01 THEN
    RAISE EXCEPTION 'Price mismatch: expected %, got %', v_nav, p_price_per_share;
  END IF;
  
  -- Get wallet balance (with row lock on profile/user)
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
  
  -- Store current values for audit trail
  v_market_cap_before := v_team.market_cap;
  v_market_cap_after := v_market_cap_before; -- NO CHANGE - market cap stays the same
  v_available_shares_before := COALESCE(v_team.available_shares, 1000);
  v_available_shares_after := v_available_shares_before + p_shares;
  v_new_wallet_balance := v_wallet_balance + p_total_amount; -- CREDIT wallet
  
  -- Calculate proportional cost basis for sold shares
  v_position_total_invested := COALESCE(v_position.total_invested, 0);
  IF v_position_quantity > 0 THEN
    v_proportional_cost := (v_position_total_invested / v_position_quantity) * p_shares;
  ELSE
    v_proportional_cost := 0;
  END IF;
  
  -- Calculate new position values
  v_new_position_quantity := v_position_quantity - p_shares;
  v_new_position_total_invested := v_position_total_invested - v_proportional_cost;
  
  -- Credit wallet
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
    p_user_id, p_team_id, 'SELL', p_shares,
    p_price_per_share, p_total_amount, 'FILLED',
    NOW(), v_market_cap_before, v_market_cap_after,
    v_total_shares, v_total_shares -- shares_outstanding = total_shares (fixed)
  ) RETURNING id INTO v_order_id;
  
  -- Create wallet transaction record (positive amount for sale)
  INSERT INTO wallet_transactions(user_id, amount_cents, currency, type, ref)
  VALUES (p_user_id, (p_total_amount * 100)::bigint, 'usd', 'sale', 'order_' || v_order_id);
  
  -- Update or delete position
  v_position_id := v_position.id;
  
  IF v_new_position_quantity <= 0 THEN
    -- Delete position if all shares are sold
    DELETE FROM positions
    WHERE id = v_position_id;
    v_position_id := NULL;
  ELSE
    -- Update position: reduce quantity and proportionally reduce total_invested
    UPDATE positions
    SET 
      quantity = v_new_position_quantity,
      total_invested = v_new_position_total_invested,
      updated_at = NOW()
    WHERE id = v_position_id;
  END IF;
  
  -- Update team: increase available_shares, keep market_cap unchanged
  UPDATE teams
  SET 
    available_shares = v_available_shares_after,
    updated_at = NOW()
  WHERE id = p_team_id;
  
  -- Insert into total_ledger (market cap unchanged, but record the sale)
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
    v_market_cap_before, v_market_cap_after, -- Same value
    v_total_shares, v_total_shares, -- Fixed
    p_price_per_share, v_nav, -- Price unchanged
    0, -- No price impact (market cap unchanged)
    p_user_id::text
  );
  
  -- Log the sale for audit trail
  INSERT INTO audit_log (
    user_id,
    action,
    table_name,
    record_id,
    new_values,
    created_at
  ) VALUES (
    p_user_id,
    'share_sale',
    'orders',
    v_order_id,
    json_build_object(
      'team_id', p_team_id,
      'shares', p_shares,
      'price_per_share', p_price_per_share,
      'total_amount', p_total_amount,
      'market_cap_before', v_market_cap_before,
      'market_cap_after', v_market_cap_after,
      'available_shares_before', v_available_shares_before,
      'available_shares_after', v_available_shares_after,
      'position_quantity_before', v_position_quantity,
      'position_quantity_after', v_new_position_quantity
    ),
    NOW()
  );
  
  RETURN json_build_object(
    'success', true,
    'order_id', v_order_id,
    'position_id', v_position_id,
    'new_wallet_balance', v_new_wallet_balance,
    'available_shares_remaining', v_available_shares_after,
    'position_quantity_remaining', v_new_position_quantity
  );
END;
$$;

COMMENT ON FUNCTION public.process_share_sale_atomic IS 'Fixed shares model: Sales increase available_shares but do NOT change market_cap. Price = market_cap / total_shares (1000).';




