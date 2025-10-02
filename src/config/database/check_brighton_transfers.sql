-- Check transfers_ledger for Brighton's matches
SELECT 
    'Brighton Transfers' as debug_type,
    tl.id,
    tl.winner_team_id,
    tl.loser_team_id,
    tl.transfer_amount,
    tl.applied_at,
    wt.name as winner_team,
    lt.name as loser_team
FROM transfers_ledger tl
JOIN teams wt ON tl.winner_team_id = wt.id
JOIN teams lt ON tl.loser_team_id = lt.id
WHERE (tl.winner_team_id = 37 OR tl.loser_team_id = 37)
ORDER BY tl.applied_at;

