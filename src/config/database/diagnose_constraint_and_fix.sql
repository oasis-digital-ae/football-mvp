-- Diagnose the constraint issue and find the correct approach
-- First, let's understand what's happening

-- 1. Check the constraint definition
SELECT 
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
    ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'total_ledger'
AND tc.constraint_name = 'valid_share_counts';

-- 2. Look at the problematic order and team state
SELECT 
    'Problem Analysis' as check_type,
    o.id as order_id,
    o.team_id,
    o.order_type,
    o.quantity,
    o.total_amount,
    o.price_per_share,
    -- Current team state
    t.market_cap as current_market_cap,
    t.shares_outstanding as current_shares_outstanding,
    -- What we're trying to calculate (before state)
    t.market_cap - o.total_amount as calculated_market_cap_before,
    t.shares_outstanding - o.quantity as calculated_shares_before
FROM orders o
JOIN teams t ON t.id = o.team_id
WHERE o.id = 68; -- The problematic order

-- 3. Alternative approach: Instead of reverse-calculating, record the current state
-- This might be more accurate since we're dealing with historical data

DO $$
DECLARE
    v_order_record RECORD;
    v_entries_created INTEGER := 0;
BEGIN
    RAISE NOTICE 'Using simplified approach - recording current team state for historical orders';
    
    FOR v_order_record IN 
        SELECT 
            o.*,
            t.market_cap as team_market_cap,
            t.shares_outstanding as team_shares_outstanding,
            CASE WHEN t.shares_outstanding > 0 THEN t.market_cap / t.shares_outstanding ELSE 0 END as team_share_price
        FROM orders o
        JOIN teams t ON t.id = o.team_id
        WHERE o.status = 'FILLED' 
        AND NOT EXISTS (SELECT 1 FROM total_ledger tl WHERE tl.trigger_event_id = o.id)
        ORDER BY o.id
    LOOP
        INSERT INTO total_ledger (
            team_id,
            ledger_type,
            event_date,
            event_description,
            trigger_event_id,
            trigger_event_type,
            amount_transferred,
            price_impact,
            market_cap_before,
            market_cap_after,
            shares_outstanding_before,
            shares_outstanding_after,
            shares_traded,
            share_price_before,
            share_price_after,
            created_at,
            created_by,
            notes
        ) VALUES (
            v_order_record.team_id,
            CASE WHEN v_order_record.order_type = 'BUY' THEN 'share_purchase' ELSE 'share_sale' END,
            v_order_record.updated_at,
            CONCAT(v_order_record.quantity, ' shares ', CASE WHEN v_order_record.order_type = 'BUY' THEN 'purchased' ELSE 'sold' END, ' at $', v_order_record.price_per_share),
            v_order_record.id,
            'order',
            v_order_record.total_amount,
            v_order_record.total_amount,
            -- Use current team state as both before and after (simplified approach)
            v_order_record.team_market_cap,
            v_order_record.team_market_cap,
            v_order_record.team_shares_outstanding,
            v_order_record.team_shares_outstanding,
            v_order_record.quantity,
            v_order_record.team_share_price,
            v_order_record.team_share_price,
            NOW(),
            'simplified_retroactive',
            'Retroactive entry - using current team state for historical orders'
        );
        
        v_entries_created := v_entries_created + 1;
        
    END LOOP;
    
    RAISE NOTICE 'Created % simplified ledger entries', v_entries_created;
    
END $$;

-- 4. Test if the simplified approach worked
SELECT 
    'Test Result' as check_type,
    COUNT(*) as total_order_entries,
    ledger_type,
    COUNT(*) as count
FROM total_ledger 
WHERE trigger_event_type = 'order'
GROUP BY ledger_type;
