-- Check why existing FILLED orders aren't in total_ledger
-- This will help identify the trigger issue

-- 1. Check if these specific orders have ledger entries
SELECT 
    'Ledger Check for Existing Orders' as check_type,
    o.id as order_id,
    o.team_id,
    o.order_type,
    o.quantity,
    o.status,
    o.created_at,
    tl.id as ledger_id,
    tl.ledger_type,
    tl.event_description
FROM orders o
LEFT JOIN total_ledger tl ON tl.trigger_event_id = o.id
WHERE o.id IN (82, 81, 78, 77, 76)
ORDER BY o.id DESC;

-- 2. Check if trigger function exists and is correctly defined
SELECT 
    'Trigger Function Definition' as check_type,
    routine_name,
    routine_type
FROM information_schema.routines 
WHERE routine_name = 'create_share_purchase_ledger_entry';

-- 3. Test the trigger function manually on order 76 (most recent)
DO $$
DECLARE
    v_order_record orders%ROWTYPE;
    v_team_state RECORD;
    v_market_cap_before NUMERIC;
    v_shares_outstanding_before INTEGER;
    v_share_price_before NUMERIC;
BEGIN
    -- Get the order record
    SELECT * INTO v_order_record FROM orders WHERE id = 76;
    
    RAISE NOTICE 'Testing with order: %, team: %, type: %, quantity: %', 
        v_order_record.id, v_order_record.team_id, v_order_record.order_type, v_order_record.quantity;
    
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
    
    RAISE NOTICE 'Team state - market_cap: %, shares_outstanding: %, share_price: %', 
        v_team_state.market_cap, v_team_state.shares_outstanding, v_team_state.current_share_price;
    
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
    
    RAISE NOTICE 'Calculated before values - market_cap: %, shares_outstanding: %, share_price: %', 
        v_market_cap_before, v_shares_outstanding_before, v_share_price_before;
    
    -- Try to manually create a ledger entry
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
        'manual_test',
        'Manually created for testing'
    );
    
    RAISE NOTICE 'Manual ledger entry created successfully';
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error creating manual ledger entry: %', SQLERRM;
END $$;

-- 4. Show any ledger entries for these orders
SELECT 
    'Ledger Entries for Test Orders' as check_type,
    tl.*
FROM total_ledger tl 
WHERE tl.trigger_event_id IN (82, 81, 78, 77, 76)
ORDER BY tl.created_at DESC;
