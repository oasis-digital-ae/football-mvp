-- Verify Total Ledger Purchase Entries
-- This script checks if purchases are being logged to total_ledger and fixes any issues

-- Check if total_ledger table exists and has the right structure
DO $$
BEGIN
    -- Check if total_ledger table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'total_ledger') THEN
        RAISE NOTICE '❌ total_ledger table does not exist!';
        RAISE NOTICE 'Creating total_ledger table...';
        
        -- Create total_ledger table
        CREATE TABLE total_ledger (
            id SERIAL PRIMARY KEY,
            team_id INTEGER NOT NULL REFERENCES teams(id),
            ledger_type TEXT NOT NULL CHECK (ledger_type IN ('share_purchase', 'share_sale', 'match_win', 'match_loss', 'match_draw', 'initial_state', 'manual_adjustment')),
            shares_traded INTEGER NOT NULL DEFAULT 0,
            amount_transferred NUMERIC NOT NULL DEFAULT 0,
            market_cap_before NUMERIC NOT NULL,
            market_cap_after NUMERIC NOT NULL,
            shares_outstanding_before INTEGER NOT NULL,
            shares_outstanding_after INTEGER NOT NULL,
            share_price_before NUMERIC NOT NULL,
            share_price_after NUMERIC NOT NULL,
            price_impact NUMERIC NOT NULL DEFAULT 0,
            trigger_event_type TEXT CHECK (trigger_event_type IN ('order', 'fixture', 'manual', 'initial')),
            trigger_event_id INTEGER,
            event_description TEXT,
            event_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_by TEXT DEFAULT 'system',
            opponent_team_id INTEGER REFERENCES teams(id),
            opponent_team_name TEXT,
            match_result TEXT CHECK (match_result IN ('win', 'loss', 'draw')),
            match_score TEXT,
            is_home_match BOOLEAN,
            notes TEXT
        );
        
        RAISE NOTICE '✅ total_ledger table created successfully!';
    ELSE
        RAISE NOTICE '✅ total_ledger table exists';
    END IF;
END $$;

-- Check if process_share_purchase_atomic function exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'process_share_purchase_atomic') THEN
        RAISE NOTICE '❌ process_share_purchase_atomic function does not exist!';
        RAISE NOTICE 'Please run atomic_transaction_functions.sql to create the function';
    ELSE
        RAISE NOTICE '✅ process_share_purchase_atomic function exists';
    END IF;
END $$;

-- Check recent purchase entries in total_ledger
DO $$
DECLARE
    purchase_count INTEGER;
    recent_purchases INTEGER;
BEGIN
    SELECT COUNT(*) INTO purchase_count FROM total_ledger WHERE ledger_type = 'share_purchase';
    SELECT COUNT(*) INTO recent_purchases FROM total_ledger WHERE ledger_type = 'share_purchase' AND created_at > NOW() - INTERVAL '1 hour';
    
    RAISE NOTICE '📊 Total purchase entries in total_ledger: %', purchase_count;
    RAISE NOTICE '📊 Recent purchases (last hour): %', recent_purchases;
    
    IF purchase_count = 0 THEN
        RAISE NOTICE '⚠️  No purchase entries found in total_ledger';
        RAISE NOTICE 'This suggests purchases are not being logged properly';
    END IF;
END $$;

-- Show recent entries for debugging
SELECT 
    id,
    team_id,
    ledger_type,
    shares_traded,
    amount_transferred,
    market_cap_before,
    market_cap_after,
    created_at,
    event_description
FROM total_ledger 
WHERE ledger_type = 'share_purchase' 
ORDER BY created_at DESC 
LIMIT 5;

-- Check if there are any orders without corresponding ledger entries
SELECT 
    o.id as order_id,
    o.team_id,
    o.quantity,
    o.total_amount,
    o.created_at,
    CASE 
        WHEN tl.id IS NULL THEN 'MISSING LEDGER ENTRY'
        ELSE 'HAS LEDGER ENTRY'
    END as ledger_status
FROM orders o
LEFT JOIN total_ledger tl ON tl.trigger_event_id = o.id AND tl.trigger_event_type = 'order'
WHERE o.status = 'FILLED'
ORDER BY o.created_at DESC
LIMIT 10;
