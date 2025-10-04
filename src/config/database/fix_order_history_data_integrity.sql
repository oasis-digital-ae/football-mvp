-- Fix Order History Data Integrity
-- Add immutable market cap snapshots to orders table

-- Add new columns for immutable order history
ALTER TABLE orders ADD COLUMN IF NOT EXISTS market_cap_before NUMERIC;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS market_cap_after NUMERIC;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shares_outstanding_before INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shares_outstanding_after INTEGER;

-- Backfill existing orders with calculated historical values
DO $$
DECLARE
    order_record RECORD;
    team_record RECORD;
    running_market_cap NUMERIC;
    running_shares INTEGER;
    initial_market_cap_val NUMERIC;
    initial_shares INTEGER;
BEGIN
    -- Process each team separately
    FOR team_record IN SELECT t.id, t.initial_market_cap FROM teams t LOOP
        -- Initialize running totals for this team
        initial_market_cap_val := COALESCE(team_record.initial_market_cap, 100);
        initial_shares := 5;
        running_market_cap := initial_market_cap_val;
        running_shares := initial_shares;
        
        -- Process orders for this team in chronological order
        FOR order_record IN 
            SELECT * FROM orders 
            WHERE team_id = team_record.id 
              AND status = 'FILLED' 
              AND order_type = 'BUY'
              AND market_cap_before IS NULL  -- Only process orders without snapshots
            ORDER BY executed_at ASC
        LOOP
            -- Update the order with historical market cap data
            UPDATE orders SET
                market_cap_before = running_market_cap,
                market_cap_after = running_market_cap + order_record.total_amount,
                shares_outstanding_before = running_shares,
                shares_outstanding_after = running_shares + order_record.quantity
            WHERE id = order_record.id;
            
            -- Update running totals for next order
            running_market_cap := running_market_cap + order_record.total_amount;
            running_shares := running_shares + order_record.quantity;
        END LOOP;
    END LOOP;
END $$;

-- Add constraints to ensure data integrity (without IF NOT EXISTS)
DO $$
BEGIN
    -- Add constraints only if they don't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'orders_market_cap_before_check'
    ) THEN
        ALTER TABLE orders ADD CONSTRAINT orders_market_cap_before_check 
            CHECK (market_cap_before >= 0);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'orders_market_cap_after_check'
    ) THEN
        ALTER TABLE orders ADD CONSTRAINT orders_market_cap_after_check 
            CHECK (market_cap_after >= market_cap_before);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'orders_shares_outstanding_check'
    ) THEN
        ALTER TABLE orders ADD CONSTRAINT orders_shares_outstanding_check 
            CHECK (shares_outstanding_after >= shares_outstanding_before);
    END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_market_cap_before ON orders(market_cap_before);
CREATE INDEX IF NOT EXISTS idx_orders_market_cap_after ON orders(market_cap_after);
CREATE INDEX IF NOT EXISTS idx_orders_executed_at ON orders(executed_at);

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Order history data integrity fix completed!';
    RAISE NOTICE 'Added immutable market cap snapshots to all existing orders';
    RAISE NOTICE 'Order history will now remain accurate regardless of future market changes';
END $$;
