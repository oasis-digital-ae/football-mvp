-- Increase Precision to 4 Decimals for All Monetary Values
-- This migration increases precision from 2 decimals to 4 decimals for all monetary columns
-- This allows for more precise internal calculations while maintaining 2-decimal display
-- Existing 2-decimal values will work fine (they fit in 4-decimal columns)

DO $$
BEGIN
  RAISE NOTICE 'Starting migration: Increase precision to 4 decimals...';

  -- Step 1: Drop views that depend on columns we're altering
  RAISE NOTICE 'Dropping dependent views...';
  DROP VIEW IF EXISTS team_market_data CASCADE;
  DROP VIEW IF EXISTS current_team_states CASCADE;
  DROP VIEW IF EXISTS team_performance_summary CASCADE;
  RAISE NOTICE 'Dropped dependent views';

  -- Step 2: Alter columns
  -- Teams table
  RAISE NOTICE 'Updating teams table...';
  ALTER TABLE teams 
    ALTER COLUMN market_cap TYPE NUMERIC(15,4),
    ALTER COLUMN initial_market_cap TYPE NUMERIC(15,4),
    ALTER COLUMN launch_price TYPE NUMERIC(10,4);
  RAISE NOTICE 'Updated teams table columns';

  -- Orders table
  RAISE NOTICE 'Updating orders table...';
  ALTER TABLE orders 
    ALTER COLUMN price_per_share TYPE NUMERIC(10,4),
    ALTER COLUMN total_amount TYPE NUMERIC(15,4),
    ALTER COLUMN market_cap_before TYPE NUMERIC(15,4),
    ALTER COLUMN market_cap_after TYPE NUMERIC(15,4);
  RAISE NOTICE 'Updated orders table columns';

  -- Positions table
  RAISE NOTICE 'Updating positions table...';
  ALTER TABLE positions 
    ALTER COLUMN total_invested TYPE NUMERIC(15,4);
  RAISE NOTICE 'Updated positions table columns';

  -- Total ledger table
  RAISE NOTICE 'Updating total_ledger table...';
  ALTER TABLE total_ledger 
    ALTER COLUMN amount_transferred TYPE NUMERIC(15,4),
    ALTER COLUMN price_impact TYPE NUMERIC(15,4),
    ALTER COLUMN market_cap_before TYPE NUMERIC(15,4),
    ALTER COLUMN market_cap_after TYPE NUMERIC(15,4),
    ALTER COLUMN share_price_before TYPE NUMERIC(10,4),
    ALTER COLUMN share_price_after TYPE NUMERIC(10,4);
  RAISE NOTICE 'Updated total_ledger table columns';

  -- Profiles table
  RAISE NOTICE 'Updating profiles table...';
  ALTER TABLE profiles 
    ALTER COLUMN wallet_balance TYPE NUMERIC(15,4);
  RAISE NOTICE 'Updated profiles table columns';

  -- Fixtures table
  RAISE NOTICE 'Updating fixtures table...';
  ALTER TABLE fixtures 
    ALTER COLUMN snapshot_home_cap TYPE NUMERIC(15,4),
    ALTER COLUMN snapshot_away_cap TYPE NUMERIC(15,4);
  RAISE NOTICE 'Updated fixtures table columns';

  -- Transfers ledger table
  RAISE NOTICE 'Updating transfers_ledger table...';
  ALTER TABLE transfers_ledger 
    ALTER COLUMN transfer_amount TYPE NUMERIC(15,4);
  RAISE NOTICE 'Updated transfers_ledger table columns';

  -- Step 3: Recreate views
  RAISE NOTICE 'Recreating views...';
  
  -- Recreate current_team_states view
  CREATE OR REPLACE VIEW current_team_states AS
  SELECT DISTINCT ON (team_id) 
    team_id,
    market_cap_after AS current_market_cap,
    shares_outstanding_after AS current_shares_outstanding,
    share_price_after AS current_share_price,
    event_date AS last_updated
  FROM total_ledger
  ORDER BY team_id, event_date DESC;
  
  -- Recreate team_market_data view
  CREATE OR REPLACE VIEW team_market_data AS
  SELECT 
    id,
    name,
    short_name,
    external_id,
    logo_url,
    launch_price,
    initial_market_cap,
    market_cap,
    shares_outstanding,
    CASE
      WHEN shares_outstanding > 0 THEN market_cap / shares_outstanding::numeric
      ELSE 20.00
    END AS current_price,
    is_tradeable,
    created_at,
    updated_at
  FROM teams t;
  
  -- Recreate team_performance_summary view
  CREATE OR REPLACE VIEW team_performance_summary AS
  SELECT 
    t.id AS team_id,
    t.name AS team_name,
    t.initial_market_cap,
    cls.current_market_cap,
    cls.current_shares_outstanding,
    cls.current_share_price,
    cls.last_updated,
    (cls.current_market_cap - t.initial_market_cap) AS total_market_cap_change,
    ROUND(((cls.current_market_cap - t.initial_market_cap) / t.initial_market_cap) * 100, 2) AS market_cap_change_percent,
    (SELECT COUNT(*) FROM total_ledger WHERE total_ledger.team_id = t.id AND total_ledger.ledger_type = 'match_win') AS wins,
    (SELECT COUNT(*) FROM total_ledger WHERE total_ledger.team_id = t.id AND total_ledger.ledger_type = 'match_loss') AS losses,
    (SELECT COUNT(*) FROM total_ledger WHERE total_ledger.team_id = t.id AND total_ledger.ledger_type = 'match_draw') AS draws,
    (SELECT COUNT(*) FROM total_ledger WHERE total_ledger.team_id = t.id AND total_ledger.ledger_type = 'share_purchase') AS share_purchases,
    (SELECT COUNT(*) FROM total_ledger WHERE total_ledger.team_id = t.id AND total_ledger.ledger_type = 'share_sale') AS share_sales,
    (SELECT COALESCE(SUM(total_ledger.shares_traded), 0) FROM total_ledger WHERE total_ledger.team_id = t.id AND total_ledger.ledger_type IN ('share_purchase', 'share_sale')) AS total_shares_traded,
    (SELECT COALESCE(SUM(total_ledger.amount_transferred), 0) FROM total_ledger WHERE total_ledger.team_id = t.id AND total_ledger.ledger_type IN ('share_purchase', 'share_sale')) AS total_trade_volume
  FROM teams t
  LEFT JOIN current_team_states cls ON t.id = cls.team_id
  ORDER BY cls.current_market_cap DESC;
  
  RAISE NOTICE 'Recreated views';

  RAISE NOTICE 'Migration completed: All monetary columns now use 4-decimal precision';
END $$;

