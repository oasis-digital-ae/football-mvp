-- Backfill All Fixtures with Scores (Regardless of Kickoff Time)
-- Processes all fixtures that have scores, setting results and updating market caps
-- This is useful for historical data or simulated matches

DO $$
DECLARE
  v_fixture RECORD;
  v_processed_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_result JSON;
  v_home_cap NUMERIC;
  v_away_cap NUMERIC;
  v_calculated_result TEXT;
  v_total_market_cap NUMERIC;
BEGIN
  RAISE NOTICE 'Starting: Backfill all fixtures with scores...';

  -- Step 1: Set results and capture snapshots for all fixtures with scores
  RAISE NOTICE 'Step 1: Setting results based on scores (all fixtures with scores)...';
  
  FOR v_fixture IN
    SELECT id, home_team_id, away_team_id, home_score, away_score, kickoff_at, result
    FROM fixtures
    WHERE home_score IS NOT NULL 
      AND away_score IS NOT NULL
      AND result = 'pending'
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

  RAISE NOTICE 'Step 1 complete: Results set for all fixtures with scores.';

  -- Step 2: Process all completed matches chronologically (regardless of kickoff time)
  RAISE NOTICE 'Step 2: Processing all completed matches chronologically...';

  FOR v_fixture IN
    SELECT id, result, home_team_id, away_team_id, kickoff_at, home_score, away_score
    FROM fixtures
    WHERE result IN ('home_win', 'away_win', 'draw')
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
  SELECT SUM(market_cap) INTO v_total_market_cap FROM teams;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Backfill completed!';
  RAISE NOTICE 'Processed: % matches', v_processed_count;
  RAISE NOTICE 'Errors: % matches', v_error_count;
  RAISE NOTICE 'Total market cap: $%', v_total_market_cap;
  
  -- Verify conservation (should still be $100,000)
  IF ABS(v_total_market_cap - 100000.00) <= 0.01 THEN
    RAISE NOTICE 'Perfect conservation verified: Total = $100,000.00';
  ELSE
    RAISE WARNING 'Conservation violation: Expected $100,000.00, got $%', v_total_market_cap;
  END IF;

END $$;


