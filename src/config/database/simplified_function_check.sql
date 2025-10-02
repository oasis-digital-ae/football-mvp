-- Simplified check for active functions and triggers
-- Run this in Supabase SQL Editor to see what's currently active

-- Check main functions
SELECT 
    routine_name as function_name,
    'ACTIVE' as status,
    CASE 
        WHEN routine_name LIKE '%trigger%' THEN 'TRIGGER_FUNCTION'
        WHEN routine_name LIKE '%timeline%' THEN 'TIMELINE_FUNCTION'
        WHEN routine_name LIKE '%reset%' THEN 'RESET_FUNCTION'
        WHEN routine_name LIKE '%ledger%' THEN 'LEDGER_FUNCTION'
        ELSE 'OTHER_FUNCTION'
    END as function_type
FROM information_schema.routines 
WHERE routine_schema = 'public'
AND routine_type = 'FUNCTION'
AND routine_name IN (
    'reset_marketplace_complete',
    'get_team_complete_timeline', 
    'fixture_result_trigger',
    'team_market_cap_snapshot_trigger',
    'total_ledger_trigger',
    'create_ledger_entry',
    'create_team_snapshot'
)
ORDER BY function_type, routine_name;

-- Check active triggers
SELECT 
    trigger_name,
    event_object_table as table_name,
    CONCAT(action_timing, ' ', event_manipulation) as trigger_type,
    'ACTIVE' as status
FROM information_schema.triggers 
WHERE trigger_schema = 'public'
AND trigger_name IN (
    'fixture_result_trigger',
    'total_ledger_trigger',
    'team_market_cap_snapshot_trigger'
)
ORDER BY table_name, trigger_name;
