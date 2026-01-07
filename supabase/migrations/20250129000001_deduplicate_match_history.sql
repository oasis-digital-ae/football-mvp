-- Remove duplicate match history entries in total_ledger
-- Keep only the most recent entry per (team_id, trigger_event_id, ledger_type) combination
-- for match-related ledger types (match_win, match_loss, match_draw)

-- Delete duplicates, keeping the entry with the highest id (most recent) for each unique combination
DELETE FROM total_ledger
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (
                PARTITION BY team_id, trigger_event_id, ledger_type 
                ORDER BY created_at DESC, id DESC
            ) as rn
        FROM total_ledger
        WHERE ledger_type IN ('match_win', 'match_loss', 'match_draw')
          AND trigger_event_id IS NOT NULL
    ) ranked
    WHERE rn > 1
);

-- Log the cleanup
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Removed % duplicate match history entries', deleted_count;
END $$;










