-- Migrate available data to the new total_ledger system
-- Using transfers_ledger, fixtures, and orders data

-- First, let's see what we have
SELECT 
    'Data Summary' as test_type,
    (SELECT COUNT(*) FROM transfers_ledger) as transfers,
    (SELECT COUNT(*) FROM fixtures WHERE result IS NOT NULL AND result != 'pending') as completed_fixtures,
    (SELECT COUNT(*) FROM orders WHERE status = 'FILLED') as filled_orders
FROM (SELECT 1) as dummy;

-- Migrate match results from transfers_ledger
-- Even though fixtures show "pending", we have transfer data that indicates matches were played
INSERT INTO total_ledger (
    team_id,
    ledger_type,
    event_date,
    event_description,
    trigger_event_id,
    trigger_event_type,
    opponent_team_id,
    opponent_team_name,
    match_result,
    is_home_match,
    amount_transferred,
    price_impact,
    market_cap_before,
    market_cap_after,
    shares_outstanding_before,
    shares_outstanding_after,
    shares_traded,
    share_price_before,
    share_price_after,
    notes
)
SELECT 
    tl.winner_team_id as team_id,
    'match_win' as ledger_type,
    tl.applied_at as event_date,
    CASE 
        WHEN f.home_team_id = tl.winner_team_id THEN 'vs ' || away_team.name
        ELSE '@ ' || home_team.name
    END as event_description,
    tl.id as trigger_event_id,
    'fixture' as trigger_event_type,
    CASE 
        WHEN f.home_team_id = tl.winner_team_id THEN f.away_team_id
        ELSE f.home_team_id
    END as opponent_team_id,
    CASE 
        WHEN f.home_team_id = tl.winner_team_id THEN away_team.name
        ELSE home_team.name
    END as opponent_team_name,
    'win' as match_result,
    (f.home_team_id = tl.winner_team_id) as is_home_match,
    tl.transfer_amount as amount_transferred,
    tl.transfer_amount as price_impact,
    -- Calculate before/after market caps (we'll use current - transfer for before)
    (t_winner.market_cap - tl.transfer_amount) as market_cap_before,
    t_winner.market_cap as market_cap_after,
    t_winner.shares_outstanding as shares_outstanding_before,
    t_winner.shares_outstanding as shares_outstanding_after,
    0 as shares_traded,
    ((t_winner.market_cap - tl.transfer_amount) / t_winner.shares_outstanding) as share_price_before,
    (t_winner.market_cap / t_winner.shares_outstanding) as share_price_after,
    'Migrated from transfers_ledger'
FROM transfers_ledger tl
JOIN fixtures f ON tl.fixture_id = f.id
JOIN teams home_team ON f.home_team_id = home_team.id
JOIN teams away_team ON f.away_team_id = away_team.id
JOIN teams t_winner ON tl.winner_team_id = t_winner.id;

-- Migrate match losses from transfers_ledger
INSERT INTO total_ledger (
    team_id,
    ledger_type,
    event_date,
    event_description,
    trigger_event_id,
    trigger_event_type,
    opponent_team_id,
    opponent_team_name,
    match_result,
    is_home_match,
    amount_transferred,
    price_impact,
    market_cap_before,
    market_cap_after,
    shares_outstanding_before,
    shares_outstanding_after,
    shares_traded,
    share_price_before,
    share_price_after,
    notes
)
SELECT 
    tl.loser_team_id as team_id,
    'match_loss' as ledger_type,
    tl.applied_at as event_date,
    CASE 
        WHEN f.home_team_id = tl.loser_team_id THEN 'vs ' || away_team.name
        ELSE '@ ' || home_team.name
    END as event_description,
    tl.id as trigger_event_id,
    'fixture' as trigger_event_type,
    CASE 
        WHEN f.home_team_id = tl.loser_team_id THEN f.away_team_id
        ELSE f.home_team_id
    END as opponent_team_id,
    CASE 
        WHEN f.home_team_id = tl.loser_team_id THEN away_team.name
        ELSE home_team.name
    END as opponent_team_name,
    'loss' as match_result,
    (f.home_team_id = tl.loser_team_id) as is_home_match,
    tl.transfer_amount as amount_transferred,
    (-tl.transfer_amount) as price_impact,
    -- Calculate before/after market caps (we'll use current + transfer for before)
    (t_loser.market_cap + tl.transfer_amount) as market_cap_before,
    t_loser.market_cap as market_cap_after,
    t_loser.shares_outstanding as shares_outstanding_before,
    t_loser.shares_outstanding as shares_outstanding_after,
    0 as shares_traded,
    ((t_loser.market_cap + tl.transfer_amount) / t_loser.shares_outstanding) as share_price_before,
    (t_loser.market_cap / t_loser.shares_outstanding) as share_price_after,
    'Migrated from transfers_ledger'
FROM transfers_ledger tl
JOIN fixtures f ON tl.fixture_id = f.id
JOIN teams home_team ON f.home_team_id = home_team.id
JOIN teams away_team ON f.away_team_id = away_team.id
JOIN teams t_loser ON tl.loser_team_id = t_loser.id;

-- Migrate share purchases from orders
INSERT INTO total_ledger (
    team_id,
    ledger_type,
    event_date,
    event_description,
    trigger_event_id,
    trigger_event_type,
    amount_transferred,
    price_impact,
    market_cap_before,
    market_cap_after,
    shares_outstanding_before,
    shares_outstanding_after,
    shares_traded,
    share_price_before,
    share_price_after,
    notes
)
SELECT 
    o.team_id,
    'share_purchase' as ledger_type,
    o.created_at as event_date,
    CONCAT(o.quantity, ' shares purchased at $', o.price_per_share) as event_description,
    o.id as trigger_event_id,
    'order' as trigger_event_type,
    o.total_amount as amount_transferred,
    o.total_amount as price_impact,
    -- Calculate before market cap (current - total_amount)
    (t.market_cap - o.total_amount) as market_cap_before,
    t.market_cap as market_cap_after,
    -- Calculate before shares (current - quantity)
    (t.shares_outstanding - o.quantity) as shares_outstanding_before,
    t.shares_outstanding as shares_outstanding_after,
    o.quantity as shares_traded,
    ((t.market_cap - o.total_amount) / (t.shares_outstanding - o.quantity)) as share_price_before,
    (t.market_cap / t.shares_outstanding) as share_price_after,
    'Migrated from orders'
FROM orders o
JOIN teams t ON o.team_id = t.id
WHERE o.status = 'FILLED' AND o.order_type = 'BUY';

-- Check the results
SELECT 
    'Migration Results' as test_type,
    COUNT(*) as total_entries,
    COUNT(CASE WHEN ledger_type LIKE 'match_%' THEN 1 END) as match_entries,
    COUNT(CASE WHEN ledger_type = 'share_purchase' THEN 1 END) as purchase_entries,
    COUNT(CASE WHEN ledger_type = 'initial_state' THEN 1 END) as initial_entries
FROM total_ledger;

-- Test Brighton timeline after migration
SELECT 
    'Brighton Timeline After Migration' as test_type,
    event_order,
    event_type,
    event_date,
    description,
    market_cap_before,
    market_cap_after,
    share_price_before,
    share_price_after,
    price_impact,
    opponent_name,
    match_result
FROM get_team_timeline(37)
ORDER BY event_order, event_date;

