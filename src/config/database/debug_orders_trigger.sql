-- Debug script to check orders and total_ledger
-- This will help identify why share purchases aren't appearing in total_ledger

-- 1. Check if there are any FILLED orders
SELECT 
    'Orders Status Check' as debug_type,
    status,
    COUNT(*) as count,
    MIN(created_at) as earliest,
    MAX(created_at) as latest
FROM orders 
GROUP BY status
ORDER BY status;

-- 2. Show all orders with their details
SELECT 
    'All Orders Details' as debug_type,
    id,
    team_id,
    order_type,
    quantity,
    price_per_share,
    total_amount,
    status,
    created_at,
    updated_at
FROM orders 
ORDER BY created_at DESC
LIMIT 10;

-- 3. Check if there are any ledger entries from orders
SELECT 
    'Ledger Entries from Orders' as debug_type,
    ledger_type,
    COUNT(*) as count,
    MIN(event_date) as earliest,
    MAX(event_date) as latest
FROM total_ledger 
WHERE trigger_event_type = 'order'
GROUP BY ledger_type
ORDER BY ledger_type;

-- 4. Show all ledger entries related to orders
SELECT 
    'All Order Ledger Entries' as debug_type,
    id,
    team_id,
    ledger_type,
    event_description,
    trigger_event_id,
    trigger_event_type,
    market_cap_before,
    market_cap_after,
    shares_traded,
    created_at
FROM total_ledger 
WHERE trigger_event_type = 'order'
ORDER BY created_at DESC;

-- 5. Test the trigger manually with a new order
DO $$
DECLARE
    v_test_team_id INTEGER;
    v_test_user_id UUID;
    v_test_order_id INTEGER;
    v_ledger_count INTEGER;
BEGIN
    -- Get a test team and user
    SELECT id INTO v_test_team_id FROM teams LIMIT 1;
    SELECT id INTO v_test_user_id FROM profiles LIMIT 1;
    
    -- Create a test order
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
        3,
        25.00,
        75.00,
        'PENDING',
        NOW(),
        NOW()
    ) RETURNING id INTO v_test_order_id;
    
    -- Check count before update
    SELECT COUNT(*) INTO v_ledger_count
    FROM total_ledger 
    WHERE trigger_event_id = v_test_order_id;
    
    RAISE NOTICE 'Before update - Ledger entries: %', v_ledger_count;
    
    -- Update to FILLED to trigger the ledger entry
    UPDATE orders 
    SET status = 'FILLED', updated_at = NOW()
    WHERE id = v_test_order_id;
    
    -- Check count after update
    SELECT COUNT(*) INTO v_ledger_count
    FROM total_ledger 
    WHERE trigger_event_id = v_test_order_id;
    
    RAISE NOTICE 'After update - Ledger entries: %', v_ledger_count;
    
    -- Show the created ledger entry
    PERFORM * FROM total_ledger WHERE trigger_event_id = v_test_order_id;
    
    -- Clean up test data
    DELETE FROM total_ledger WHERE trigger_event_id = v_test_order_id;
    DELETE FROM orders WHERE id = v_test_order_id;
    
END $$;

-- 6. Check trigger function exists and is correct
SELECT 
    'Trigger Function Check' as debug_type,
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_name = 'create_share_purchase_ledger_entry';

-- 7. Verify trigger is active
SELECT 
    'Trigger Status' as debug_type,
    trigger_name,
    event_object_table,
    action_timing,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'orders' 
AND trigger_name LIKE '%ledger%';
