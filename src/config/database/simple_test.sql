-- Test 1: Check if function exists
SELECT 'Function Check' as test_type, 
       routine_name, 
       routine_type 
FROM information_schema.routines 
WHERE routine_name = 'get_team_complete_timeline';

