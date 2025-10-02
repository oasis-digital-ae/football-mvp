-- Simple test to verify the orders trigger is working
-- This creates a test order and fills it to check if ledger entries are created

DO $$
DECLARE
    v_test_team_id INTEGER;
    v_test_user_id UUID;
    v_test_order_id INTEGER;
    v_before_count INTEGER;
    v_after_count INTEGER;
    v_ledger_entry RECORD;
BEGIN
    -- Get valid test data
    SELECT id INTO v_test_team_id FROM teams LIMIT 1;
    SELECT id INTO v_test_user_id FROM profiles LIMIT 1;
    
    RAISE NOTICE 'Testing with team_id: %, user_id: %', v_test_team_id, v_test_user_id;
    
    -- Count existing ledger entries
    SELECT COUNT(*) INTO v_before_count FROM total_ledger;
    
    -- Create a simple test order
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
        1,
        20.00,
        20.00,
        'PENDING',
        NOW(),
        NOW()
    ) RETURNING id INTO v_test_order_id;
    
    RAISE NOTICE 'Created test order_id: %', v_test_order_id;
    
    -- Check count before filling order
    SELECT COUNT(*) INTO v_before_count FROM total_ledger;
    
    -- Update order to FILLED status - this should trigger
    UPDATE orders 
    SET status = 'FILLED', updated_at = NOW()
    WHERE id = v_test_order_id;
    
    -- Check count after filling order
    SELECT COUNT(*) INTO v_after_count FROM total_ledger;
    
    RAISE NOTICE 'Ledger entries before: %, after: %', v_before_count, v_after_count;
    
    -- Show the ledger entry that should have been created
    SELECT * INTO v_ledger_entry FROM total_ledger WHERE trigger_event_id = v_test_order_id;
    
    IF v_ledger_entry.id IS NOT NULL THEN
        RAISE NOTICE 'Ledger entry created: ID=%, Type=%, Description=%', 
            v_ledger_entry.id, v_ledger_entry.ledger_type, v_ledger_entry.event_description;
    ELSE
        RAISE NOTICE 'No ledger entry found for order_id: %', v_test_order_id;
    END IF;
    
    -- Clean up
    DELETE FROM total_ledger WHERE trigger_event_id = v_test_order_id;
    DELETE FROM orders WHERE id = v_test_order_id;
    
    RAISE NOTICE 'Test completed and cleaned up.';
    
END $$;

-- Also show current orders to see if any are FILLED
SELECT 
    'Current Orders Check' as check_type,
    id,
    team_id,
    order_type,
    quantity,
    status,
    created_at,
    updated_at
FROM orders 
ORDER BY created_at DESC
LIMIT 5;
