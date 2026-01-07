-- Disable Old Trigger and Reprocess with Atomic Function
-- The old trigger processes matches but doesn't use the atomic function with conservation
-- We'll disable it temporarily, clear old entries, and reprocess with the atomic function

DO $$
BEGIN
  -- Step 1: Disable the old trigger temporarily
  ALTER TABLE fixtures DISABLE TRIGGER fixture_result_trigger;
  RAISE NOTICE 'Disabled old fixture_result_trigger';
  
  -- Step 2: Clear old match entries from total_ledger and transfers_ledger
  -- These were created by the old trigger without proper conservation
  DELETE FROM total_ledger WHERE ledger_type IN ('match_win', 'match_loss', 'match_draw');
  DELETE FROM transfers_ledger;
  RAISE NOTICE 'Cleared old match entries from ledgers';
  
  -- Step 3: Reset all team market caps to initial state
  UPDATE teams SET
    market_cap = 5000.00,
    updated_at = NOW();
  RAISE NOTICE 'Reset all teams to $5,000 market cap';
  
  -- Step 4: Clear snapshots so they're recaptured chronologically
  UPDATE fixtures SET
    snapshot_home_cap = NULL,
    snapshot_away_cap = NULL,
    updated_at = NOW()
  WHERE snapshot_home_cap IS NOT NULL OR snapshot_away_cap IS NOT NULL;
  RAISE NOTICE 'Cleared all fixture snapshots';
  
END $$;

-- Note: The trigger will be re-enabled after reprocessing, or we can update it to use the atomic function





