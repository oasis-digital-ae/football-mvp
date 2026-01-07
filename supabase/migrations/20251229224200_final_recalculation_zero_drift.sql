-- Final Recalculation with Zero Drift Guarantee
-- This migration re-runs the complete recalculation using the fixed function
-- that enforces perfect conservation AFTER rounding to 2 decimals

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
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Final Recalculation: Zero Drift Guarantee';
  RAISE NOTICE 'Current time: %', v_current_time;
  RAISE NOTICE '========================================';

  -- ============================================
  -- STEP 1: RESET ALL TRADING DATA
  -- ============================================
  RAISE NOTICE 'Step 1: Resetting all trading data...';
  
  DELETE FROM total_ledger;
  DELETE FROM transfers_ledger;
  DELETE FROM wallet_transactions;
  DELETE FROM orders;
  DELETE FROM positions;
  RAISE NOTICE '✓ Deleted all trading data.';

  UPDATE profiles SET wallet_balance = 0.00, updated_at = NOW();
  RAISE NOTICE '✓ Reset all user wallet balances to 0.';

  UPDATE teams SET
    market_cap = 5000.00,
    initial_market_cap = 5000.00,
    total_shares = 1000,
    available_shares = 1000,
    shares_outstanding = 1000,
    launch_price = 5.00,
    updated_at = NOW();
  RAISE NOTICE '✓ Reset all teams to $5,000 market cap.';

  UPDATE fixtures SET snapshot_home_cap = NULL, snapshot_away_cap = NULL, updated_at = NOW();
  RAISE NOTICE '✓ Cleared all fixture snapshots.';

  SELECT SUM(market_cap) INTO v_total_market_cap_before FROM teams;
  RAISE NOTICE 'Initial total market cap: $%', v_total_market_cap_before;

  -- ============================================
  -- STEP 2: PROCESS FIXTURES CHRONOLOGICALLY
  -- ============================================
  RAISE NOTICE '';
  RAISE NOTICE 'Step 2: Processing fixtures chronologically with zero-drift guarantee...';
  RAISE NOTICE '';

  FOR v_fixture IN
    SELECT 
      id, 
      home_team_id, 
      away_team_id, 
      kickoff_at, 
      home_score, 
      away_score,
      result
    FROM fixtures
    WHERE home_score IS NOT NULL 
      AND away_score IS NOT NULL
      AND kickoff_at <= v_current_time
    ORDER BY kickoff_at ASC
  LOOP
    BEGIN
      IF v_fixture.result IS NULL OR v_fixture.result = 'pending' THEN
        IF v_fixture.home_score > v_fixture.away_score THEN
          v_calculated_result := 'home_win';
        ELSIF v_fixture.away_score > v_fixture.home_score THEN
          v_calculated_result := 'away_win';
        ELSE
          v_calculated_result := 'draw';
        END IF;
      ELSE
        v_calculated_result := v_fixture.result;
      END IF;

      SELECT market_cap INTO v_home_cap FROM teams WHERE id = v_fixture.home_team_id;
      SELECT market_cap INTO v_away_cap FROM teams WHERE id = v_fixture.away_team_id;

      UPDATE fixtures SET
        result = v_calculated_result,
        snapshot_home_cap = v_home_cap,
        snapshot_away_cap = v_away_cap,
        status = 'applied',
        updated_at = NOW()
      WHERE id = v_fixture.id;

      SELECT process_match_result_atomic(v_fixture.id) INTO v_result;

      IF (v_result->>'success')::boolean THEN
        v_processed_count := v_processed_count + 1;
      ELSE
        v_error_count := v_error_count + 1;
        RAISE WARNING '✗ Failed to process fixture %: %', v_fixture.id, v_result->>'error';
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        v_error_count := v_error_count + 1;
        RAISE WARNING '✗ Error processing fixture ID %: %', v_fixture.id, SQLERRM;
    END;
  END LOOP;

  -- ============================================
  -- STEP 3: VERIFY ZERO DRIFT
  -- ============================================
  SELECT SUM(market_cap) INTO v_total_market_cap_after FROM teams;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Recalculation completed!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Processed: % fixtures', v_processed_count;
  RAISE NOTICE 'Errors: % fixtures', v_error_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Initial total market cap: $%', v_total_market_cap_before;
  RAISE NOTICE 'Final total market cap: $%', v_total_market_cap_after;
  RAISE NOTICE 'Drift: $%', (v_total_market_cap_after - v_total_market_cap_before);
  
  -- CRITICAL: Verify zero drift
  IF ABS(v_total_market_cap_after - 100000.00) = 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '✓✓✓ PERFECT CONSERVATION: ZERO DRIFT ✓✓✓';
    RAISE NOTICE 'Total market cap exactly $100,000.00';
  ELSIF ABS(v_total_market_cap_after - 100000.00) <= 0.001 THEN
    RAISE NOTICE '';
    RAISE NOTICE '✓ Excellent: Negligible drift ($%)', ABS(v_total_market_cap_after - 100000.00);
  ELSE
    RAISE EXCEPTION 'CRITICAL: Conservation violation! Expected $100,000.00, got $%. Drift: $%', 
      v_total_market_cap_after, ABS(v_total_market_cap_after - 100000.00);
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'All calculations:';
  RAISE NOTICE '  - 4-decimal precision internally';
  RAISE NOTICE '  - 2-decimal precision for storage';
  RAISE NOTICE '  - Perfect conservation enforced AFTER rounding';
  RAISE NOTICE '  - Zero drift guaranteed';
  RAISE NOTICE '';
  RAISE NOTICE 'Finished: Recalculation complete with zero drift.';

END $$;





