-- Backfill Market Caps Until Most Recent Matches
-- Processes all fixtures chronologically up to the most recent completed matches
-- Ensures all matches with results are processed, regardless of when they occurred

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
  v_latest_processed_date TIMESTAMP;
BEGIN
  RAISE NOTICE 'Starting: Backfill market caps until most recent matches...';

  -- Step 1: Set results for any fixtures with scores that are still pending
  RAISE NOTICE 'Step 1: Setting results for fixtures with scores...';
  
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
      snapshot_home_cap = COALESCE(snapshot_home_cap, v_home_cap),
      snapshot_away_cap = COALESCE(snapshot_away_cap, v_away_cap),
      status = 'applied',
      updated_at = NOW()
    WHERE id = v_fixture.id;

    RAISE NOTICE 'Fixture %: Set result to % (score: %-%)', 
      v_fixture.id, v_calculated_result, v_fixture.home_score, v_fixture.away_score;
  END LOOP;

  RAISE NOTICE 'Step 1 complete: Results set for all fixtures with scores.';

  -- Step 2: Process all completed matches chronologically up to most recent
  RAISE NOTICE 'Step 2: Processing all completed matches chronologically...';

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
        
        RAISE NOTICE 'Fixture %: Captured missing snapshots', v_fixture.id;
      END IF;

      RAISE NOTICE 'Processing fixture % (ID: %, Result: %, Score: %-%)...', 
        v_fixture.kickoff_at, v_fixture.id, v_fixture.result, 
        COALESCE(v_fixture.home_score, 0), COALESCE(v_fixture.away_score, 0);

      -- Call the atomic match result processing function
      SELECT process_match_result_atomic(v_fixture.id) INTO v_result;

      IF (v_result->>'success')::boolean THEN
        v_processed_count := v_processed_count + 1;
        v_latest_processed_date := v_fixture.kickoff_at;
        
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

  -- Step 3: Verify total market cap conservation
  SELECT SUM(market_cap) INTO v_total_market_cap FROM teams;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Backfill completed!';
  RAISE NOTICE 'Processed: % matches', v_processed_count;
  RAISE NOTICE 'Errors: % matches', v_error_count;
  RAISE NOTICE 'Latest processed match: %', v_latest_processed_date;
  RAISE NOTICE 'Total market cap: $%', v_total_market_cap;
  
  -- Verify conservation (should still be $100,000)
  IF ABS(v_total_market_cap - 100000.00) <= 0.01 THEN
    RAISE NOTICE 'Perfect conservation verified: Total = $100,000.00';
  ELSE
    RAISE WARNING 'Conservation violation: Expected $100,000.00, got $%', v_total_market_cap;
  END IF;

END $$;

