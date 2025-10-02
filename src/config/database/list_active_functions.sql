-- List all active database functions and triggers
-- This will help identify what's currently active in Supabase

-- List all functions
SELECT 
    'FUNCTION' as object_type,
    routine_name as name,
    routine_definition as definition_source
FROM information_schema.routines 
WHERE routine_type = 'FUNCTION' 
AND routine_schema = 'public'
ORDER BY routine_name;

-- List all triggers
SELECT 
    'TRIGGER' as object_type,
    trigger_name as name,
    CONCAT('ON ', event_object_table, ' ', action_timing, ' ', event_manipulation) as trigger_details,
    action_statement as definition_source
FROM information_schema.triggers 
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- Check if specific functions exist
SELECT 
    'EXISTENCE_CHECK' as check_type,
    CASE 
        WHEN EXISTS(SELECT 1 FROM information_schema.routines WHERE routine_name = 'reset_marketplace_complete') 
        THEN 'reset_marketplace_complete: EXISTS'
        ELSE 'reset_marketplace_complete: NOT_FOUND'
    END as result
UNION ALL
SELECT 
    'EXISTENCE_CHECK' as check_type,
    CASE 
        WHEN EXISTS(SELECT 1 FROM information_schema.routines WHERE routine_name = 'get_team_complete_timeline') 
        THEN 'get_team_complete_timeline: EXISTS'
        ELSE 'get_team_complete_timeline: NOT_FOUND'
    END as result
UNION ALL
SELECT 
    'EXISTENCE_CHECK' as check_type,
    CASE 
        WHEN EXISTS(SELECT 1 FROM information_schema.routines WHERE routine_name = 'team_market_cap_snapshot_trigger') 
        THEN 'team_market_cap_snapshot_trigger: EXISTS'
        ELSE 'team_market_cap_snapshot_trigger: NOT_FOUND'
    END as result
UNION ALL
SELECT 
    'EXISTENCE_CHECK' as check_type,
    CASE 
        WHEN EXISTS(SELECT 1 FROM information_schema.routines WHERE routine_name = 'fixture_result_trigger') 
        THEN 'fixture_result_trigger: EXISTS'
        ELSE 'fixture_result_trigger: NOT_FOUND'
    END as result
UNION ALL
SELECT 
    'EXISTENCE_CHECK' as check_type,
    CASE 
        WHEN EXISTS(SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'fixture_result_trigger') 
        THEN 'fixture_result_trigger (TRIGGER): EXISTS'
        ELSE 'fixture_result_trigger (TRIGGER): NOT_FOUND'
    END as result
UNION ALL
SELECT 
    'EXISTENCE_CHECK' as check_type,
    CASE 
        WHEN EXISTS(SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'total_ledger_trigger') 
        THEN 'total_ledger_trigger: EXISTS'
        ELSE 'total_ledger_trigger: NOT_FOUND'
    END as result;

