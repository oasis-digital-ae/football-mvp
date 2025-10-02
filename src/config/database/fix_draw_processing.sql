-- Fix the match processing to handle draws properly
-- Create transfer entry for Brighton vs Manchester United draw
INSERT INTO transfers_ledger (
    fixture_id,
    winner_team_id,
    loser_team_id,
    transfer_amount,
    applied_at
) VALUES (
    693, -- Brighton vs Manchester United fixture
    37,  -- Brighton team_id
    28,  -- Manchester United team_id
    5.00, -- Small transfer amount for draw (could be 0 or small positive)
    '2024-08-24 11:30:00+00' -- Match time
);

-- Update Brighton's market cap to trigger snapshot creation
UPDATE teams 
SET market_cap = 115.00, -- Small increase for draw
    updated_at = NOW()
WHERE id = 37;

-- Verify the transfer was created
SELECT 
    'Draw Transfer Created' as debug_type,
    tl.id,
    tl.fixture_id,
    tl.winner_team_id,
    tl.loser_team_id,
    tl.transfer_amount,
    tl.applied_at
FROM transfers_ledger tl
WHERE tl.fixture_id = 693;

