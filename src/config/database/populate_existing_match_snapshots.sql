-- =====================================================
-- POPULATE SNAPSHOTS FOR EXISTING MATCHES
-- =====================================================
-- This script creates snapshots for all existing matches
-- that were processed before the snapshot system was implemented
-- =====================================================

-- First, let's see what matches we have
SELECT 
    f.id as fixture_id,
    f.kickoff_at,
    f.result,
    f.home_team_id,
    f.away_team_id,
    ht.name as home_team_name,
    at.name as away_team_name,
    f.home_score,
    f.away_score
FROM fixtures f
JOIN teams ht ON f.home_team_id = ht.id
JOIN teams at ON f.away_team_id = at.id
WHERE f.status = 'applied' 
    AND f.result IS NOT NULL 
    AND f.result != 'pending'
ORDER BY f.kickoff_at ASC;

-- First, clean up any existing match_result snapshots to avoid duplicates
DELETE FROM team_state_snapshots WHERE snapshot_type = 'match_result';

-- Create snapshots for all existing matches
-- We'll reconstruct the historical market caps chronologically
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
    -- First, get initial market caps for all teams
    CREATE TEMP TABLE team_initial_caps AS
    SELECT 
        id,
        name,
        initial_market_cap as market_cap
    FROM teams;
    
    -- Loop through all applied matches chronologically
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
        ORDER BY f.kickoff_at ASC
    LOOP
        -- Get current market caps for both teams (reconstructed from previous matches)
        SELECT market_cap INTO winner_pre_cap FROM team_initial_caps WHERE id = match_record.home_team_id;
        SELECT market_cap INTO loser_pre_cap FROM team_initial_caps WHERE id = match_record.away_team_id;
        
        -- Determine winner and loser based on result
        IF match_record.result = 'home_win' THEN
            winner_team_id := match_record.home_team_id;
            loser_team_id := match_record.away_team_id;
        ELSIF match_record.result = 'away_win' THEN
            winner_team_id := match_record.away_team_id;
            loser_team_id := match_record.home_team_id;
            -- Swap the caps since winner is away team
            winner_pre_cap := loser_pre_cap;
            loser_pre_cap := (SELECT market_cap FROM team_initial_caps WHERE id = match_record.home_team_id);
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
            UPDATE team_initial_caps SET market_cap = winner_post_cap WHERE id = winner_team_id;
            UPDATE team_initial_caps SET market_cap = loser_post_cap WHERE id = loser_team_id;
        ELSE
            -- Draw - no market cap changes
            transfer_amount := 0;
        END IF;
        
        -- Create snapshots for both teams at the match time
        IF winner_team_id IS NOT NULL THEN
            -- Winner snapshot
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
            
            -- Loser snapshot
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
    DROP TABLE team_initial_caps;
    
    RAISE NOTICE 'Finished creating snapshots for all existing matches';
END $$;

-- Verify the snapshots were created
SELECT 
    s.id,
    s.team_id,
    t.name as team_name,
    s.snapshot_type,
    s.match_result,
    s.market_cap,
    s.current_share_price,
    s.price_impact,
    s.effective_at,
    s.trigger_event_id
FROM team_state_snapshots s
JOIN teams t ON s.team_id = t.id
WHERE s.snapshot_type = 'match_result'
ORDER BY s.effective_at ASC, s.team_id ASC;
