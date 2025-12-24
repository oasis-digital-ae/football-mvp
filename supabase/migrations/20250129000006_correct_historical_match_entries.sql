-- Correct historical match result entries to use snapshot values
-- This fixes entries created before the snapshot fix was applied
-- Updates market_cap_before, market_cap_after, and related price fields

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
  AND f.snapshot_home_cap IS NOT NULL
  AND f.snapshot_away_cap IS NOT NULL
  -- Only update entries where the values don't match (to avoid unnecessary updates)
  AND (
    ABS(tl.market_cap_before - CASE 
      WHEN f.result = 'home_win' AND tl.team_id = f.home_team_id THEN f.snapshot_home_cap
      WHEN f.result = 'home_win' AND tl.team_id = f.away_team_id THEN f.snapshot_away_cap
      WHEN f.result = 'away_win' AND tl.team_id = f.home_team_id THEN f.snapshot_home_cap
      WHEN f.result = 'away_win' AND tl.team_id = f.away_team_id THEN f.snapshot_away_cap
      WHEN f.result = 'draw' AND tl.team_id = f.home_team_id THEN f.snapshot_home_cap
      WHEN f.result = 'draw' AND tl.team_id = f.away_team_id THEN f.snapshot_away_cap
      ELSE tl.market_cap_before
    END) > 1
  );

-- Now update the share prices and price_impact based on the corrected market caps
-- Get total_shares (should be 1000 for all teams)
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
  AND tl.shares_outstanding_before > 0
  AND tl.shares_outstanding_after > 0;




