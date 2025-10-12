-- Update Atomic Function with Audit Logging
-- This updates the existing process_share_purchase_atomic function to include audit logging

CREATE OR REPLACE FUNCTION process_share_purchase_atomic(
  p_user_id UUID,
  p_team_id INTEGER,
  p_shares INTEGER,
  p_price_per_share NUMERIC,
  p_total_amount NUMERIC
) RETURNS JSON AS $$
DECLARE
  v_team RECORD;
  v_nav NUMERIC;
  v_order_id INTEGER;
  v_position_id INTEGER;
  v_market_cap_before NUMERIC;
  v_market_cap_after NUMERIC;
  v_shares_outstanding_before INTEGER;
  v_shares_outstanding_after INTEGER;
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
    v_order_id,
    jsonb_build_object(
      'team_id', p_team_id,
      'shares', p_shares,
      'price_per_share', p_price_per_share,
      'total_amount', p_total_amount,
      'market_cap_before', v_market_cap_before,
      'market_cap_after', v_market_cap_after,
      'shares_outstanding_before', v_shares_outstanding_before,
      'shares_outstanding_after', v_shares_outstanding_after
    ),
    NOW()
  );
  
  -- Update team market cap and shares atomically
  UPDATE teams SET
    market_cap = v_market_cap_after,
    shares_outstanding = v_shares_outstanding_after,
    updated_at = NOW()
  WHERE id = p_team_id;
  
  -- Update or create user position atomically
  INSERT INTO positions (user_id, team_id, quantity, total_invested)
  VALUES (p_user_id, p_team_id, p_shares, p_total_amount)
  ON CONFLICT (user_id, team_id) 
  DO UPDATE SET
    quantity = positions.quantity + p_shares,
    total_invested = positions.total_invested + p_total_amount,
    updated_at = NOW();
  
  -- Return success with transaction details
  RETURN json_build_object(
    'success', true,
    'order_id', v_order_id,
    'market_cap_before', v_market_cap_before,
    'market_cap_after', v_market_cap_after,
    'shares_outstanding_before', v_shares_outstanding_before,
    'shares_outstanding_after', v_shares_outstanding_after
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Return error details
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Atomic purchase function updated with audit logging successfully';
END $$;

