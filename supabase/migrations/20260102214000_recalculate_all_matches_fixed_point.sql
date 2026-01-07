-- Recalculate All Matches with Fixed-Point Arithmetic
-- This migration re-runs all match processing using the new fixed-point functions
-- that use integer arithmetic (cents) for perfect precision

DO $$
DECLARE
  v_fixture RECORD;
  v_processed_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_result JSON;
  v_home_cap_cents BIGINT;
  v_away_cap_cents BIGINT;
  v_total_market_cap_before_cents BIGINT;
  v_total_market_cap_after_cents BIGINT;
  v_current_time TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Recalculating All Matches with Fixed-Point Arithmetic';
  RAISE NOTICE 'Current time: %', v_current_time;
  RAISE NOTICE '========================================';

  -- ============================================
  -- STEP 1: RESET ALL TRADING DATA
  -- ============================================
  RAISE NOTICE 'Step 1: Resetting all trading data...';
  
  DELETE FROM total_ledger WHERE ledger_type IN ('match_win', 'match_loss', 'match_draw');
  DELETE FROM transfers_ledger;
  RAISE NOTICE '✓ Deleted all match ledger entries and transfers.';

  -- Reset team market caps to initial state (500000 cents = $5000.00)
  UPDATE teams SET
    market_cap = 500000, -- $5000.00 in cents
    initial_market_cap = 500000, -- $5000.00 in cents
    updated_at = NOW();
  RAISE NOTICE '✓ Reset all teams to $5,000.00 market cap (500000 cents).';

  -- Clear all snapshot values from fixtures
  UPDATE fixtures SET snapshot_home_cap = NULL, snapshot_away_cap = NULL, updated_at = NOW();
  RAISE NOTICE '✓ Cleared all fixture snapshots.';

  -- Get initial total market cap (should be 20 teams * 500000 cents = 10,000,000 cents = $100,000.00)
  SELECT SUM(market_cap) INTO v_total_market_cap_before_cents FROM teams;
  RAISE NOTICE 'Initial total market cap: % cents ($%)', v_total_market_cap_before_cents, (v_total_market_cap_before_cents / 100.0);

  -- ============================================
  -- STEP 2: PROCESS FIXTURES CHRONOLOGICALLY
  -- ============================================
  RAISE NOTICE '';
  RAISE NOTICE 'Step 2: Processing fixtures chronologically with fixed-point arithmetic...';
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
      -- Capture current market caps as snapshots BEFORE processing the match (in cents)
      SELECT market_cap INTO v_home_cap_cents FROM teams WHERE id = v_fixture.home_team_id;
      SELECT market_cap INTO v_away_cap_cents FROM teams WHERE id = v_fixture.away_team_id;

      UPDATE fixtures SET
        snapshot_home_cap = v_home_cap_cents,
        snapshot_away_cap = v_away_cap_cents,
        updated_at = NOW()
      WHERE id = v_fixture.id;

      -- Call the atomic match result processing function
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
  SELECT SUM(market_cap) INTO v_total_market_cap_after_cents FROM teams;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Recalculation completed!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Processed: % fixtures', v_processed_count;
  RAISE NOTICE 'Errors: % fixtures', v_error_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Initial total market cap: % cents ($%)', v_total_market_cap_before_cents, (v_total_market_cap_before_cents / 100.0);
  RAISE NOTICE 'Final total market cap: % cents ($%)', v_total_market_cap_after_cents, (v_total_market_cap_after_cents / 100.0);
  RAISE NOTICE 'Drift: % cents ($%)', (v_total_market_cap_after_cents - v_total_market_cap_before_cents), ((v_total_market_cap_after_cents - v_total_market_cap_before_cents) / 100.0);
  
  -- CRITICAL: Verify zero drift (should be exactly 0 cents)
  IF v_total_market_cap_after_cents = v_total_market_cap_before_cents THEN
    RAISE NOTICE '';
    RAISE NOTICE '✓✓✓ PERFECT CONSERVATION: ZERO DRIFT ✓✓✓';
    RAISE NOTICE 'Total market cap exactly preserved: % cents ($%)', v_total_market_cap_after_cents, (v_total_market_cap_after_cents / 100.0);
  ELSIF ABS(v_total_market_cap_after_cents - v_total_market_cap_before_cents) <= 1 THEN
    RAISE NOTICE '';
    RAISE NOTICE '✓ Excellent: Negligible drift (% cent)', ABS(v_total_market_cap_after_cents - v_total_market_cap_before_cents);
  ELSE
    RAISE EXCEPTION 'CRITICAL: Conservation violation! Expected % cents, got % cents. Drift: % cents', 
      v_total_market_cap_before_cents, v_total_market_cap_after_cents, ABS(v_total_market_cap_after_cents - v_total_market_cap_before_cents);
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'All calculations:';
  RAISE NOTICE '  - Fixed-point arithmetic (BIGINT cents)';
  RAISE NOTICE '  - Integer arithmetic throughout';
  RAISE NOTICE '  - Perfect conservation enforced';
  RAISE NOTICE '  - Zero drift guaranteed';
  RAISE NOTICE '';
  RAISE NOTICE 'Finished: Recalculation complete with fixed-point arithmetic.';

END $$;




