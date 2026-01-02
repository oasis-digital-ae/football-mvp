-- Re-process All Matches with Fixed Price Impact Calculation
-- This migration re-processes all matches to update price_impact values
-- using the corrected calculation (from 4-decimal prices before rounding)

DO $$
DECLARE
  v_fixture RECORD;
  v_processed_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_result JSON;
  v_home_cap NUMERIC;
  v_away_cap NUMERIC;
BEGIN
  RAISE NOTICE 'Starting: Re-processing all matches with fixed price impact calculation...';

  -- Delete all existing ledger entries (we'll regenerate them)
  DELETE FROM total_ledger WHERE ledger_type IN ('match_win', 'match_loss', 'match_draw');
  DELETE FROM transfers_ledger;
  RAISE NOTICE 'Deleted all match-related ledger entries.';

  -- Reset all teams to initial state
  UPDATE teams SET
    market_cap = 5000.00,
    initial_market_cap = 5000.00,
    updated_at = NOW();
  RAISE NOTICE 'Reset all teams to $5,000 market cap.';

  -- Process all fixtures with scores chronologically
  FOR v_fixture IN
    SELECT 
      id, 
      home_team_id, 
      away_team_id, 
      kickoff_at, 
      home_score, 
      away_score,
      result,
      snapshot_home_cap,
      snapshot_away_cap
    FROM fixtures
    WHERE home_score IS NOT NULL 
      AND away_score IS NOT NULL
      AND kickoff_at <= NOW()
    ORDER BY kickoff_at ASC
  LOOP
    BEGIN
      -- Capture current market caps as snapshots
      SELECT market_cap INTO v_home_cap FROM teams WHERE id = v_fixture.home_team_id;
      SELECT market_cap INTO v_away_cap FROM teams WHERE id = v_fixture.away_team_id;

      -- Update fixture with snapshots
      UPDATE fixtures SET
        snapshot_home_cap = v_home_cap,
        snapshot_away_cap = v_away_cap,
        updated_at = NOW()
      WHERE id = v_fixture.id;

      -- Process the match using the fixed function
      SELECT process_match_result_atomic(v_fixture.id) INTO v_result;

      IF (v_result->>'success')::boolean THEN
        v_processed_count := v_processed_count + 1;
      ELSE
        v_error_count := v_error_count + 1;
        RAISE WARNING 'Failed to process fixture %: %', v_fixture.id, v_result->>'error';
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        v_error_count := v_error_count + 1;
        RAISE WARNING 'Error processing fixture ID %: %', v_fixture.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Re-processing completed!';
  RAISE NOTICE 'Processed: % fixtures', v_processed_count;
  RAISE NOTICE 'Errors: % fixtures', v_error_count;
  RAISE NOTICE 'All price_impact values now calculated from 4-decimal prices before rounding.';

END $$;


