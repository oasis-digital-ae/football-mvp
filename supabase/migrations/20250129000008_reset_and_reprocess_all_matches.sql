-- Reset and Reprocess All Matches from $20,000 Baseline
-- This ensures all teams start at 1000 shares @ $20/share ($20,000 market cap)
-- Then processes all matches chronologically with correct snapshots

DO $$
DECLARE
  v_fixture RECORD;
  v_home_cap NUMERIC;
  v_away_cap NUMERIC;
  v_processed_count INTEGER := 0;
  v_error_count INTEGER := 0;
BEGIN
  -- Step 1: Reset all teams to initial state ($20,000 market cap, 1000 shares @ $20/share)
  UPDATE teams SET
    market_cap = 20000.00,
    initial_market_cap = 20000.00,
    total_shares = 1000,
    available_shares = 1000,
    shares_outstanding = 1000,
    launch_price = 20.00,
    updated_at = NOW();
  
  RAISE NOTICE 'Reset all teams to $20,000 market cap';
  
  -- Step 2: Delete all existing match result entries from total_ledger
  DELETE FROM total_ledger 
  WHERE ledger_type IN ('match_win', 'match_loss', 'match_draw')
    AND trigger_event_type = 'fixture';
  
  RAISE NOTICE 'Deleted existing match result entries';
  
  -- Step 3: Clear all snapshot values from fixtures
  UPDATE fixtures 
  SET snapshot_home_cap = NULL, snapshot_away_cap = NULL
  WHERE snapshot_home_cap IS NOT NULL OR snapshot_away_cap IS NOT NULL;
  
  RAISE NOTICE 'Cleared all fixture snapshots';
  
  -- Step 4: Process all completed matches chronologically
  -- For each match, we need to:
  --   a) Capture current market caps as snapshots
  --   b) Process the match result
  --   c) The function will update market caps and create ledger entries
  
  FOR v_fixture IN 
    SELECT f.id, f.result, f.home_team_id, f.away_team_id, f.kickoff_at, f.home_score, f.away_score
    FROM fixtures f
    WHERE f.result IN ('home_win', 'away_win', 'draw')
      AND f.result IS NOT NULL
      AND f.kickoff_at <= NOW()
    ORDER BY f.kickoff_at ASC
  LOOP
    BEGIN
      -- Capture current market caps as snapshots BEFORE processing
      SELECT market_cap INTO v_home_cap FROM teams WHERE id = v_fixture.home_team_id;
      SELECT market_cap INTO v_away_cap FROM teams WHERE id = v_fixture.away_team_id;
      
      -- Update fixture with snapshots
      UPDATE fixtures
      SET snapshot_home_cap = v_home_cap,
          snapshot_away_cap = v_away_cap
      WHERE id = v_fixture.id;
      
      -- Process the match result (this will update market caps and create ledger entries)
      PERFORM process_match_result_atomic(v_fixture.id);
      
      v_processed_count := v_processed_count + 1;
      
      -- Log progress every 20 matches
      IF v_processed_count % 20 = 0 THEN
        RAISE NOTICE 'Processed % matches...', v_processed_count;
      END IF;
      
    EXCEPTION
      WHEN OTHERS THEN
        v_error_count := v_error_count + 1;
        RAISE WARNING 'Error processing fixture % (kickoff: %): %', 
          v_fixture.id, v_fixture.kickoff_at, SQLERRM;
        -- Continue with next fixture
    END;
  END LOOP;
  
  RAISE NOTICE 'Match reprocessing complete: % processed, % errors', v_processed_count, v_error_count;
END $$;

-- Verify: Check a sample of entries to ensure they're correct
DO $$
DECLARE
  v_sample_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_sample_count
  FROM total_ledger tl
  JOIN fixtures f ON f.id = tl.trigger_event_id
  WHERE tl.ledger_type IN ('match_win', 'match_loss', 'match_draw')
    AND f.snapshot_home_cap IS NOT NULL
    AND f.snapshot_away_cap IS NOT NULL
    AND ABS(tl.market_cap_before - CASE 
      WHEN f.result = 'home_win' AND tl.team_id = f.home_team_id THEN f.snapshot_home_cap
      WHEN f.result = 'home_win' AND tl.team_id = f.away_team_id THEN f.snapshot_away_cap
      WHEN f.result = 'away_win' AND tl.team_id = f.home_team_id THEN f.snapshot_home_cap
      WHEN f.result = 'away_win' AND tl.team_id = f.away_team_id THEN f.snapshot_away_cap
      WHEN f.result = 'draw' AND tl.team_id = f.home_team_id THEN f.snapshot_home_cap
      WHEN f.result = 'draw' AND tl.team_id = f.away_team_id THEN f.snapshot_away_cap
      ELSE 0
    END) < 0.01;  -- Allow small rounding differences
    
  RAISE NOTICE 'Verification: % entries have correct snapshot-based values', v_sample_count;
END $$;





