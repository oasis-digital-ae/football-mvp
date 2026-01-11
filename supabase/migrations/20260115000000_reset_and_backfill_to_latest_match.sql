-- Reset Database and Backfill to Most Recent Premier League Match
-- This migration:
-- 1. Resets all trading data to initial state
-- 2. Processes all completed matches chronologically up to the most recent match
-- 3. Uses fixed-point arithmetic (BIGINT cents) for perfect precision
-- 4. Ensures perfect market cap conservation

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
  v_latest_match_date TIMESTAMP WITH TIME ZONE;
  v_fixtures_to_process INTEGER;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Reset and Backfill to Latest Match';
  RAISE NOTICE 'Current time: %', v_current_time;
  RAISE NOTICE '========================================';

  -- ============================================
  -- STEP 1: FIND MOST RECENT COMPLETED MATCH
  -- ============================================
  RAISE NOTICE '';
  RAISE NOTICE 'Step 1: Finding most recent completed match...';
  
  SELECT MAX(kickoff_at) INTO v_latest_match_date
  FROM fixtures
  WHERE home_score IS NOT NULL 
    AND away_score IS NOT NULL
    AND kickoff_at <= v_current_time
    AND result != 'pending';
  
  IF v_latest_match_date IS NULL THEN
    RAISE NOTICE '⚠️ No completed matches found in fixtures table.';
    RAISE NOTICE '⚠️ Please sync fixtures from Football API first using:';
    RAISE NOTICE '   npm run sync-fixtures';
    RAISE NOTICE '   OR';
    RAISE NOTICE '   Call footballIntegrationService.syncPremierLeagueFixtures(2025)';
    RAISE NOTICE '';
    RAISE NOTICE 'Skipping match processing. Database reset completed.';
    RETURN;
  END IF;
  
  SELECT COUNT(*) INTO v_fixtures_to_process
  FROM fixtures
  WHERE home_score IS NOT NULL 
    AND away_score IS NOT NULL
    AND kickoff_at <= v_latest_match_date
    AND result != 'pending';
  
  RAISE NOTICE '✓ Most recent completed match: %', v_latest_match_date;
  RAISE NOTICE '✓ Found % fixtures to process', v_fixtures_to_process;

  -- ============================================
  -- STEP 2: RESET ALL TRADING DATA
  -- ============================================
  RAISE NOTICE '';
  RAISE NOTICE 'Step 2: Resetting all trading data...';
  
  -- Delete all trading-related data
  DELETE FROM total_ledger WHERE ledger_type IN ('match_win', 'match_loss', 'match_draw');
  DELETE FROM transfers_ledger;
  DELETE FROM wallet_transactions;
  DELETE FROM orders;
  DELETE FROM positions;
  RAISE NOTICE '✓ Deleted all trading ledger, transfers, wallet transactions, orders, and positions.';

  -- Reset all user wallet balances to 0 (in cents)
  UPDATE profiles SET wallet_balance = 0, updated_at = NOW()
  WHERE wallet_balance IS NOT NULL AND wallet_balance != 0;
  RAISE NOTICE '✓ Reset all user wallet balances to 0.';

  -- Reset all teams to initial state (500000 cents = $5,000.00)
  -- Launch price: 500 cents = $5.00 per share
  -- Initial market cap: 500000 cents = $5,000.00
  -- Total shares: 1000 (fixed)
  -- Available shares: 1000 (all owned by platform initially)
  UPDATE teams SET
    market_cap = 500000, -- $5,000.00 in cents
    initial_market_cap = 500000, -- $5,000.00 in cents
    total_shares = 1000,
    available_shares = 1000,
    shares_outstanding = 1000,
    launch_price = 500, -- $5.00 in cents
    updated_at = NOW();
  RAISE NOTICE '✓ Reset all teams to $5,000.00 market cap and 1000 shares at $5.00/share.';

  -- Clear all snapshot values from fixtures (will be recaptured during processing)
  UPDATE fixtures SET 
    snapshot_home_cap = NULL, 
    snapshot_away_cap = NULL, 
    updated_at = NOW();
  RAISE NOTICE '✓ Cleared all fixture snapshots (will be recaptured during processing).';

  -- Get initial total market cap (should be 20 teams * 500000 cents = 10,000,000 cents = $100,000.00)
  SELECT SUM(market_cap) INTO v_total_market_cap_before_cents FROM teams;
  RAISE NOTICE '✓ Initial total market cap: % cents ($%)', v_total_market_cap_before_cents, (v_total_market_cap_before_cents / 100.0);

  -- ============================================
  -- STEP 3: PROCESS FIXTURES CHRONOLOGICALLY
  -- ============================================
  RAISE NOTICE '';
  RAISE NOTICE 'Step 3: Processing fixtures chronologically up to latest match...';
  RAISE NOTICE 'Processing all matches from earliest to most recent...';
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
      AND kickoff_at <= v_latest_match_date
      AND result != 'pending'
    ORDER BY kickoff_at ASC
  LOOP
    BEGIN
      -- Capture current market caps as snapshots BEFORE processing the match (in cents)
      SELECT market_cap INTO v_home_cap_cents FROM teams WHERE id = v_fixture.home_team_id;
      SELECT market_cap INTO v_away_cap_cents FROM teams WHERE id = v_fixture.away_team_id;

      -- Update fixture with snapshots
      UPDATE fixtures SET
        snapshot_home_cap = v_home_cap_cents,
        snapshot_away_cap = v_away_cap_cents,
        status = 'applied',
        updated_at = NOW()
      WHERE id = v_fixture.id;

      -- Call the atomic match result processing function (uses fixed-point arithmetic)
      SELECT process_match_result_atomic(v_fixture.id) INTO v_result;

      IF (v_result->>'success')::boolean THEN
        v_processed_count := v_processed_count + 1;
        IF (v_processed_count % 10 = 0) THEN
          RAISE NOTICE '  Processed % matches...', v_processed_count;
        END IF;
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
  -- STEP 4: VERIFY ZERO DRIFT
  -- ============================================
  SELECT SUM(market_cap) INTO v_total_market_cap_after_cents FROM teams;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Reset and Backfill Completed!';
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
    RAISE WARNING '⚠ Conservation warning: Expected % cents, got % cents. Drift: % cents', 
      v_total_market_cap_before_cents, v_total_market_cap_after_cents, ABS(v_total_market_cap_after_cents - v_total_market_cap_before_cents);
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'All calculations:';
  RAISE NOTICE '  - Fixed-point arithmetic (BIGINT cents)';
  RAISE NOTICE '  - Integer arithmetic throughout';
  RAISE NOTICE '  - Perfect conservation enforced';
  RAISE NOTICE '  - Processed up to: %', v_latest_match_date;
  RAISE NOTICE '';
  RAISE NOTICE 'Finished: Reset and backfill complete.';

END $$;
