-- Diagnostic script to check why timeline isn't showing match results
-- Run this to understand what data exists for team 21

-- Step 1: Check what snapshots exist for team 21
SELECT 
    'Team 21 Snapshots' as test_type,
    id,
    snapshot_type,
    trigger_event_type,
    match_result,
    market_cap,
    price_impact,
    effective_at,
    trigger_event_id
FROM team_state_snapshots 
WHERE team_id = 21
ORDER BY effective_at;

-- Step 2: Check what transfers exist for team 21
SELECT 
    'Team 21 Transfers' as test_type,
    id,
    fixture_id,
    winner_team_id,
    loser_team_id,
    transfer_amount,
    applied_at
FROM transfers_ledger 
WHERE winner_team_id = 21 OR loser_team_id = 21
ORDER BY applied_at;

-- Step 3: Check what fixtures exist for team 21
SELECT 
    'Team 21 Fixtures' as test_type,
    f.id,
    f.external_id,
    f.home_team_id,
    f.away_team_id,
    f.result,
    f.status,
    f.home_score,
    f.away_score,
    ht.name as home_team,
    at.name as away_team
FROM fixtures f
LEFT JOIN teams ht ON f.home_team_id = ht.id
LEFT JOIN teams at ON f.away_team_id = at.id
WHERE f.home_team_id = 21 OR f.away_team_id = 21
ORDER BY f.kickoff_at;

-- Step 4: Check the join between snapshots and transfers
SELECT 
    'Snapshot-Transfer Join Test' as test_type,
    s.id as snapshot_id,
    s.snapshot_type,
    s.match_result,
    s.trigger_event_id,
    tl.id as transfer_id,
    tl.fixture_id,
    tl.winner_team_id,
    tl.loser_team_id
FROM team_state_snapshots s
LEFT JOIN transfers_ledger tl ON s.trigger_event_id = tl.id
WHERE s.team_id = 21
ORDER BY s.effective_at;

-- Step 5: Check the join between transfers and fixtures
SELECT 
    'Transfer-Fixture Join Test' as test_type,
    tl.id as transfer_id,
    tl.fixture_id,
    tl.winner_team_id,
    tl.loser_team_id,
    f.id as fixture_id_check,
    f.result,
    f.status,
    ht.name as home_team,
    at.name as away_team
FROM transfers_ledger tl
LEFT JOIN fixtures f ON tl.fixture_id = f.id
LEFT JOIN teams ht ON f.home_team_id = ht.id
LEFT JOIN teams at ON f.away_team_id = at.id
WHERE tl.winner_team_id = 21 OR tl.loser_team_id = 21
ORDER BY tl.applied_at;

-- Step 6: Test the timeline function with debug info
SELECT 
    'Timeline Debug' as test_type,
    event_order,
    event_type,
    event_date,
    description,
    opponent_name,
    match_result,
    price_impact
FROM get_team_complete_timeline(21)
ORDER BY event_order, event_date;

