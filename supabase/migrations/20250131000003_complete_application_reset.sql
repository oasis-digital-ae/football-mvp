-- Complete Application Reset
-- This migration resets the entire application to a clean initial state for testing
-- All teams reset to $5,000 market cap ($5/share × 1000 shares)
-- All trading data, positions, orders, and match results cleared
-- Total market cap will be exactly $100,000 (20 teams × $5,000)

DO $$
DECLARE
  v_team_count INTEGER;
  v_total_market_cap NUMERIC;
BEGIN
  -- Step 1: Delete all trading-related data
  RAISE NOTICE 'Deleting all trading data...';
  
  DELETE FROM total_ledger;
  DELETE FROM transfers_ledger;
  DELETE FROM wallet_transactions;
  DELETE FROM orders;
  DELETE FROM positions;
  
  RAISE NOTICE 'Deleted all trading data';
  
  -- Step 2: Reset all wallet balances to 0
  RAISE NOTICE 'Resetting wallet balances...';
  
  UPDATE profiles SET
    wallet_balance = 0.00,
    updated_at = NOW()
  WHERE wallet_balance IS NOT NULL AND wallet_balance != 0;
  
  RAISE NOTICE 'Reset all wallet balances to $0';
  
  -- Step 3: Clear all fixture snapshots
  RAISE NOTICE 'Clearing fixture snapshots...';
  
  UPDATE fixtures SET
    snapshot_home_cap = NULL,
    snapshot_away_cap = NULL,
    updated_at = NOW()
  WHERE snapshot_home_cap IS NOT NULL OR snapshot_away_cap IS NOT NULL;
  
  RAISE NOTICE 'Cleared all fixture snapshots';
  
  -- Step 4: Reset all teams to initial state
  -- Launch price: $5.00
  -- Initial market cap: $5,000 ($5/share × 1000 shares)
  -- Total shares: 1000 (fixed)
  -- Available shares: 1000 (all owned by platform initially)
  RAISE NOTICE 'Resetting all teams to initial state...';
  
  UPDATE teams SET
    launch_price = 5.00,
    initial_market_cap = 5000.00,
    market_cap = 5000.00,
    total_shares = 1000,
    available_shares = 1000,
    shares_outstanding = 1000,
    updated_at = NOW();
  
  -- Verify total market cap
  SELECT COUNT(*), SUM(market_cap) INTO v_team_count, v_total_market_cap FROM teams;
  
  RAISE NOTICE 'Reset % teams to initial state', v_team_count;
  RAISE NOTICE 'Total market cap: $% (should be $100,000 for 20 teams)', v_total_market_cap;
  
  -- Step 5: Verify conservation (should be exactly $100,000)
  IF v_team_count = 20 AND ABS(v_total_market_cap - 100000.00) > 0.01 THEN
    RAISE WARNING 'Total market cap is $% but expected $100,000.00', v_total_market_cap;
  ELSIF v_team_count = 20 AND ABS(v_total_market_cap - 100000.00) <= 0.01 THEN
    RAISE NOTICE '✓ Total market cap verified: $100,000.00 (perfect conservation)';
  END IF;
  
  RAISE NOTICE 'Complete application reset finished successfully';
  
END $$;

COMMENT ON FUNCTION process_match_result_atomic IS 'After reset: All teams at $5,000 market cap ($5/share). Total market cap = $100,000. All trading data cleared. Ready for fresh testing.';


