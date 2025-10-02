-- Populate missing ledger entries for existing FILLED orders
-- This retroactively creates total_ledger entries for orders that were filled before the trigger existed

-- 1. Create missing ledger entries for existing FILLED orders
DO $$
DECLARE
    v_order_record RECORD;
    v_team_state RECORD;
    v_market_cap_before NUMERIC;
    v_shares_outstanding_before INTEGER;
    v_share_price_before NUMERIC;
    v_entries_created INTEGER := 0;
BEGIN
    -- Process each existing FILLED order
    FOR v_order_record IN 
        SELECT o.* FROM orders o 
        WHERE o.status = 'FILLED' 
        AND NOT EXISTS (SELECT 1 FROM total_ledger tl WHERE tl.trigger_event_id = o.id)
        ORDER BY o.id
    LOOP
        -- Get current team state
        SELECT 
            market_cap,
            shares_outstanding,
            CASE 
                WHEN shares_outstanding > 0 THEN market_cap / shares_outstanding 
                ELSE 0 
            END as current_share_price
        INTO v_team_state
        FROM teams 
        WHERE id = v_order_record.team_id;
        
        -- Calculate before state (reverse the order's impact)
        IF v_order_record.order_type = 'BUY' THEN
            v_market_cap_before := v_team_state.market_cap - v_order_record.total_amount;
            v_shares_outstanding_before := v_team_state.shares_outstanding - v_order_record.quantity;
        ELSE
            v_market_cap_before := v_team_state.market_cap + v_order_record.total_amount;
            v_shares_outstanding_before := v_team_state.shares_outstanding + v_order_record.quantity;
        END IF;
        
        v_market_cap_before := GREATEST(v_market_cap_before, 0.01);
        
        v_share_price_before := CASE 
            WHEN v_shares_outstanding_before > 0 
            THEN v_market_cap_before / v_shares_outstanding_before
            ELSE v_team_state.current_share_price
        END;
        
        -- Create ledger entry
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
            v_market_cap_before,
            v_team_state.market_cap,
            v_shares_outstanding_before,
            v_team_state.shares_outstanding,
            v_order_record.quantity,
            v_share_price_before,
            v_team_state.current_share_price,
            NOW(),
            'retroactive',
            'Created retroactively for existing FILLED orders'
        );
        
        v_entries_created := v_entries_created + 1;
        
    END LOOP;
    
    RAISE NOTICE 'Created % ledger entries for existing FILLED orders', v_entries_created;
    
END $$;

-- 2. Test the trigger with a new order to verify it's working
DO $$
DECLARE
    v_test_team_id INTEGER;
    v_test_user_id UUID;
    v_test_order_id INTEGER;
    v_before_count INTEGER;
    v_after_count INTEGER;
BEGIN
    -- Get valid test data
    SELECT id INTO v_test_team_id FROM teams LIMIT 1;
    SELECT id INTO v_test_user_id FROM profiles LIMIT 1;
    
    -- Count ledger entries before
    SELECT COUNT(*) INTO v_before_count FROM total_ledger WHERE trigger_event_type = 'order';
    
    -- Create a new test order
    INSERT INTO orders (
        user_id,
        team_id,
        order_type,
        quantity,
        price_per_share,
        total_amount,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_test_user_id,
        v_test_team_id,
        'BUY',
        2,
        25.00,
        50.00,
        'PENDING',
        NOW(),
        NOW()
    ) RETURNING id INTO v_test_order_id;
    
    RAISE NOTICE 'Created new test order: %', v_test_order_id;
    
    -- Update to FILLED to test trigger
    UPDATE orders 
    SET status = 'FILLED', updated_at = NOW()
    WHERE id = v_test_order_id;
    
    -- Count ledger entries after
    SELECT COUNT(*) INTO v_after_count FROM total_ledger WHERE trigger_event_type = 'order';
    
    RAISE NOTICE 'Order ledger entries before: %, after: %', v_before_count, v_after_count;
    
    -- Clean up test order
    DELETE FROM total_ledger WHERE trigger_event_id = v_test_order_id;
    DELETE FROM orders WHERE id = v_test_order_id;
    
END $$;

-- 3. Show summary of all ledger entries from orders
SELECT 
    'Final Summary' as check_type,
    ledger_type,
    COUNT(*) as count,
    MIN(event_date) as earliest,
    MAX(event_date) as latest
FROM total_ledger 
WHERE trigger_event_type = 'order'
GROUP BY ledger_type
ORDER BY ledger_type;

-- 4. Show sample ledger entries
SELECT 
    'Sample Ledger Entries' as check_type,
    id,
    team_id,
    ledger_type,
    event_description,
    market_cap_before,
    market_cap_after,
    shares_traded,
    created_at
FROM total_ledger 
WHERE trigger_event_type = 'order'
ORDER BY created_at DESC
LIMIT 5;
