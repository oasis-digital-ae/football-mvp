-- Sync and Process New Matches
-- This migration processes any matches that have scores but haven't been processed yet
-- Run this after syncing fixtures from the Football API

DO $$
DECLARE
  v_fixture RECORD;
  v_result JSON;
  v_home_cap_cents BIGINT;
  v_away_cap_cents BIGINT;
  v_processed INTEGER := 0;
  v_errors INTEGER := 0;
  v_total_before BIGINT;
  v_total_after BIGINT;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Processing New Matches';
  RAISE NOTICE '========================================';
  
  -- Get initial total market cap
  SELECT SUM(market_cap) INTO v_total_before FROM teams;
  RAISE NOTICE 'Initial total market cap: % cents ($%)', v_total_before, (v_total_before / 100.0);
  
  -- Find and process unprocessed matches
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
      AND result != 'pending'
      AND (snapshot_home_cap IS NULL OR snapshot_away_cap IS NULL)
    ORDER BY kickoff_at ASC
  LOOP
    BEGIN
      -- Capture current market caps as snapshots
      SELECT market_cap INTO v_home_cap_cents FROM teams WHERE id = v_fixture.home_team_id;
      SELECT market_cap INTO v_away_cap_cents FROM teams WHERE id = v_fixture.away_team_id;

      IF v_home_cap_cents IS NULL OR v_away_cap_cents IS NULL THEN
        RAISE WARNING 'Skipping fixture %: team market cap not found', v_fixture.id;
        v_errors := v_errors + 1;
        CONTINUE;
      END IF;

      -- Update fixture with snapshots
      UPDATE fixtures SET
        snapshot_home_cap = v_home_cap_cents,
        snapshot_away_cap = v_away_cap_cents,
        status = 'applied',
        updated_at = NOW()
      WHERE id = v_fixture.id;

      -- Process match
      SELECT process_match_result_atomic(v_fixture.id) INTO v_result;

      IF (v_result->>'success')::boolean THEN
        v_processed := v_processed + 1;
        IF v_processed % 10 = 0 THEN
          RAISE NOTICE '  Processed % matches...', v_processed;
        END IF;
      ELSE
        v_errors := v_errors + 1;
        RAISE WARNING 'Failed to process fixture %: %', v_fixture.id, v_result->>'error';
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_errors := v_errors + 1;
        RAISE WARNING 'Error processing fixture %: %', v_fixture.id, SQLERRM;
    END;
  END LOOP;
  
  -- Get final total market cap
  SELECT SUM(market_cap) INTO v_total_after FROM teams;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Processing Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Processed: % matches', v_processed;
  RAISE NOTICE 'Errors: % matches', v_errors;
  RAISE NOTICE '';
  RAISE NOTICE 'Initial total market cap: % cents ($%)', v_total_before, (v_total_before / 100.0);
  RAISE NOTICE 'Final total market cap: % cents ($%)', v_total_after, (v_total_after / 100.0);
  RAISE NOTICE 'Drift: % cents ($%)', (v_total_after - v_total_before), ((v_total_after - v_total_before) / 100.0);
  
  -- Verify conservation
  IF v_total_after = v_total_before THEN
    RAISE NOTICE '';
    RAISE NOTICE '✓✓✓ PERFECT CONSERVATION: ZERO DRIFT ✓✓✓';
  ELSIF ABS(v_total_after - v_total_before) <= 1 THEN
    RAISE NOTICE '';
    RAISE NOTICE '✓ Excellent: Negligible drift (% cent)', ABS(v_total_after - v_total_before);
  ELSE
    RAISE WARNING '⚠ Conservation warning: Expected % cents, got % cents. Drift: % cents', 
      v_total_before, v_total_after, ABS(v_total_after - v_total_before);
  END IF;
  
END $$;
