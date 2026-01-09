-- Fix purchase prices for amiri@miriassociates.com for West Ham and Nottingham Forest
-- This script ONLY affects the specified user - all queries filter by user_id
-- Recalculates total_invested based on correct purchase price from market_cap_before

DO $$
DECLARE
  v_user_id UUID;
  v_west_ham_team_id INTEGER;
  v_nottingham_team_id INTEGER;
  v_current_team_id INTEGER;  -- Use separate variable for loop
  v_total_shares INTEGER := 1000; -- Fixed shares model
  v_order RECORD;
  v_position_id INTEGER;
  v_correct_total_invested_cents BIGINT := 0;
  v_cost_basis_total_invested_cents BIGINT := 0;
  v_cost_basis_total_quantity INTEGER := 0;
  v_correct_price_per_share_cents BIGINT;
  v_order_total_cents BIGINT;
  v_proportional_cost_cents BIGINT;
BEGIN
  -- Find user by email
  -- Note: username in profiles is set to email during signup, so check that first
  -- Fallback to auth.users.email if needed (requires proper permissions)
  SELECT id INTO v_user_id
  FROM profiles
  WHERE username = 'amiri@miriassociates.com'
  LIMIT 1;
  
  -- If not found in profiles, try auth.users (may require special permissions)
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = 'amiri@miriassociates.com'
    LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found: amiri@miriassociates.com';
  END IF;

  RAISE NOTICE 'Found user: %', v_user_id;

  -- Find team IDs
  SELECT id INTO v_west_ham_team_id FROM teams WHERE name ILIKE '%West Ham%' LIMIT 1;
  SELECT id INTO v_nottingham_team_id FROM teams WHERE name ILIKE '%Nottingham%' LIMIT 1;

  IF v_west_ham_team_id IS NULL THEN
    RAISE EXCEPTION 'West Ham team not found';
  END IF;
  IF v_nottingham_team_id IS NULL THEN
    RAISE EXCEPTION 'Nottingham Forest team not found';
  END IF;

  RAISE NOTICE 'West Ham team ID: %', v_west_ham_team_id;
  RAISE NOTICE 'Nottingham Forest team ID: %', v_nottingham_team_id;

  -- Process each team for THIS USER ONLY
  FOR v_position_id, v_current_team_id IN 
    SELECT id, team_id 
    FROM positions 
    WHERE user_id = v_user_id  -- CRITICAL: Only this user's positions
      AND team_id IN (v_west_ham_team_id, v_nottingham_team_id)
  LOOP
    RAISE NOTICE '';
    RAISE NOTICE 'Processing team_id: % for user: %', v_current_team_id, v_user_id;
    
    -- Reset cost basis tracking
    v_cost_basis_total_invested_cents := 0;
    v_cost_basis_total_quantity := 0;
    v_correct_total_invested_cents := 0;

    -- Process all orders chronologically (oldest first) - ONLY FOR THIS USER
    FOR v_order IN
      SELECT 
        id,
        order_type,
        quantity,
        total_amount,
        market_cap_before,
        executed_at,
        created_at
      FROM orders
      WHERE user_id = v_user_id  -- CRITICAL: Only this user's orders
        AND team_id = v_current_team_id
        AND status = 'FILLED'
        AND executed_at IS NOT NULL
      ORDER BY executed_at ASC, created_at ASC
    LOOP
      IF v_order.order_type = 'BUY' THEN
        -- Calculate correct purchase price from market_cap_before
        IF v_order.market_cap_before IS NOT NULL AND v_order.market_cap_before > 0 THEN
          -- Correct price per share in cents: ROUND(market_cap_before / total_shares)
          -- Match existing calculation pattern from calculate_position_total_pnl
          v_correct_price_per_share_cents := ROUND((v_order.market_cap_before::NUMERIC / v_total_shares))::BIGINT;
          
          -- Correct total amount for this order
          v_order_total_cents := v_correct_price_per_share_cents * v_order.quantity;
          
          RAISE NOTICE '  BUY Order %: quantity=%, market_cap_before=% cents, correct_price=% cents/share, correct_total=% cents (was % cents)',
            v_order.id, v_order.quantity, v_order.market_cap_before, 
            v_correct_price_per_share_cents, v_order_total_cents, v_order.total_amount;
          
          -- Add to cost basis
          v_cost_basis_total_invested_cents := v_cost_basis_total_invested_cents + v_order_total_cents;
          v_cost_basis_total_quantity := v_cost_basis_total_quantity + v_order.quantity;
          
          -- Update the order's price_per_share and total_amount to correct values
          -- CRITICAL: This UPDATE also filters by user_id implicitly through the order id
          UPDATE orders
          SET 
            price_per_share = v_correct_price_per_share_cents,
            total_amount = v_order_total_cents
          WHERE id = v_order.id;  -- Safe: order was already filtered by user_id
          
        ELSE
          RAISE WARNING '  BUY Order %: market_cap_before is NULL or 0, skipping correction', v_order.id;
          -- Use existing values if market_cap_before is missing
          v_cost_basis_total_invested_cents := v_cost_basis_total_invested_cents + v_order.total_amount;
          v_cost_basis_total_quantity := v_cost_basis_total_quantity + v_order.quantity;
        END IF;
        
      ELSIF v_order.order_type = 'SELL' THEN
        -- Calculate proportional cost basis for sold shares
        -- Match existing calculation pattern from calculate_position_total_pnl
        IF v_cost_basis_total_quantity > 0 THEN
          -- Use numeric division to avoid integer truncation, then round to nearest cent
          v_proportional_cost_cents := ROUND((v_cost_basis_total_invested_cents::NUMERIC * v_order.quantity / v_cost_basis_total_quantity))::BIGINT;
          
          RAISE NOTICE '  SELL Order %: quantity=%, proportional_cost=% cents',
            v_order.id, v_order.quantity, v_proportional_cost_cents;
          
          -- Remove from cost basis
          v_cost_basis_total_invested_cents := v_cost_basis_total_invested_cents - v_proportional_cost_cents;
          v_cost_basis_total_quantity := v_cost_basis_total_quantity - v_order.quantity;
        ELSE
          RAISE WARNING '  SELL Order %: No cost basis available, skipping', v_order.id;
        END IF;
      END IF;
    END LOOP;

    -- The correct total_invested is the remaining cost basis
    v_correct_total_invested_cents := v_cost_basis_total_invested_cents;

    RAISE NOTICE '  Final cost basis: total_invested=% cents, quantity=%', 
      v_correct_total_invested_cents, v_cost_basis_total_quantity;

    -- Update position with correct total_invested
    -- CRITICAL: This UPDATE filters by position id, which was already filtered by user_id
    UPDATE positions
    SET 
      total_invested = v_correct_total_invested_cents,
      updated_at = NOW()
    WHERE id = v_position_id;  -- Safe: position was already filtered by user_id
    
    -- Recalculate total_pnl for this position
    PERFORM calculate_position_total_pnl(v_user_id, v_current_team_id);
    
    RAISE NOTICE '  Recalculated total_pnl for position';
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Purchase price correction completed for user: %', v_user_id;
  RAISE NOTICE 'Only affected positions for West Ham and Nottingham Forest';
  RAISE NOTICE '========================================';

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error fixing purchase prices: %', SQLERRM;
END $$;

