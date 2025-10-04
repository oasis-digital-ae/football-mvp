-- Atomic Transaction Functions for Financial Operations
-- Ensures all-or-nothing processing of share purchases

-- Function to process share purchase atomically
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
    RAISE EXCEPTION 'Price mismatch: expected $%, got $%', v_nav, p_price_per_share;
  END IF;
  
  -- Store market cap snapshots for immutable order history
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
  
  -- Create ledger entry for audit trail
  INSERT INTO total_ledger (
    team_id, ledger_type, shares_traded, amount_transferred,
    market_cap_before, market_cap_after,
    shares_outstanding_before, shares_outstanding_after,
    share_price_before, share_price_after,
    trigger_event_type, trigger_event_id,
    event_description, created_by
  ) VALUES (
    p_team_id, 'share_purchase', p_shares, p_total_amount,
    v_market_cap_before, v_market_cap_after,
    v_shares_outstanding_before, v_shares_outstanding_after,
    v_nav, v_nav, -- NAV doesn't change with purchases
    'order', v_order_id,
    format('Share purchase: %s shares at $%s', p_shares, round(v_nav, 2)::text),
    'system'
  );
  
  -- Return success with transaction details
  RETURN json_build_object(
    'success', true,
    'order_id', v_order_id,
    'nav', v_nav,
    'total_amount', p_total_amount,
    'market_cap_before', v_market_cap_before,
    'market_cap_after', v_market_cap_after,
    'shares_outstanding_before', v_shares_outstanding_before,
    'shares_outstanding_after', v_shares_outstanding_after
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Transaction will be automatically rolled back
    RAISE EXCEPTION 'Atomic transaction failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Function to validate buy window
CREATE OR REPLACE FUNCTION is_buy_window_open(p_team_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  v_upcoming_fixtures INTEGER;
  v_buy_close_time TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Check if there are upcoming fixtures for this team
  SELECT COUNT(*), MIN(buy_close_at)
  INTO v_upcoming_fixtures, v_buy_close_time
  FROM fixtures 
  WHERE (home_team_id = p_team_id OR away_team_id = p_team_id)
    AND kickoff_at > NOW()
    AND status = 'SCHEDULED';
  
  -- If no upcoming fixtures, trading is always open
  IF v_upcoming_fixtures = 0 THEN
    RETURN TRUE;
  END IF;
  
  -- Check if current time is before buy close time
  RETURN NOW() < v_buy_close_time;
END;
$$ LANGUAGE plpgsql;

-- Function to process match result atomically
CREATE OR REPLACE FUNCTION process_match_result_atomic(p_fixture_id INTEGER)
RETURNS JSON AS $$
DECLARE
  v_fixture RECORD;
  v_home_team RECORD;
  v_away_team RECORD;
  v_transfer_amount NUMERIC;
  v_winner_team_id INTEGER;
  v_loser_team_id INTEGER;
BEGIN
  -- Get fixture with team data
  SELECT f.*, ht.market_cap as home_market_cap, at.market_cap as away_market_cap
  INTO v_fixture
  FROM fixtures f
  JOIN teams ht ON f.home_team_id = ht.id
  JOIN teams at ON f.away_team_id = at.id
  WHERE f.id = p_fixture_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fixture not found: %', p_fixture_id;
  END IF;
  
  IF v_fixture.result = 'pending' THEN
    RAISE EXCEPTION 'Cannot process pending fixture';
  END IF;
  
  -- Calculate transfer amount (10% of loser's market cap)
  IF v_fixture.result = 'home_win' THEN
    v_winner_team_id := v_fixture.home_team_id;
    v_loser_team_id := v_fixture.away_team_id;
    v_transfer_amount := v_fixture.away_market_cap * 0.10;
  ELSIF v_fixture.result = 'away_win' THEN
    v_winner_team_id := v_fixture.away_team_id;
    v_loser_team_id := v_fixture.home_team_id;
    v_transfer_amount := v_fixture.home_market_cap * 0.10;
  ELSE
    -- Draw - no transfer
    RETURN json_build_object('success', true, 'transfer_amount', 0, 'message', 'Draw - no market cap transfer');
  END IF;
  
  -- Update teams atomically
  UPDATE teams SET
    market_cap = market_cap + v_transfer_amount,
    updated_at = NOW()
  WHERE id = v_winner_team_id;
  
  UPDATE teams SET
    market_cap = GREATEST(market_cap - v_transfer_amount, 10), -- Minimum $10 market cap
    updated_at = NOW()
  WHERE id = v_loser_team_id;
  
  -- Record transfer in ledger
  INSERT INTO transfers_ledger (
    fixture_id, winner_team_id, loser_team_id, transfer_amount
  ) VALUES (
    p_fixture_id, v_winner_team_id, v_loser_team_id, v_transfer_amount
  );
  
  RETURN json_build_object(
    'success', true,
    'transfer_amount', v_transfer_amount,
    'winner_team_id', v_winner_team_id,
    'loser_team_id', v_loser_team_id
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Match result processing failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Atomic transaction functions created successfully!';
    RAISE NOTICE 'Financial operations are now atomic and race-condition safe';
END $$;
