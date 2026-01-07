-- Reset and Backfill with 4-Decimal Precision
-- This migration:
-- 1. Resets all trading data to initial state
-- 2. Processes all completed matches chronologically using the new 4-decimal precision functions
-- 3. Ensures all market caps are calculated with 4-decimal precision internally

DO $$
DECLARE
  v_fixture RECORD;
  v_processed_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_result JSON;
  v_home_cap NUMERIC;
  v_away_cap NUMERIC;
  v_calculated_result TEXT;
  v_total_market_cap_before NUMERIC;
  v_total_market_cap_after NUMERIC;
  v_current_time TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
  RAISE NOTICE 'Starting: Complete reset and backfill with 4-decimal precision...';
  RAISE NOTICE 'Current time: %', v_current_time;

  -- ============================================
  -- STEP 1: RESET ALL TRADING DATA
  -- ============================================
  RAISE NOTICE 'Step 1: Resetting all trading data...';
  
  -- Delete all trading-related data
  DELETE FROM total_ledger;
  DELETE FROM transfers_ledger;
  DELETE FROM wallet_transactions;
  DELETE FROM orders;
  DELETE FROM positions;
  RAISE NOTICE 'Deleted all trading ledger, transfers, wallet transactions, orders, and positions.';

  -- Reset all user wallet balances to 0
  UPDATE profiles SET wallet_balance = 0.00, updated_at = NOW();
  RAISE NOTICE 'Reset all user wallet balances to 0.';

  -- Reset all teams to initial state ($5,000 market cap, 1000 shares @ $5/share)
  UPDATE teams SET
    market_cap = 5000.00,
    initial_market_cap = 5000.00,
    total_shares = 1000,
    available_shares = 1000,
    shares_outstanding = 1000,
    launch_price = 5.00,
    updated_at = NOW();
  RAISE NOTICE 'Reset all teams to $5,000 market cap and 1000 shares at $5/share.';

  -- Clear all snapshot values from fixtures
  UPDATE fixtures
  SET snapshot_home_cap = NULL, snapshot_away_cap = NULL, updated_at = NOW();
  RAISE NOTICE 'Cleared all fixture snapshots.';

  -- Reset all fixture results to 'pending' (we'll set them again based on scores)
  UPDATE fixtures
  SET result = 'pending', status = 'scheduled', updated_at = NOW();
  RAISE NOTICE 'Reset all fixture results to pending.';

  -- Get initial total market cap
  SELECT SUM(market_cap) INTO v_total_market_cap_before FROM teams;
  RAISE NOTICE 'Initial total market cap: $%', v_total_market_cap_before;

  -- ============================================
  -- STEP 2: SET RESULTS FOR PAST MATCHES WITH SCORES
  -- ============================================
  RAISE NOTICE 'Step 2: Setting results for past fixtures with scores...';
  
  FOR v_fixture IN
    SELECT id, home_team_id, away_team_id, home_score, away_score, kickoff_at, result
    FROM fixtures
    WHERE home_score IS NOT NULL 
      AND away_score IS NOT NULL
      AND result = 'pending'
      AND kickoff_at <= v_current_time -- Only past matches
    ORDER BY kickoff_at ASC
  LOOP
    -- Calculate result from scores
    IF v_fixture.home_score > v_fixture.away_score THEN
      v_calculated_result := 'home_win';
    ELSIF v_fixture.away_score > v_fixture.home_score THEN
      v_calculated_result := 'away_win';
    ELSE
      v_calculated_result := 'draw';
    END IF;

    -- Capture current market caps as snapshots BEFORE setting result
    SELECT market_cap INTO v_home_cap FROM teams WHERE id = v_fixture.home_team_id;
    SELECT market_cap INTO v_away_cap FROM teams WHERE id = v_fixture.away_team_id;

    -- Update fixture with result and snapshots
    UPDATE fixtures SET
      result = v_calculated_result,
      snapshot_home_cap = v_home_cap,
      snapshot_away_cap = v_away_cap,
      status = 'applied',
      updated_at = NOW()
    WHERE id = v_fixture.id;

    RAISE NOTICE 'Fixture %: Set result to % (score: %-%)', 
      v_fixture.id, v_calculated_result, v_fixture.home_score, v_fixture.away_score;
  END LOOP;

  RAISE NOTICE 'Step 2 complete: Results set for all past fixtures with scores.';

  -- ============================================
  -- STEP 3: PROCESS ALL COMPLETED MATCHES CHRONOLOGICALLY
  -- ============================================
  RAISE NOTICE 'Step 3: Processing all completed matches chronologically with 4-decimal precision...';

  FOR v_fixture IN
    SELECT 
      f.id, 
      f.result, 
      f.home_team_id, 
      f.away_team_id, 
      f.kickoff_at, 
      f.home_score, 
      f.away_score,
      f.snapshot_home_cap,
      f.snapshot_away_cap
    FROM fixtures f
    WHERE f.result IN ('home_win', 'away_win', 'draw')
      AND f.kickoff_at <= v_current_time -- Only past matches
    ORDER BY f.kickoff_at ASC
  LOOP
    BEGIN
      -- Ensure snapshots exist (capture if missing)
      IF v_fixture.snapshot_home_cap IS NULL OR v_fixture.snapshot_away_cap IS NULL THEN
        SELECT market_cap INTO v_home_cap FROM teams WHERE id = v_fixture.home_team_id;
        SELECT market_cap INTO v_away_cap FROM teams WHERE id = v_fixture.away_team_id;
        
        UPDATE fixtures SET
          snapshot_home_cap = v_home_cap,
          snapshot_away_cap = v_away_cap,
          updated_at = NOW()
        WHERE id = v_fixture.id;
        
        RAISE NOTICE 'Fixture %: Captured snapshots - Home: $%, Away: $%', 
          v_fixture.id, v_home_cap, v_away_cap;
      END IF;

      RAISE NOTICE 'Processing fixture % (ID: %, Result: %, Score: %-%)...', 
        v_fixture.kickoff_at, v_fixture.id, v_fixture.result, 
        COALESCE(v_fixture.home_score, 0), COALESCE(v_fixture.away_score, 0);

      -- Call the atomic match result processing function (now uses 4-decimal precision)
      SELECT process_match_result_atomic(v_fixture.id) INTO v_result;

      IF (v_result->>'success')::boolean THEN
        v_processed_count := v_processed_count + 1;
        
        -- Log transfer amount for non-draw matches
        IF v_fixture.result != 'draw' THEN
          RAISE NOTICE 'Successfully processed fixture % (ID: %). Transfer amount: %',
                        v_fixture.result, v_fixture.id, v_result->>'transfer_amount';
        ELSE
          RAISE NOTICE 'Successfully processed draw fixture (ID: %)', v_fixture.id;
        END IF;
      ELSE
        v_error_count := v_error_count + 1;
        RAISE WARNING 'Failed to process fixture % (ID: %). Error: %',
                      v_fixture.result, v_fixture.id, v_result->>'error';
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        v_error_count := v_error_count + 1;
        RAISE WARNING 'Error processing fixture ID %: %', v_fixture.id, SQLERRM;
    END;
  END LOOP;

  -- ============================================
  -- STEP 4: VERIFY CONSERVATION
  -- ============================================
  SELECT SUM(market_cap) INTO v_total_market_cap_after FROM teams;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Reset and backfill completed!';
  RAISE NOTICE 'Processed: % matches', v_processed_count;
  RAISE NOTICE 'Errors: % matches', v_error_count;
  RAISE NOTICE 'Initial total market cap: $%', v_total_market_cap_before;
  RAISE NOTICE 'Final total market cap: $%', v_total_market_cap_after;
  RAISE NOTICE 'Market cap change: $%', (v_total_market_cap_after - v_total_market_cap_before);
  
  -- Verify conservation (should still be $100,000)
  IF ABS(v_total_market_cap_after - 100000.00) <= 0.01 THEN
    RAISE NOTICE '✓ Perfect conservation verified: Total = $100,000.00';
  ELSE
    RAISE WARNING '⚠ Conservation violation: Expected $100,000.00, got $%', v_total_market_cap_after;
  END IF;

  RAISE NOTICE 'All calculations now use 4-decimal precision internally, rounded to 2 decimals for storage.';
  RAISE NOTICE 'Finished: Reset and backfill with 4-decimal precision.';

END $$;





