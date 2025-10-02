-- Remove share purchase tracking from total_ledger
-- This script removes the orders trigger and deletes existing share purchase entries

-- 1. Remove the trigger first
DROP TRIGGER IF EXISTS orders_total_ledger_trigger ON orders;

-- 2. Drop the trigger function
DROP FUNCTION IF EXISTS create_share_purchase_ledger_entry();

-- 3. Delete existing share purchase/sale entries from total_ledger
DELETE FROM total_ledger 
WHERE trigger_event_type = 'order' 
AND ledger_type IN ('share_purchase', 'share_sale');

-- 4. Verify removal
SELECT 
    'Removal Status' as check_type,
    'Orders Trigger' as check_item,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.triggers 
            WHERE event_object_table = 'orders' AND trigger_name LIKE '%ledger%'
        ) THEN 'Still exists'
        ELSE 'Removed'
    END as status;

-- 5. Check remaining ledger entries by type
SELECT 
    'Remaining Ledger Entries' as check_type,
    ledger_type,
    COUNT(*) as count
FROM total_ledger 
GROUP BY ledger_type
ORDER BY ledger_type;

-- 6. Show sample of remaining entries
SELECT 
    'Sample Remaining Entries' as check_type,
    id,
    team_id,
    ledger_type,
    event_description,
    trigger_event_type,
    created_at
FROM total_ledger 
ORDER BY created_at DESC
LIMIT 5;
