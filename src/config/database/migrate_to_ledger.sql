-- Migrate existing snapshot data to the new total_ledger system
-- This will populate the ledger with historical match and purchase data

-- First, let's see what snapshot data exists
SELECT 
    'Existing Snapshots' as test_type,
    team_id,
    snapshot_type,
    match_result,
    market_cap,
    price_impact,
    shares_traded,
    effective_at
FROM team_state_snapshots 
WHERE snapshot_type != 'initial'
ORDER BY team_id, effective_at
LIMIT 10;

-- Migrate match result snapshots to ledger
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
    match_score,
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
    s.team_id,
    CASE 
        WHEN s.match_result = 'win' THEN 'match_win'
        WHEN s.match_result = 'loss' THEN 'match_loss'
        WHEN s.match_result = 'draw' THEN 'match_draw'
        ELSE 'match_result'
    END as ledger_type,
    s.effective_at,
    'Match Result' as event_description,
    s.trigger_event_id,
    s.trigger_event_type,
    CASE 
        WHEN f.home_team_id = s.team_id THEN f.away_team_id
        ELSE f.home_team_id
    END as opponent_team_id,
    CASE 
        WHEN f.home_team_id = s.team_id THEN away_team.name
        ELSE home_team.name
    END as opponent_team_name,
    s.match_result,
    CASE 
        WHEN f.home_score IS NOT NULL AND f.away_score IS NOT NULL 
        THEN CONCAT(f.home_score, '-', f.away_score)
        ELSE NULL
    END as match_score,
    (f.home_team_id = s.team_id) as is_home_match,
    COALESCE(tl.transfer_amount, 0) as amount_transferred,
    s.price_impact,
    (s.market_cap - s.price_impact) as market_cap_before,
    s.market_cap as market_cap_after,
    s.shares_outstanding as shares_outstanding_before,
    s.shares_outstanding as shares_outstanding_after,
    0 as shares_traded,
    ((s.market_cap - s.price_impact) / s.shares_outstanding) as share_price_before,
    (s.market_cap / s.shares_outstanding) as share_price_after,
    'Migrated from snapshot system'
FROM team_state_snapshots s
LEFT JOIN transfers_ledger tl ON s.trigger_event_id = tl.id
LEFT JOIN fixtures f ON tl.fixture_id = f.id
LEFT JOIN teams home_team ON f.home_team_id = home_team.id
LEFT JOIN teams away_team ON f.away_team_id = away_team.id
WHERE s.snapshot_type = 'match_result'
AND s.match_result IS NOT NULL;

-- Migrate share purchase snapshots to ledger
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
    s.team_id,
    'share_purchase' as ledger_type,
    s.effective_at,
    CONCAT(s.shares_traded, ' shares purchased') as event_description,
    s.trigger_event_id,
    s.trigger_event_type,
    s.trade_amount as amount_transferred,
    s.price_impact,
    (s.market_cap - s.price_impact) as market_cap_before,
    s.market_cap as market_cap_after,
    (s.shares_outstanding - s.shares_traded) as shares_outstanding_before,
    s.shares_outstanding as shares_outstanding_after,
    s.shares_traded,
    ((s.market_cap - s.price_impact) / (s.shares_outstanding - s.shares_traded)) as share_price_before,
    (s.market_cap / s.shares_outstanding) as share_price_after,
    'Migrated from snapshot system'
FROM team_state_snapshots s
WHERE s.snapshot_type = 'share_purchase'
AND s.shares_traded > 0;

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
    match_result,
    score
FROM get_team_timeline(37)
ORDER BY event_order, event_date;

