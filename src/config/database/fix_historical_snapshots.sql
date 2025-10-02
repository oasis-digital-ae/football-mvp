-- =====================================================
-- RECREATE SNAPSHOTS WITH CORRECT HISTORICAL PROGRESSION
-- =====================================================
-- The current snapshots all show $501.00 market cap for 2024 matches
-- We need to recreate them with proper historical progression
-- =====================================================

-- First, clean up the incorrect 2024 match snapshots
DELETE FROM team_state_snapshots 
WHERE team_id = 28 
  AND snapshot_type = 'match_result' 
  AND effective_at < '2025-01-01'::timestamp;

-- Now recreate them with proper progression
-- Start with initial market cap and work forward chronologically
DO $$
DECLARE
    match_record RECORD;
    winner_team_id INTEGER;
    loser_team_id INTEGER;
    transfer_amount DECIMAL(15,2);
    winner_pre_cap DECIMAL(15,2);
    loser_pre_cap DECIMAL(15,2);
    winner_post_cap DECIMAL(15,2);
    loser_post_cap DECIMAL(15,2);
    team_market_caps RECORD;
BEGIN
    -- Create temp table with initial market caps for all teams
    CREATE TEMP TABLE team_historical_caps AS
    SELECT 
        id,
        name,
        initial_market_cap as market_cap
    FROM teams;
    
    -- Process matches chronologically to build up market caps
    FOR match_record IN 
        SELECT 
            f.id as fixture_id,
            f.kickoff_at,
            f.result,
            f.home_team_id,
            f.away_team_id,
            ht.name as home_team_name,
            at.name as away_team_name
        FROM fixtures f
        JOIN teams ht ON f.home_team_id = ht.id
        JOIN teams at ON f.away_team_id = at.id
        WHERE f.status = 'applied' 
            AND f.result IS NOT NULL 
            AND f.result != 'pending'
            AND f.kickoff_at < '2025-01-01'::timestamp -- Only 2024 matches
        ORDER BY f.kickoff_at ASC -- Process chronologically
    LOOP
        -- Get current market caps for both teams
        SELECT market_cap INTO winner_pre_cap FROM team_historical_caps WHERE id = match_record.home_team_id;
        SELECT market_cap INTO loser_pre_cap FROM team_historical_caps WHERE id = match_record.away_team_id;
        
        -- Determine winner and loser based on result
        IF match_record.result = 'home_win' THEN
            winner_team_id := match_record.home_team_id;
            loser_team_id := match_record.away_team_id;
        ELSIF match_record.result = 'away_win' THEN
            winner_team_id := match_record.away_team_id;
            loser_team_id := match_record.home_team_id;
            -- Swap the caps since winner is away team
            DECLARE
                temp_cap DECIMAL(15,2);
            BEGIN
                temp_cap := winner_pre_cap;
                winner_pre_cap := loser_pre_cap;
                loser_pre_cap := temp_cap;
            END;
        ELSE
            -- Draw - no transfer, but still create snapshots for both teams
            winner_team_id := NULL;
            loser_team_id := NULL;
            transfer_amount := 0;
        END IF;
        
        -- Calculate transfer amount (10% of loser's market cap) for wins
        IF winner_team_id IS NOT NULL THEN
            transfer_amount := loser_pre_cap * 0.10;
            winner_post_cap := winner_pre_cap + transfer_amount;
            loser_post_cap := loser_pre_cap - transfer_amount;
            
            -- Update the temp table with new market caps for next iteration
            UPDATE team_historical_caps SET market_cap = winner_post_cap WHERE id = winner_team_id;
            UPDATE team_historical_caps SET market_cap = loser_post_cap WHERE id = loser_team_id;
        ELSE
            -- Draw - no market cap changes
            transfer_amount := 0;
            winner_post_cap := winner_pre_cap; -- For home team in draw
            loser_post_cap := loser_pre_cap;   -- For away team in draw
        END IF;
        
        -- Create snapshots for both teams at the match time
        IF winner_team_id IS NOT NULL THEN
            -- Winner snapshot (pre-match state)
            INSERT INTO team_state_snapshots (
                team_id,
                snapshot_type,
                trigger_event_id,
                trigger_event_type,
                market_cap,
                shares_outstanding,
                current_share_price,
                match_result,
                price_impact,
                effective_at
            ) VALUES (
                winner_team_id,
                'match_result',
                match_record.fixture_id,
                'fixture',
                winner_pre_cap, -- Pre-match market cap
                (SELECT shares_outstanding FROM teams WHERE id = winner_team_id),
                CASE 
                    WHEN (SELECT shares_outstanding FROM teams WHERE id = winner_team_id) > 0 
                    THEN winner_pre_cap / (SELECT shares_outstanding FROM teams WHERE id = winner_team_id)
                    ELSE 20.00 
                END,
                'win',
                transfer_amount,
                match_record.kickoff_at
            );
            
            -- Loser snapshot (pre-match state)
            INSERT INTO team_state_snapshots (
                team_id,
                snapshot_type,
                trigger_event_id,
                trigger_event_type,
                market_cap,
                shares_outstanding,
                current_share_price,
                match_result,
                price_impact,
                effective_at
            ) VALUES (
                loser_team_id,
                'match_result',
                match_record.fixture_id,
                'fixture',
                loser_pre_cap, -- Pre-match market cap
                (SELECT shares_outstanding FROM teams WHERE id = loser_team_id),
                CASE 
                    WHEN (SELECT shares_outstanding FROM teams WHERE id = loser_team_id) > 0 
                    THEN loser_pre_cap / (SELECT shares_outstanding FROM teams WHERE id = loser_team_id)
                    ELSE 20.00 
                END,
                'loss',
                -transfer_amount,
                match_record.kickoff_at
            );
            
            RAISE NOTICE 'Created snapshots for fixture %: % vs % (Winner: %, Loser: %, Transfer: %)', 
                match_record.fixture_id, 
                match_record.home_team_name, 
                match_record.away_team_name,
                winner_team_id,
                loser_team_id,
                transfer_amount;
        ELSE
            -- Draw - create snapshots for both teams with no market cap change
            INSERT INTO team_state_snapshots (
                team_id,
                snapshot_type,
                trigger_event_id,
                trigger_event_type,
                market_cap,
                shares_outstanding,
                current_share_price,
                match_result,
                price_impact,
                effective_at
            ) VALUES (
                match_record.home_team_id,
                'match_result',
                match_record.fixture_id,
                'fixture',
                winner_pre_cap, -- Use the reconstructed market cap
                (SELECT shares_outstanding FROM teams WHERE id = match_record.home_team_id),
                CASE 
                    WHEN (SELECT shares_outstanding FROM teams WHERE id = match_record.home_team_id) > 0 
                    THEN winner_pre_cap / (SELECT shares_outstanding FROM teams WHERE id = match_record.home_team_id)
                    ELSE 20.00 
                END,
                'draw',
                0,
                match_record.kickoff_at
            );
            
            INSERT INTO team_state_snapshots (
                team_id,
                snapshot_type,
                trigger_event_id,
                trigger_event_type,
                market_cap,
                shares_outstanding,
                current_share_price,
                match_result,
                price_impact,
                effective_at
            ) VALUES (
                match_record.away_team_id,
                'match_result',
                match_record.fixture_id,
                'fixture',
                loser_pre_cap, -- Use the reconstructed market cap
                (SELECT shares_outstanding FROM teams WHERE id = match_record.away_team_id),
                CASE 
                    WHEN (SELECT shares_outstanding FROM teams WHERE id = match_record.away_team_id) > 0 
                    THEN loser_pre_cap / (SELECT shares_outstanding FROM teams WHERE id = match_record.away_team_id)
                    ELSE 20.00 
                END,
                'draw',
                0,
                match_record.kickoff_at
            );
            
            RAISE NOTICE 'Created snapshots for fixture %: % vs % (Draw - no transfer)', 
                match_record.fixture_id, 
                match_record.home_team_name, 
                match_record.away_team_name;
        END IF;
    END LOOP;
    
    -- Clean up temp table
    DROP TABLE team_historical_caps;
    
    RAISE NOTICE 'Finished recreating snapshots with correct historical progression';
END $$;

-- Verify the new snapshots
SELECT 
    'New Manchester United snapshots with correct progression' as description,
    id,
    team_id,
    snapshot_type,
    match_result,
    market_cap,
    current_share_price,
    effective_at,
    trigger_event_id
FROM team_state_snapshots 
WHERE team_id = 28 
  AND snapshot_type = 'match_result'
  AND effective_at < '2025-01-01'::timestamp
ORDER BY effective_at ASC;

