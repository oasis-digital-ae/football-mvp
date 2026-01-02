-- Complete Application Reset (v2)
-- This migration resets all trading data, user positions, wallet balances,
-- and team market caps to their initial state.
-- It also clears all match history and snapshots.

DO $$
DECLARE
  v_profile_count INTEGER;
BEGIN
  RAISE NOTICE 'Starting complete application reset (v2)...';

  -- Step 1: Delete all trading-related data
  DELETE FROM total_ledger;
  DELETE FROM wallet_transactions;
  DELETE FROM orders;
  DELETE FROM positions;
  RAISE NOTICE 'Deleted all trading ledger, wallet transactions, orders, and positions.';

  -- Step 2: Reset all user wallet balances to 0
  -- Check if the profiles table has a wallet_balance column
  SELECT count(*) INTO v_profile_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'wallet_balance';

  IF v_profile_count > 0 THEN
    UPDATE profiles SET wallet_balance = 0.00, updated_at = NOW();
    RAISE NOTICE 'Reset all user wallet balances to 0.';
  ELSE
    RAISE NOTICE 'profiles.wallet_balance column not found, skipping wallet balance reset.';
  END IF;

  -- Step 3: Reset all teams to initial state ($5,000 market cap, 1000 shares @ $5/share)
  UPDATE teams SET
    market_cap = 5000.00,
    initial_market_cap = 5000.00,
    total_shares = 1000,
    available_shares = 1000,
    shares_outstanding = 1000,
    launch_price = 5.00,
    updated_at = NOW();
  RAISE NOTICE 'Reset all teams to $5,000 market cap and 1000 shares at $5/share.';

  -- Step 4: Clear all snapshot values from fixtures
  UPDATE fixtures
  SET snapshot_home_cap = NULL, snapshot_away_cap = NULL, updated_at = NOW();
  RAISE NOTICE 'Cleared all fixture snapshots.';

  -- Step 5: Reset all fixture results to 'pending'
  UPDATE fixtures
  SET result = 'pending', home_score = NULL, away_score = NULL, status = 'scheduled', updated_at = NOW()
  WHERE result != 'pending';
  RAISE NOTICE 'Reset all fixture results to pending.';

  RAISE NOTICE 'Complete application reset (v2) finished.';
END $$;


