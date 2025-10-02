-- Create missing snapshot for Brighton vs Manchester United (draw)
INSERT INTO team_state_snapshots (
    team_id,
    snapshot_type,
    match_result,
    market_cap,
    shares_outstanding,
    current_share_price,
    price_impact,
    effective_at,
    trigger_event_id,
    trigger_event_type
) VALUES (
    37, -- Brighton team_id
    'match_result',
    'draw',
    120.00, -- Assuming market cap increased by 10 for the draw
    5, -- shares_outstanding
    24.00, -- 120 / 5
    10.00, -- price_impact for draw
    '2024-08-24 11:30:00+00', -- fixture kickoff time
    693, -- fixture id
    'fixture'
);

-- Verify the snapshot was created
SELECT 
    'New Brighton Snapshot' as debug_type,
    s.id,
    s.team_id,
    s.snapshot_type,
    s.match_result,
    s.market_cap,
    s.price_impact,
    s.effective_at,
    s.trigger_event_id,
    s.trigger_event_type
FROM team_state_snapshots s
WHERE s.team_id = 37
ORDER BY s.effective_at;

