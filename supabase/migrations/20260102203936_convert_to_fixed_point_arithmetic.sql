-- Convert System to Fixed-Point Arithmetic (Cents/Integers)
-- This migration converts all monetary NUMERIC columns to BIGINT (cents)
-- Eliminates rounding errors by using integer arithmetic throughout

DO $$
DECLARE
  v_total_market_cap_before NUMERIC;
  v_total_market_cap_after NUMERIC;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Starting migration: Convert to Fixed-Point Arithmetic';
  RAISE NOTICE '========================================';

  -- Step 1: Drop dependent views
  RAISE NOTICE 'Step 1: Dropping dependent views...';
  DROP VIEW IF EXISTS team_market_data CASCADE;
  DROP VIEW IF EXISTS current_team_states CASCADE;
  DROP VIEW IF EXISTS team_performance_summary CASCADE;
  RAISE NOTICE '✓ Dropped dependent views';

  -- Step 2: Convert existing data and alter column types
  RAISE NOTICE '';
  RAISE NOTICE 'Step 2: Converting data and altering column types...';

  -- Teams table
  RAISE NOTICE 'Converting teams table...';
  SELECT SUM(market_cap) INTO v_total_market_cap_before FROM teams;
  RAISE NOTICE '  Total market cap before: $%', v_total_market_cap_before;
  
  UPDATE teams SET
    market_cap = (market_cap * 100)::BIGINT,
    initial_market_cap = (initial_market_cap * 100)::BIGINT,
    launch_price = (launch_price * 100)::BIGINT;
  
  ALTER TABLE teams
    ALTER COLUMN market_cap TYPE BIGINT,
    ALTER COLUMN initial_market_cap TYPE BIGINT,
    ALTER COLUMN launch_price TYPE BIGINT;
  RAISE NOTICE '✓ Converted teams table (market_cap, initial_market_cap, launch_price)';

  -- Orders table
  RAISE NOTICE 'Converting orders table...';
  UPDATE orders SET
    price_per_share = (price_per_share * 100)::BIGINT,
    total_amount = (total_amount * 100)::BIGINT,
    market_cap_before = (market_cap_before * 100)::BIGINT,
    market_cap_after = (market_cap_after * 100)::BIGINT
  WHERE price_per_share IS NOT NULL;
  
  ALTER TABLE orders
    ALTER COLUMN price_per_share TYPE BIGINT,
    ALTER COLUMN total_amount TYPE BIGINT,
    ALTER COLUMN market_cap_before TYPE BIGINT,
    ALTER COLUMN market_cap_after TYPE BIGINT;
  RAISE NOTICE '✓ Converted orders table';

  -- Positions table
  RAISE NOTICE 'Converting positions table...';
  UPDATE positions SET
    total_invested = (total_invested * 100)::BIGINT
  WHERE total_invested IS NOT NULL;
  
  ALTER TABLE positions
    ALTER COLUMN total_invested TYPE BIGINT;
  RAISE NOTICE '✓ Converted positions table';

  -- Profiles table
  RAISE NOTICE 'Converting profiles table...';
  UPDATE profiles SET
    wallet_balance = (wallet_balance * 100)::BIGINT
  WHERE wallet_balance IS NOT NULL;
  
  ALTER TABLE profiles
    ALTER COLUMN wallet_balance TYPE BIGINT;
  RAISE NOTICE '✓ Converted profiles table';

  -- Total ledger table
  RAISE NOTICE 'Converting total_ledger table...';
  UPDATE total_ledger SET
    amount_transferred = (amount_transferred * 100)::BIGINT,
    price_impact = (price_impact * 100)::BIGINT,
    market_cap_before = (market_cap_before * 100)::BIGINT,
    market_cap_after = (market_cap_after * 100)::BIGINT,
    share_price_before = (share_price_before * 100)::BIGINT,
    share_price_after = (share_price_after * 100)::BIGINT
  WHERE amount_transferred IS NOT NULL;
  
  ALTER TABLE total_ledger
    ALTER COLUMN amount_transferred TYPE BIGINT,
    ALTER COLUMN price_impact TYPE BIGINT,
    ALTER COLUMN market_cap_before TYPE BIGINT,
    ALTER COLUMN market_cap_after TYPE BIGINT,
    ALTER COLUMN share_price_before TYPE BIGINT,
    ALTER COLUMN share_price_after TYPE BIGINT;
  RAISE NOTICE '✓ Converted total_ledger table';

  -- Fixtures table
  RAISE NOTICE 'Converting fixtures table...';
  UPDATE fixtures SET
    snapshot_home_cap = (snapshot_home_cap * 100)::BIGINT,
    snapshot_away_cap = (snapshot_away_cap * 100)::BIGINT
  WHERE snapshot_home_cap IS NOT NULL AND snapshot_away_cap IS NOT NULL;
  
  ALTER TABLE fixtures
    ALTER COLUMN snapshot_home_cap TYPE BIGINT,
    ALTER COLUMN snapshot_away_cap TYPE BIGINT;
  RAISE NOTICE '✓ Converted fixtures table';

  -- Transfers ledger table
  RAISE NOTICE 'Converting transfers_ledger table...';
  UPDATE transfers_ledger SET
    transfer_amount = (transfer_amount * 100)::BIGINT
  WHERE transfer_amount IS NOT NULL;
  
  ALTER TABLE transfers_ledger
    ALTER COLUMN transfer_amount TYPE BIGINT;
  RAISE NOTICE '✓ Converted transfers_ledger table';

  -- Step 3: Verify conversion
  RAISE NOTICE '';
  RAISE NOTICE 'Step 3: Verifying conversion...';
  SELECT SUM(market_cap) INTO v_total_market_cap_after FROM teams;
  RAISE NOTICE '  Total market cap after: % cents ($%)', v_total_market_cap_after, (v_total_market_cap_after / 100.0);
  
  IF ABS((v_total_market_cap_before * 100) - v_total_market_cap_after) > 1 THEN
    RAISE WARNING '⚠ Data conversion drift detected: Expected %, got %', (v_total_market_cap_before * 100), v_total_market_cap_after;
  ELSE
    RAISE NOTICE '✓ Conversion verified: No data loss';
  END IF;

  -- Step 4: Recreate views with cent-to-dollar conversions
  RAISE NOTICE '';
  RAISE NOTICE 'Step 4: Recreating views with cent-to-dollar conversions...';

  -- Recreate current_team_states view (convert cents to dollars)
  CREATE OR REPLACE VIEW current_team_states AS
  SELECT DISTINCT ON (team_id) 
    team_id,
    (market_cap_after / 100.0)::NUMERIC(15,2) AS current_market_cap,
    shares_outstanding_after AS current_shares_outstanding,
    (share_price_after / 100.0)::NUMERIC(10,2) AS current_share_price,
    event_date AS last_updated
  FROM total_ledger
  ORDER BY team_id, event_date DESC;
  RAISE NOTICE '✓ Recreated current_team_states view';

  -- Recreate team_market_data view (convert cents to dollars)
  CREATE OR REPLACE VIEW team_market_data AS
  SELECT 
    id,
    name,
    short_name,
    external_id,
    logo_url,
    (launch_price / 100.0)::NUMERIC(10,2) AS launch_price,
    (initial_market_cap / 100.0)::NUMERIC(15,2) AS initial_market_cap,
    (market_cap / 100.0)::NUMERIC(15,2) AS market_cap,
    shares_outstanding,
    CASE
      WHEN shares_outstanding > 0 THEN ((market_cap / shares_outstanding) / 100.0)::NUMERIC(10,2)
      ELSE 20.00
    END AS current_price,
    is_tradeable,
    created_at,
    updated_at
  FROM teams t;
  RAISE NOTICE '✓ Recreated team_market_data view';

  -- Recreate team_performance_summary view (convert cents to dollars)
  CREATE OR REPLACE VIEW team_performance_summary AS
  SELECT 
    t.id AS team_id,
    t.name AS team_name,
    (t.initial_market_cap / 100.0)::NUMERIC(15,2) AS initial_market_cap,
    (cls.current_market_cap)::NUMERIC(15,2) AS current_market_cap,
    cls.current_shares_outstanding,
    (cls.current_share_price)::NUMERIC(10,2) AS current_share_price,
    cls.last_updated,
    ((cls.current_market_cap * 100) - t.initial_market_cap) / 100.0 AS total_market_cap_change,
    ROUND((((cls.current_market_cap * 100) - t.initial_market_cap) / t.initial_market_cap) * 100, 2) AS market_cap_change_percent,
    (SELECT COUNT(*) FROM total_ledger WHERE total_ledger.team_id = t.id AND total_ledger.ledger_type = 'match_win') AS wins,
    (SELECT COUNT(*) FROM total_ledger WHERE total_ledger.team_id = t.id AND total_ledger.ledger_type = 'match_loss') AS losses,
    (SELECT COUNT(*) FROM total_ledger WHERE total_ledger.team_id = t.id AND total_ledger.ledger_type = 'match_draw') AS draws,
    (SELECT COUNT(*) FROM total_ledger WHERE total_ledger.team_id = t.id AND total_ledger.ledger_type = 'share_purchase') AS share_purchases,
    (SELECT COUNT(*) FROM total_ledger WHERE total_ledger.team_id = t.id AND total_ledger.ledger_type = 'share_sale') AS share_sales,
    (SELECT COALESCE(SUM(total_ledger.shares_traded), 0) FROM total_ledger WHERE total_ledger.team_id = t.id AND total_ledger.ledger_type IN ('share_purchase', 'share_sale')) AS total_shares_traded,
    (SELECT COALESCE(SUM(total_ledger.amount_transferred), 0) / 100.0 FROM total_ledger WHERE total_ledger.team_id = t.id AND total_ledger.ledger_type IN ('share_purchase', 'share_sale')) AS total_trade_volume
  FROM teams t
  LEFT JOIN current_team_states cls ON t.id = cls.team_id
  ORDER BY cls.current_market_cap DESC;
  RAISE NOTICE '✓ Recreated team_performance_summary view';

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE 'All monetary values now stored as BIGINT (cents)';
  RAISE NOTICE 'Views convert cents to dollars for display';
  RAISE NOTICE '========================================';

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Migration failed: %', SQLERRM;
END $$;




