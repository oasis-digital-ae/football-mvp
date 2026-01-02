-- Set Results from Scores and Backfill Market Caps
-- This migration:
-- 1. Sets result field based on home_score and away_score for fixtures with scores
-- 2. Captures market cap snapshots for those fixtures
-- 3. Processes all completed matches chronologically to update market caps

DO $$
DECLARE
  v_fixture RECORD;
  v_processed_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_result JSON;
  v_home_cap NUMERIC;
  v_away_cap NUMERIC;
  v_calculated_result TEXT;
BEGIN
  RAISE NOTICE 'Starting: Set results from scores and backfill market caps...';

  -- Step 1: Update fixtures with scores to have correct result field
  RAISE NOTICE 'Step 1: Setting results based on scores...';
  
  FOR v_fixture IN
    SELECT id, home_team_id, away_team_id, home_score, away_score, kickoff_at
    FROM fixtures
    WHERE home_score IS NOT NULL 
      AND away_score IS NOT NULL
      AND result = 'pending'
      AND kickoff_at <= NOW()
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

  RAISE NOTICE 'Step 1 complete: Results set for fixtures with scores.';

  -- Step 2: Process all completed matches chronologically
  RAISE NOTICE 'Step 2: Processing completed matches chronologically...';

  FOR v_fixture IN
    SELECT id, result, home_team_id, away_team_id, kickoff_at, home_score, away_score
    FROM fixtures
    WHERE result IN ('home_win', 'away_win', 'draw')
      AND kickoff_at <= NOW()
    ORDER BY kickoff_at ASC
  LOOP
    BEGIN
      RAISE NOTICE 'Processing fixture % (ID: %, Result: %)...', 
        v_fixture.kickoff_at, v_fixture.id, v_fixture.result;

      -- Call the atomic match result processing function
      SELECT process_match_result_atomic(v_fixture.id) INTO v_result;

      IF (v_result->>'success')::boolean THEN
        v_processed_count := v_processed_count + 1;
        RAISE NOTICE 'Successfully processed fixture % (ID: %). Transfer amount: %',
                      v_fixture.result, v_fixture.id, v_result->>'transfer_amount';
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

  -- Step 3: Verify total market cap conservation
  DECLARE
    v_total_market_cap NUMERIC;
  BEGIN
    SELECT SUM(market_cap) INTO v_total_market_cap FROM teams;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Backfill completed!';
    RAISE NOTICE 'Processed: % matches', v_processed_count;
    RAISE NOTICE 'Errors: % matches', v_error_count;
    RAISE NOTICE 'Total market cap: $%', v_total_market_cap;
    
    -- Verify conservation (should still be $100,000)
    IF ABS(v_total_market_cap - 100000.00) <= 0.01 THEN
      RAISE NOTICE '✓ Perfect conservation verified: Total = $100,000.00';
    ELSE
      RAISE WARNING '⚠ Conservation violation: Expected $100,000.00, got $%', v_total_market_cap;
    END IF;
  END;

END $$;

