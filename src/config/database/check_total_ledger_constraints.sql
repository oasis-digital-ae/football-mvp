-- Check the constraints on total_ledger table
-- This will help understand what values are allowed

-- Show all constraints on total_ledger table
SELECT 
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
    ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'total_ledger'
ORDER BY tc.constraint_name;

-- Show the current team states for reference
SELECT 
    'Team States Reference' as check_type,
    id,
    name,
    market_cap,
    shares_outstanding,
    CASE WHEN shares_outstanding > 0 THEN market_cap / shares_outstanding ELSE 0 END as current_share_price
FROM teams
WHERE id IN (22, 38, 39, 33, 37)
ORDER BY id;

-- Show the problematic orders with their current team state
SELECT 
    'Orders with Team State' as check_type,
    o.id as order_id,
    o.team_id,
    o.order_type,
    o.quantity,
    o.price_per_share,
    o.total_amount,
    o.status,
    t.market_cap as current_team_market_cap,
    t.shares_outstanding as current_team_shares
FROM orders o
JOIN teams t ON t.id = o.team_id
WHERE o.id IN (82, 81, 78, 77, 76)
ORDER BY o.id;
