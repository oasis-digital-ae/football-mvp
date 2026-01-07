-- Add total_pnl column to positions table
-- Total P&L = Unrealized P&L + Realized P&L
-- Stored as BIGINT (cents) for consistency with other monetary values

-- ============================================================================
-- STEP 1: Add total_pnl column to positions table
-- ============================================================================
ALTER TABLE positions 
ADD COLUMN IF NOT EXISTS total_pnl BIGINT DEFAULT 0;

COMMENT ON COLUMN positions.total_pnl IS 'Total profit/loss in cents: unrealized P&L (current_value - total_invested) + realized P&L (from SELL orders)';

-- ============================================================================
-- STEP 2: Create function to calculate total P&L for a position
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_position_total_pnl(
  p_user_id uuid,
  p_team_id integer
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_position RECORD;
  v_team RECORD;
  v_unrealized_pl_cents BIGINT;
  v_realized_pl_cents BIGINT;
  v_total_pl_cents BIGINT;
  v_current_value_cents BIGINT;
  v_total_invested_cents BIGINT;
  v_current_price_cents_per_share BIGINT;
  v_team_cost_basis_total_invested BIGINT;
  v_team_cost_basis_total_quantity INTEGER;
  v_order RECORD;
  v_proportional_cost_cents BIGINT;
BEGIN
  -- Get position
  SELECT * INTO v_position
  FROM positions
  WHERE user_id = p_user_id AND team_id = p_team_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Get team data
  SELECT * INTO v_team
  FROM teams
  WHERE id = p_team_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Calculate current value: (market_cap / total_shares) * quantity
  -- All in cents for precision
  IF v_team.total_shares > 0 THEN
    v_current_price_cents_per_share := ROUND((v_team.market_cap::NUMERIC / v_team.total_shares))::BIGINT;
    v_current_value_cents := (v_current_price_cents_per_share * v_position.quantity::INTEGER);
  ELSE
    v_current_value_cents := 0;
  END IF;
  
  v_total_invested_cents := COALESCE(v_position.total_invested, 0);
  
  -- Calculate unrealized P&L: current_value - total_invested
  v_unrealized_pl_cents := v_current_value_cents - v_total_invested_cents;
  
  -- Calculate realized P&L from SELL orders
  -- Track cost basis chronologically and calculate realized P&L for each SELL
  v_realized_pl_cents := 0;
  v_team_cost_basis_total_invested := 0;
  v_team_cost_basis_total_quantity := 0;
  
  -- Process all orders chronologically (oldest first)
  FOR v_order IN 
    SELECT 
      order_type,
      quantity,
      total_amount,
      executed_at
    FROM orders
    WHERE user_id = p_user_id 
      AND team_id = p_team_id
      AND status = 'FILLED'
      AND executed_at IS NOT NULL
    ORDER BY executed_at ASC, created_at ASC
  LOOP
    IF v_order.order_type = 'BUY' THEN
      -- Add to cost basis
      v_team_cost_basis_total_invested := v_team_cost_basis_total_invested + v_order.total_amount;
      v_team_cost_basis_total_quantity := v_team_cost_basis_total_quantity + v_order.quantity;
    ELSIF v_order.order_type = 'SELL' THEN
      -- Calculate realized P&L for this sale
      IF v_team_cost_basis_total_quantity > 0 THEN
        -- Calculate average cost basis at time of sale
        v_proportional_cost_cents := (v_team_cost_basis_total_invested * v_order.quantity) / v_team_cost_basis_total_quantity;
        -- Realized P&L = sale_proceeds - cost_basis_for_sold_shares
        v_realized_pl_cents := v_realized_pl_cents + (v_order.total_amount - v_proportional_cost_cents);
        
        -- Reduce cost basis (proportional reduction)
        v_team_cost_basis_total_invested := v_team_cost_basis_total_invested - v_proportional_cost_cents;
        v_team_cost_basis_total_quantity := v_team_cost_basis_total_quantity - v_order.quantity;
      END IF;
    END IF;
  END LOOP;
  
  -- Total P&L = Unrealized + Realized
  v_total_pl_cents := v_unrealized_pl_cents + v_realized_pl_cents;
  
  RETURN v_total_pl_cents;
END;
$$;

COMMENT ON FUNCTION calculate_position_total_pnl IS 'Calculates total P&L (unrealized + realized) for a position in cents';

-- ============================================================================
-- STEP 3: Create function to update total_pnl for a position
-- ============================================================================
CREATE OR REPLACE FUNCTION update_position_total_pnl(
  p_user_id uuid,
  p_team_id integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_pnl_cents BIGINT;
BEGIN
  v_total_pnl_cents := calculate_position_total_pnl(p_user_id, p_team_id);
  
  UPDATE positions
  SET total_pnl = v_total_pnl_cents,
      updated_at = NOW()
  WHERE user_id = p_user_id AND team_id = p_team_id;
END;
$$;

COMMENT ON FUNCTION update_position_total_pnl IS 'Updates total_pnl for a specific position';

-- ============================================================================
-- STEP 4: Update purchase function to calculate and store total_pnl
-- ============================================================================
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
  v_shares_outstanding_after := v_shares_outstanding_before - p_shares;
  
  IF v_shares_outstanding_after < 0 THEN
    PERFORM set_config('app.allow_wallet_update', '', true);
    RETURN json_build_object(
      'success', false,
      'error', format('Insufficient available shares. Required: %, Available: %', p_shares, v_shares_outstanding_before)
    );
  END IF;
  
  -- Debit wallet
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
    
    -- Calculate total P&L after updating position (includes the new purchase)
    v_total_pnl_cents := calculate_position_total_pnl(p_user_id, p_team_id);
    
    -- Update total_pnl
    UPDATE positions
    SET total_pnl = v_total_pnl_cents,
        updated_at = NOW()
    WHERE id = v_position_id;
  ELSE
    -- Store total_invested as price_cents * shares
    -- For new position, calculate P&L after inserting
    INSERT INTO positions (user_id, team_id, quantity, total_invested, total_pnl)
    VALUES (p_user_id, p_team_id, p_shares, v_total_amount_cents, 0)
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

-- ============================================================================
-- STEP 5: Update sell function to calculate and store total_pnl
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
    
    -- Calculate total P&L after updating position (includes the sale)
    v_total_pnl_cents := calculate_position_total_pnl(p_user_id, p_team_id);
    
    -- Update total_pnl
    UPDATE positions
    SET total_pnl = v_total_pnl_cents,
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

-- ============================================================================
-- STEP 6: Create trigger to update total_pnl when market cap changes
-- ============================================================================
CREATE OR REPLACE FUNCTION update_all_positions_pnl_on_market_cap_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update total_pnl for all positions of this team when market cap changes
  IF OLD.market_cap IS DISTINCT FROM NEW.market_cap THEN
    UPDATE positions p
    SET total_pnl = calculate_position_total_pnl(p.user_id, p.team_id),
        updated_at = NOW()
    WHERE p.team_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_positions_pnl_on_market_cap_change
AFTER UPDATE OF market_cap ON teams
FOR EACH ROW
EXECUTE FUNCTION update_all_positions_pnl_on_market_cap_change();

-- ============================================================================
-- STEP 7: Backfill total_pnl for all existing positions
-- ============================================================================
UPDATE positions p
SET total_pnl = calculate_position_total_pnl(p.user_id, p.team_id),
    updated_at = NOW();

