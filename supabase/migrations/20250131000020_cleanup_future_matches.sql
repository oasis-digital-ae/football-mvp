-- Cleanup Future Matches
-- Reset future matches that were incorrectly processed back to pending
-- Clear their ledger entries and reset market caps

DO $$
DECLARE
  v_future_match_count INTEGER;
  v_affected_teams INTEGER;
BEGIN
  RAISE NOTICE 'Starting cleanup of future matches...';

  -- Step 1: Count future matches that were processed
  SELECT COUNT(*) INTO v_future_match_count
  FROM fixtures
  WHERE result IN ('home_win', 'away_win', 'draw')
    AND kickoff_at > NOW();

  RAISE NOTICE 'Found % future matches that were incorrectly processed', v_future_match_count;

  IF v_future_match_count = 0 THEN
    RAISE NOTICE 'No future matches to clean up.';
    RETURN;
  END IF;

  -- Step 2: Delete ledger entries for future matches
  DELETE FROM total_ledger
  WHERE ledger_type IN ('match_win', 'match_loss', 'match_draw')
    AND trigger_event_id IN (
      SELECT id FROM fixtures
      WHERE kickoff_at > NOW()
        AND result IN ('home_win', 'away_win', 'draw')
    );
  
  RAISE NOTICE 'Deleted ledger entries for future matches';

  -- Step 3: Delete transfers for future matches
  DELETE FROM transfers_ledger
  WHERE fixture_id IN (
    SELECT id FROM fixtures
    WHERE kickoff_at > NOW()
      AND result IN ('home_win', 'away_win', 'draw')
  );
  
  RAISE NOTICE 'Deleted transfers for future matches';

  -- Step 4: Reset future matches back to pending
  UPDATE fixtures SET
    result = 'pending',
    status = 'scheduled',
    snapshot_home_cap = NULL,
    snapshot_away_cap = NULL,
    updated_at = NOW()
  WHERE kickoff_at > NOW()
    AND result IN ('home_win', 'away_win', 'draw');
  
  RAISE NOTICE 'Reset % future matches back to pending', v_future_match_count;

  -- Step 5: Reprocess only past matches to restore correct market caps
  RAISE NOTICE 'Reprocessing past matches to restore correct market caps...';
  
  -- This will be done by the processing migration

END $$;


