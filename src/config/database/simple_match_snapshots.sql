-- =====================================================
-- SIMPLE APPROACH: USE CURRENT MARKET CAPS
-- =====================================================
-- Since all teams seem to have initial_market_cap = 100,
-- let's use the current market caps and work backwards
-- to create realistic historical snapshots
-- =====================================================

-- First, clean up any existing match_result snapshots
DELETE FROM team_state_snapshots WHERE snapshot_type = 'match_result';

-- Let's see what the current market caps are
SELECT 
    id,
    name,
    initial_market_cap,
    market_cap as current_market_cap,
    shares_outstanding
FROM teams 
ORDER BY market_cap DESC;

-- Create snapshots using current market caps as the "final" state
-- and work backwards to create realistic historical values
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
    -- Create temp table with current market caps
    CREATE TEMP TABLE team_current_caps AS
    SELECT 
        id,
        name,
        market_cap,
        shares_outstanding
    FROM teams;
    
    -- Process matches in REVERSE chronological order to work backwards
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
        ORDER BY f.kickoff_at DESC -- Reverse order to work backwards
    LOOP
        -- Get current market caps for both teams
        SELECT market_cap INTO winner_pre_cap FROM team_current_caps WHERE id = match_record.home_team_id;
        SELECT market_cap INTO loser_pre_cap FROM team_current_caps WHERE id = match_record.away_team_id;
        
        -- Determine winner and loser based on result
        IF match_record.result = 'home_win' THEN
            winner_team_id := match_record.home_team_id;
            loser_team_id := match_record.away_team_id;
        ELSIF match_record.result = 'away_win' THEN
            winner_team_id := match_record.away_team_id;
            loser_team_id := match_record.home_team_id;
            -- Swap the caps since winner is away team
            winner_pre_cap := loser_pre_cap;
            loser_pre_cap := (SELECT market_cap FROM team_current_caps WHERE id = match_record.home_team_id);
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
            
            -- Update the temp table with PREVIOUS market caps (working backwards)
            UPDATE team_current_caps SET market_cap = winner_pre_cap - transfer_amount WHERE id = winner_team_id;
            UPDATE team_current_caps SET market_cap = loser_pre_cap + transfer_amount WHERE id = loser_team_id;
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
                winner_pre_cap - transfer_amount, -- Pre-match market cap
                (SELECT shares_outstanding FROM teams WHERE id = winner_team_id),
                CASE 
                    WHEN (SELECT shares_outstanding FROM teams WHERE id = winner_team_id) > 0 
                    THEN (winner_pre_cap - transfer_amount) / (SELECT shares_outstanding FROM teams WHERE id = winner_team_id)
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
                loser_pre_cap + transfer_amount, -- Pre-match market cap
                (SELECT shares_outstanding FROM teams WHERE id = loser_team_id),
                CASE 
                    WHEN (SELECT shares_outstanding FROM teams WHERE id = loser_team_id) > 0 
                    THEN (loser_pre_cap + transfer_amount) / (SELECT shares_outstanding FROM teams WHERE id = loser_team_id)
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
                winner_pre_cap, -- Use current market cap for draws
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
                loser_pre_cap, -- Use current market cap for draws
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
    DROP TABLE team_current_caps;
    
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

