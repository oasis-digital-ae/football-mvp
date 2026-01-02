-- Backfill All Completed Matches
-- Processes all completed matches chronologically and updates market caps
-- Uses the new process_match_result_atomic function with perfect conservation

DO $$
DECLARE
  v_fixture RECORD;
  v_home_cap NUMERIC;
  v_away_cap NUMERIC;
  v_processed_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_result JSON;
  v_total_market_cap_before NUMERIC;
  v_total_market_cap_after NUMERIC;
BEGIN
  -- Get initial total market cap
  SELECT SUM(market_cap) INTO v_total_market_cap_before FROM teams;
  RAISE NOTICE 'Starting backfill. Initial total market cap: $%', v_total_market_cap_before;
  
  -- Process all completed matches chronologically
  FOR v_fixture IN 
    SELECT 
      f.id,
      f.home_team_id,
      f.away_team_id,
      f.result,
      f.kickoff_at,
      f.home_score,
      f.away_score,
      f.snapshot_home_cap,
      f.snapshot_away_cap
    FROM fixtures f
    WHERE f.result IN ('home_win', 'away_win', 'draw')
      AND f.result IS NOT NULL
    ORDER BY f.kickoff_at ASC
  LOOP
    BEGIN
      -- If snapshots don't exist, capture current market caps as snapshots
      IF v_fixture.snapshot_home_cap IS NULL OR v_fixture.snapshot_away_cap IS NULL THEN
        SELECT market_cap INTO v_home_cap FROM teams WHERE id = v_fixture.home_team_id;
        SELECT market_cap INTO v_away_cap FROM teams WHERE id = v_fixture.away_team_id;
        
        -- Update fixture with snapshots
        UPDATE fixtures SET
          snapshot_home_cap = v_home_cap,
          snapshot_away_cap = v_away_cap,
          updated_at = NOW()
        WHERE id = v_fixture.id;
        
        RAISE NOTICE 'Fixture %: Captured snapshots - Home: $%, Away: $%', 
          v_fixture.id, v_home_cap, v_away_cap;
      END IF;
      
      -- Process the match result using the atomic function
      SELECT process_match_result_atomic(v_fixture.id) INTO v_result;
      
      -- Check if processing was successful
      IF (v_result->>'success')::boolean = true THEN
        v_processed_count := v_processed_count + 1;
        
        -- Log progress every 10 matches
        IF v_processed_count % 10 = 0 THEN
          SELECT SUM(market_cap) INTO v_total_market_cap_after FROM teams;
          RAISE NOTICE 'Processed % matches. Current total market cap: $%', 
            v_processed_count, v_total_market_cap_after;
        END IF;
      ELSE
        RAISE WARNING 'Fixture % processing returned success=false: %', 
          v_fixture.id, v_result->>'message';
        v_error_count := v_error_count + 1;
      END IF;
      
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Error processing fixture %: %', v_fixture.id, SQLERRM;
        v_error_count := v_error_count + 1;
    END;
  END LOOP;
  
  -- Get final total market cap
  SELECT SUM(market_cap) INTO v_total_market_cap_after FROM teams;
  
  -- Report results
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Backfill completed!';
  RAISE NOTICE 'Processed: % matches', v_processed_count;
  RAISE NOTICE 'Errors: % matches', v_error_count;
  RAISE NOTICE 'Initial total market cap: $%', v_total_market_cap_before;
  RAISE NOTICE 'Final total market cap: $%', v_total_market_cap_after;
  RAISE NOTICE 'Market cap change: $%', (v_total_market_cap_after - v_total_market_cap_before);
  
  -- Verify conservation
  IF ABS(v_total_market_cap_after - 100000.00) <= 0.01 THEN
    RAISE NOTICE '✓ Perfect conservation verified: Total = $100,000.00';
  ELSE
    RAISE WARNING '⚠ Conservation violation: Expected $100,000.00, got $%', v_total_market_cap_after;
  END IF;
  
END $$;


