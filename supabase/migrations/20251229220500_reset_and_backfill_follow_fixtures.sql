-- Reset and Backfill Following Fixture Table Data
-- This migration:
-- 1. Resets all trading data to initial state
-- 2. Processes fixtures EXACTLY as they appear in the fixture table, chronologically
-- 3. For each fixture with scores, captures snapshot and processes match
-- 4. Uses 4-decimal precision functions for all calculations

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
  RAISE NOTICE 'Starting: Reset and backfill following fixture table data...';
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

  -- Clear all snapshot values from fixtures (will be recaptured during processing)
  UPDATE fixtures
  SET snapshot_home_cap = NULL, snapshot_away_cap = NULL, updated_at = NOW();
  RAISE NOTICE 'Cleared all fixture snapshots (will be recaptured during processing).';

  -- Get initial total market cap
  SELECT SUM(market_cap) INTO v_total_market_cap_before FROM teams;
  RAISE NOTICE 'Initial total market cap: $%', v_total_market_cap_before;

  -- ============================================
  -- STEP 2: PROCESS FIXTURES FROM FIXTURE TABLE CHRONOLOGICALLY
  -- ============================================
  RAISE NOTICE 'Step 2: Processing fixtures from fixture table chronologically...';
  RAISE NOTICE 'Following fixture table data exactly - processing all fixtures with scores in order...';

  -- Process ALL fixtures that have scores, in chronological order
  -- This follows the fixture table data exactly
  FOR v_fixture IN
    SELECT 
      id, 
      home_team_id, 
      away_team_id, 
      kickoff_at, 
      home_score, 
      away_score,
      result -- Use existing result if set, otherwise calculate from scores
    FROM fixtures
    WHERE home_score IS NOT NULL 
      AND away_score IS NOT NULL
      AND kickoff_at <= v_current_time -- Only past matches
    ORDER BY kickoff_at ASC -- Process chronologically
  LOOP
    BEGIN
      -- Calculate result from scores (if not already set)
      IF v_fixture.result IS NULL OR v_fixture.result = 'pending' THEN
        IF v_fixture.home_score > v_fixture.away_score THEN
          v_calculated_result := 'home_win';
        ELSIF v_fixture.away_score > v_fixture.home_score THEN
          v_calculated_result := 'away_win';
        ELSE
          v_calculated_result := 'draw';
        END IF;
      ELSE
        -- Use existing result from fixture table
        v_calculated_result := v_fixture.result;
      END IF;

      -- CRITICAL: Capture current market caps as snapshots BEFORE processing
      -- This ensures we use the market cap state at the time of this match
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

      RAISE NOTICE 'Processing fixture % (Kickoff: %, Score: %-%, Result: %)...', 
        v_fixture.id, v_fixture.kickoff_at, v_fixture.home_score, v_fixture.away_score, v_calculated_result;
      RAISE NOTICE '  Snapshot - Home: $%, Away: $%', v_home_cap, v_away_cap;

      -- Call the atomic match result processing function (uses 4-decimal precision)
      SELECT process_match_result_atomic(v_fixture.id) INTO v_result;

      IF (v_result->>'success')::boolean THEN
        v_processed_count := v_processed_count + 1;
        
        -- Log transfer amount for non-draw matches
        IF v_calculated_result != 'draw' THEN
          RAISE NOTICE '  ✓ Successfully processed. Transfer amount: %', v_result->>'transfer_amount';
        ELSE
          RAISE NOTICE '  ✓ Successfully processed (draw - no transfer)';
        END IF;
      ELSE
        v_error_count := v_error_count + 1;
        RAISE WARNING '  ✗ Failed to process. Error: %', v_result->>'error';
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        v_error_count := v_error_count + 1;
        RAISE WARNING 'Error processing fixture ID %: %', v_fixture.id, SQLERRM;
    END;
  END LOOP;

  -- ============================================
  -- STEP 3: VERIFY CONSERVATION
  -- ============================================
  SELECT SUM(market_cap) INTO v_total_market_cap_after FROM teams;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Reset and backfill completed!';
  RAISE NOTICE 'Processed: % fixtures from fixture table', v_processed_count;
  RAISE NOTICE 'Errors: % fixtures', v_error_count;
  RAISE NOTICE 'Initial total market cap: $%', v_total_market_cap_before;
  RAISE NOTICE 'Final total market cap: $%', v_total_market_cap_after;
  RAISE NOTICE 'Market cap change: $%', (v_total_market_cap_after - v_total_market_cap_before);
  
  -- Verify conservation (should still be $100,000)
  IF ABS(v_total_market_cap_after - 100000.00) <= 0.01 THEN
    RAISE NOTICE '✓ Perfect conservation verified: Total = $100,000.00';
  ELSE
    RAISE WARNING '⚠ Conservation violation: Expected $100,000.00, got $%', v_total_market_cap_after;
  END IF;

  RAISE NOTICE 'All calculations use 4-decimal precision internally, rounded to 2 decimals for storage.';
  RAISE NOTICE 'Finished: Reset and backfill following fixture table data.';

END $$;


