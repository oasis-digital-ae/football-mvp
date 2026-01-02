-- Backfill snapshot values for Nov 1 matches (pre-reset)
-- These matches were processed before the data reset, so they don't have snapshots
-- We'll set snapshots to $20,000 (the reset value) to make the history consistent

UPDATE fixtures
SET 
  snapshot_home_cap = 20000.00,
  snapshot_away_cap = 20000.00
WHERE DATE(kickoff_at) = '2025-11-01'
  AND (snapshot_home_cap IS NULL OR snapshot_away_cap IS NULL);

-- Now update the total_ledger entries for these matches to use the snapshot values
UPDATE total_ledger tl
SET 
  market_cap_before = CASE 
    WHEN f.result = 'home_win' AND tl.team_id = f.home_team_id THEN f.snapshot_home_cap
    WHEN f.result = 'home_win' AND tl.team_id = f.away_team_id THEN f.snapshot_away_cap
    WHEN f.result = 'away_win' AND tl.team_id = f.home_team_id THEN f.snapshot_home_cap
    WHEN f.result = 'away_win' AND tl.team_id = f.away_team_id THEN f.snapshot_away_cap
    WHEN f.result = 'draw' AND tl.team_id = f.home_team_id THEN f.snapshot_home_cap
    WHEN f.result = 'draw' AND tl.team_id = f.away_team_id THEN f.snapshot_away_cap
    ELSE tl.market_cap_before
  END,
  market_cap_after = CASE 
    WHEN f.result = 'home_win' AND tl.team_id = f.home_team_id THEN f.snapshot_home_cap + tl.amount_transferred
    WHEN f.result = 'home_win' AND tl.team_id = f.away_team_id THEN GREATEST(f.snapshot_away_cap - tl.amount_transferred, 10)
    WHEN f.result = 'away_win' AND tl.team_id = f.home_team_id THEN GREATEST(f.snapshot_home_cap - tl.amount_transferred, 10)
    WHEN f.result = 'away_win' AND tl.team_id = f.away_team_id THEN f.snapshot_away_cap + tl.amount_transferred
    WHEN f.result = 'draw' AND tl.team_id = f.home_team_id THEN f.snapshot_home_cap
    WHEN f.result = 'draw' AND tl.team_id = f.away_team_id THEN f.snapshot_away_cap
    ELSE tl.market_cap_after
  END
FROM fixtures f
WHERE tl.trigger_event_type = 'fixture'
  AND tl.trigger_event_id = f.id
  AND tl.ledger_type IN ('match_win', 'match_loss', 'match_draw')
  AND DATE(f.kickoff_at) = '2025-11-01';

-- Update share prices and price_impact
UPDATE total_ledger tl
SET 
  share_price_before = CASE 
    WHEN tl.shares_outstanding_before > 0 THEN tl.market_cap_before / tl.shares_outstanding_before
    ELSE 20.00
  END,
  share_price_after = CASE 
    WHEN tl.shares_outstanding_after > 0 THEN tl.market_cap_after / tl.shares_outstanding_after
    ELSE 20.00
  END,
  price_impact = CASE 
    WHEN tl.shares_outstanding_after > 0 THEN (tl.market_cap_after / tl.shares_outstanding_after) - (tl.market_cap_before / tl.shares_outstanding_before)
    ELSE 0
  END
WHERE tl.trigger_event_type = 'fixture'
  AND tl.ledger_type IN ('match_win', 'match_loss', 'match_draw')
  AND EXISTS (
    SELECT 1 FROM fixtures f 
    WHERE f.id = tl.trigger_event_id 
    AND DATE(f.kickoff_at) = '2025-11-01'
  )
  AND tl.shares_outstanding_before > 0
  AND tl.shares_outstanding_after > 0;





