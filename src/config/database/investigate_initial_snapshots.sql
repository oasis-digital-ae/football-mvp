-- =====================================================
-- INVESTIGATE: Why are there 60 initial snapshots?
-- =====================================================

-- Check how many initial snapshots exist
SELECT 
    'Total initial snapshots' as description,
    COUNT(*) as count
FROM team_state_snapshots 
WHERE snapshot_type = 'initial';

-- Check how many teams exist
SELECT 
    'Total teams' as description,
    COUNT(*) as count
FROM teams;

-- Check initial snapshots per team
SELECT 
    'Initial snapshots per team' as description,
    team_id,
    COUNT(*) as snapshot_count,
    MIN(created_at) as first_created,
    MAX(created_at) as last_created
FROM team_state_snapshots 
WHERE snapshot_type = 'initial'
GROUP BY team_id
ORDER BY snapshot_count DESC;

-- Check if there are duplicate initial snapshots for the same team
SELECT 
    'Teams with multiple initial snapshots' as description,
    team_id,
    COUNT(*) as snapshot_count,
    ARRAY_AGG(id ORDER BY created_at) as snapshot_ids,
    ARRAY_AGG(created_at ORDER BY created_at) as created_times
FROM team_state_snapshots 
WHERE snapshot_type = 'initial'
GROUP BY team_id
HAVING COUNT(*) > 1
ORDER BY snapshot_count DESC;

-- Show all initial snapshots for Manchester United specifically
SELECT 
    'All initial snapshots for Manchester United' as description,
    id,
    team_id,
    snapshot_type,
    market_cap,
    current_share_price,
    created_at,
    effective_at
FROM team_state_snapshots 
WHERE team_id = 28 
  AND snapshot_type = 'initial'
ORDER BY created_at ASC;

