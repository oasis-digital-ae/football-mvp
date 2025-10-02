-- Test if function exists
SELECT 'Function Check' as test_type, 
       routine_name, 
       routine_type 
FROM information_schema.routines 
WHERE routine_name = 'get_team_complete_timeline';

-- Simple test query
SELECT 'Simple Test' as test_type, 
       COUNT(*) as snapshot_count 
FROM team_state_snapshots 
WHERE team_id = 37 AND snapshot_type = 'match_result';

-- Try to call the function with error handling
DO $$
BEGIN
    PERFORM get_team_complete_timeline(37);
    RAISE NOTICE 'Function call successful';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Function call failed: %', SQLERRM;
END $$;

