-- Reset Trading Data and Initialize Fixed Shares Model
-- This migration resets all trading data and initializes teams with fixed 1000 shares at $20/share

-- Step 1: Delete all trading data (keep fixtures and teams structure)
DELETE FROM total_ledger WHERE ledger_type = 'share_purchase';
DELETE FROM wallet_transactions WHERE type = 'purchase';
DELETE FROM orders;
DELETE FROM positions;

-- Step 2: Reset all teams to initial state with fixed shares model
-- Market cap = $20,000 ($20/share × 1000 shares)
-- All shares owned by platform initially
UPDATE teams SET
  market_cap = 20000.00,
  initial_market_cap = 20000.00,
  total_shares = 1000,
  available_shares = 1000,
  shares_outstanding = 1000, -- Keep temporarily for migration
  launch_price = 20.00,
  updated_at = NOW();

-- Step 3: Ensure total_shares and available_shares columns exist with correct defaults
DO $$
BEGIN
  -- Add total_shares if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'total_shares'
  ) THEN
    ALTER TABLE teams ADD COLUMN total_shares integer DEFAULT 1000 NOT NULL;
  ELSE
    ALTER TABLE teams ALTER COLUMN total_shares SET DEFAULT 1000;
    ALTER TABLE teams ALTER COLUMN total_shares SET NOT NULL;
  END IF;

  -- Add available_shares if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'available_shares'
  ) THEN
    ALTER TABLE teams ADD COLUMN available_shares integer DEFAULT 1000 NOT NULL;
  ELSE
    ALTER TABLE teams ALTER COLUMN available_shares SET DEFAULT 1000;
    ALTER TABLE teams ALTER COLUMN available_shares SET NOT NULL;
  END IF;
END $$;

-- Step 4: Add constraints for fixed shares model
DO $$
BEGIN
  -- Add check constraint for total_shares = 1000 (fixed)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'teams_total_shares_fixed'
  ) THEN
    ALTER TABLE teams ADD CONSTRAINT teams_total_shares_fixed 
    CHECK (total_shares = 1000);
  END IF;

  -- Add check constraint for available_shares bounds
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'teams_available_shares_bounds'
  ) THEN
    ALTER TABLE teams ADD CONSTRAINT teams_available_shares_bounds 
    CHECK (available_shares >= 0 AND available_shares <= total_shares);
  END IF;
END $$;

-- Step 5: Reset wallet balances (optional - comment out if you want to keep user balances)
-- UPDATE profiles SET wallet_balance = 0 WHERE wallet_balance IS NOT NULL;

COMMENT ON COLUMN teams.total_shares IS 'Fixed total supply of shares (always 1000)';
COMMENT ON COLUMN teams.available_shares IS 'Platform inventory - shares available for purchase (decreases on purchase)';










