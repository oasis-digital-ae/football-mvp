-- Remove orders trigger and function
-- This script removes the orders_total_ledger_trigger and create_share_purchase_ledger_entry function

-- Drop the trigger first
DROP TRIGGER IF EXISTS orders_total_ledger_trigger ON orders;

-- Drop the function
DROP FUNCTION IF EXISTS create_share_purchase_ledger_entry();

-- Verify removal
SELECT 
    'Trigger Removal Status' as check_type,
    trigger_name,
    event_object_table as table_name,
    action_timing,
    event_manipulation
FROM information_schema.triggers 
WHERE event_object_table = 'orders' AND trigger_name LIKE '%ledger%';

-- Show function removal status
SELECT 
    'Function Removal Status' as check_type,
    routine_name,
    routine_type
FROM information_schema.routines 
WHERE routine_name = 'create_share_purchase_ledger_entry';
