-- Check what teams are available in the database
SELECT 
    'Available Teams' as test_type,
    id,
    name,
    external_id
FROM teams 
ORDER BY id
LIMIT 20;

