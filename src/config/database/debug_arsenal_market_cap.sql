-- Debug Arsenal team market cap calculation
-- This script will help us understand why the calculation is showing $71 instead of $100

-- 1. Get Arsenal team data
SELECT 
    id, 
    name, 
    initial_market_cap, 
    market_cap,
    (market_cap - initial_market_cap) as total_change
FROM teams 
WHERE name ILIKE '%Arsenal%';

-- 2. Get all orders for Arsenal (cash injections)
SELECT 
    o.id,
    o.team_id,
    o.total_amount,
    o.quantity,
    o.price_per_share,
    o.created_at,
    t.name as team_name
FROM orders o
JOIN teams t ON o.team_id = t.id
WHERE t.name ILIKE '%Arsenal%'
    AND o.order_type = 'BUY' 
    AND o.status = 'FILLED'
ORDER BY o.created_at ASC;

-- 3. Get all transfers for Arsenal (match results)
SELECT 
    tl.id,
    tl.fixture_id,
    tl.winner_team_id,
    tl.loser_team_id,
    tl.transfer_amount,
    tl.applied_at,
    CASE 
        WHEN tl.winner_team_id = t.id THEN 'WON'
        WHEN tl.loser_team_id = t.id THEN 'LOST'
    END as result,
    t.name as team_name
FROM transfers_ledger tl
JOIN teams t ON (tl.winner_team_id = t.id OR tl.loser_team_id = t.id)
WHERE t.name ILIKE '%Arsenal%'
ORDER BY tl.applied_at ASC;

-- 4. Manual calculation check
-- This will show us the chronological order of events
WITH arsenal_team AS (
    SELECT id, name, initial_market_cap, market_cap
    FROM teams 
    WHERE name ILIKE '%Arsenal%'
),
arsenal_orders AS (
    SELECT 
        o.total_amount,
        o.created_at,
        'INJECTION' as event_type
    FROM orders o
    JOIN arsenal_team t ON o.team_id = t.id
    WHERE o.order_type = 'BUY' AND o.status = 'FILLED'
),
arsenal_transfers AS (
    SELECT 
        CASE 
            WHEN tl.winner_team_id = t.id THEN tl.transfer_amount
            WHEN tl.loser_team_id = t.id THEN -tl.transfer_amount
        END as amount,
        tl.applied_at as created_at,
        CASE 
            WHEN tl.winner_team_id = t.id THEN 'TRANSFER_WIN'
            WHEN tl.loser_team_id = t.id THEN 'TRANSFER_LOSS'
        END as event_type
    FROM transfers_ledger tl
    JOIN arsenal_team t ON (tl.winner_team_id = t.id OR tl.loser_team_id = t.id)
),
all_events AS (
    SELECT amount, created_at, event_type FROM arsenal_orders
    UNION ALL
    SELECT amount, created_at, event_type FROM arsenal_transfers
)
SELECT 
    event_type,
    amount,
    created_at,
    SUM(amount) OVER (ORDER BY created_at) as running_total
FROM all_events
ORDER BY created_at;


