-- Backfill All Completed Matches (v2)
-- This migration processes all fixtures that have a result (home_win, away_win, draw)
-- chronologically, updating team market caps and creating ledger entries.
-- It uses the process_match_result_atomic function to ensure conservation.

DO $$
DECLARE
  v_fixture RECORD;
  v_processed_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_result JSON;
BEGIN
  RAISE NOTICE 'Starting backfill of all completed matches (v2)...';

  -- Ensure all teams are at their initial state before backfill
  UPDATE teams SET
    market_cap = 5000.00,
    initial_market_cap = 5000.00,
    total_shares = 1000,
    available_shares = 1000,
    shares_outstanding = 1000,
    launch_price = 5.00,
    updated_at = NOW();
  RAISE NOTICE 'Ensured all teams are reset to initial $5,000 market cap.';

  -- Clear existing match-related ledger entries and transfers to prevent duplicates
  DELETE FROM total_ledger WHERE ledger_type IN ('match_win', 'match_loss', 'match_draw');
  DELETE FROM transfers_ledger;
  RAISE NOTICE 'Cleared existing match ledger entries and transfers.';

  -- Clear all snapshot values from fixtures to ensure fresh snapshots are taken
  UPDATE fixtures
  SET snapshot_home_cap = NULL, snapshot_away_cap = NULL, updated_at = NOW();
  RAISE NOTICE 'Cleared all fixture snapshots.';

  -- Loop through all fixtures that have a result and process them chronologically
  FOR v_fixture IN
    SELECT id, result, home_team_id, away_team_id, kickoff_at, home_score, away_score
    FROM fixtures
    WHERE result IN ('home_win', 'away_win', 'draw')
      AND kickoff_at <= NOW() -- Only process matches that have already happened
    ORDER BY kickoff_at ASC
  LOOP
    BEGIN
      RAISE NOTICE 'Processing fixture % (ID: %)...', v_fixture.result, v_fixture.id;

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

  RAISE NOTICE 'Backfill completed. Processed % matches, % errors.', v_processed_count, v_error_count;
END $$;





