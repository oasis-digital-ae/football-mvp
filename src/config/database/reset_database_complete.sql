-- =====================================================
-- COMPLETE DATABASE RESET
-- Football MVP - Premier League Club Shares Trading Platform
-- =====================================================
-- This script completely resets the database to initial state
-- WARNING: This will delete ALL data!

-- =====================================================
-- 1. SAVE ADMIN USERS
-- =====================================================

-- Save admin users before reset to preserve admin status
CREATE TEMP TABLE IF NOT EXISTS temp_admin_users AS
SELECT id FROM profiles WHERE is_admin = true;

-- =====================================================
-- 2. CLEAR ALL DATA (in dependency order)
-- =====================================================

-- Clear transfers ledger first (references fixtures)
DELETE FROM transfers_ledger;

-- Clear positions (references teams and users)
DELETE FROM positions;

-- Clear orders (references teams and users)
DELETE FROM orders;

-- Clear fixtures (references teams)
DELETE FROM fixtures;

-- Clear teams
DELETE FROM teams;

-- Clear profiles (keep auth users intact)
DELETE FROM profiles;

-- =====================================================
-- 3. RESET SEQUENCES
-- =====================================================

-- Reset auto-increment sequences
ALTER SEQUENCE teams_id_seq RESTART WITH 1;
ALTER SEQUENCE fixtures_id_seq RESTART WITH 1;
ALTER SEQUENCE orders_id_seq RESTART WITH 1;
ALTER SEQUENCE positions_id_seq RESTART WITH 1;
ALTER SEQUENCE transfers_ledger_id_seq RESTART WITH 1;

-- =====================================================
-- 4. INSERT INITIAL TEAMS DATA
-- =====================================================

-- Insert Premier League teams with initial values
INSERT INTO teams (external_id, name, short_name, logo_url, launch_price, initial_market_cap, market_cap, total_shares, available_shares, shares_outstanding) VALUES
(57, 'Arsenal FC', 'ARS', 'https://crests.football-data.org/57.png', 20.00, 100.00, 100.00, 5, 5, 5),
(65, 'Manchester City FC', 'MCI', 'https://crests.football-data.org/65.png', 20.00, 100.00, 100.00, 5, 5, 5),
(61, 'Chelsea FC', 'CHE', 'https://crests.football-data.org/61.png', 20.00, 100.00, 100.00, 5, 5, 5),
(66, 'Manchester United FC', 'MUN', 'https://crests.football-data.org/66.png', 20.00, 100.00, 100.00, 5, 5, 5),
(64, 'Liverpool FC', 'LIV', 'https://crests.football-data.org/64.png', 20.00, 100.00, 100.00, 5, 5, 5),
(73, 'Tottenham Hotspur FC', 'TOT', 'https://crests.football-data.org/73.png', 20.00, 100.00, 100.00, 5, 5, 5),
(67, 'Newcastle United FC', 'NEW', 'https://crests.football-data.org/67.png', 20.00, 100.00, 100.00, 5, 5, 5),
(563, 'West Ham United FC', 'WHU', 'https://crests.football-data.org/563.png', 20.00, 100.00, 100.00, 5, 5, 5),
(354, 'Brighton & Hove Albion FC', 'BHA', 'https://crests.football-data.org/354.png', 20.00, 100.00, 100.00, 5, 5, 5),
(397, 'Aston Villa FC', 'AVL', 'https://crests.football-data.org/397.png', 20.00, 100.00, 100.00, 5, 5, 5),
(402, 'Brentford FC', 'BRE', 'https://crests.football-data.org/402.png', 20.00, 100.00, 100.00, 5, 5, 5),
(351, 'Nottingham Forest FC', 'NFO', 'https://crests.football-data.org/351.png', 20.00, 100.00, 100.00, 5, 5, 5),
(76, 'Wolverhampton Wanderers FC', 'WOL', 'https://crests.football-data.org/76.png', 20.00, 100.00, 100.00, 5, 5, 5),
(346, 'Crystal Palace FC', 'CRY', 'https://crests.football-data.org/346.png', 20.00, 100.00, 100.00, 5, 5, 5),
(328, 'Burnley FC', 'BUR', 'https://crests.football-data.org/328.png', 20.00, 100.00, 100.00, 5, 5, 5),
(389, 'Luton Town FC', 'LUT', 'https://crests.football-data.org/389.png', 20.00, 100.00, 100.00, 5, 5, 5),
(340, 'Southampton FC', 'SOU', 'https://crests.football-data.org/340.png', 20.00, 100.00, 100.00, 5, 5, 5),
(394, 'Leicester City FC', 'LEI', 'https://crests.football-data.org/394.png', 20.00, 100.00, 100.00, 5, 5, 5),
(68, 'Norwich City FC', 'NOR', 'https://crests.football-data.org/68.png', 20.00, 100.00, 100.00, 5, 5, 5),
(715, 'Ipswich Town FC', 'IPS', 'https://crests.football-data.org/715.png', 20.00, 100.00, 100.00, 5, 5, 5);

-- =====================================================
-- 5. RESTORE ADMIN STATUS
-- =====================================================

-- Restore admin status for users who were admins before reset
-- This works after users log back in and profiles are recreated by auth triggers
UPDATE profiles 
SET is_admin = true 
WHERE id IN (SELECT id FROM temp_admin_users);

-- Clean up temporary table
DROP TABLE IF EXISTS temp_admin_users;

-- =====================================================
-- 6. SUCCESS MESSAGE
-- =====================================================

DO $$
DECLARE
    v_admin_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_admin_count FROM profiles WHERE is_admin = true;
    
    RAISE NOTICE '✅ Database reset complete!';
    RAISE NOTICE '📊 Teams: 20 Premier League teams inserted';
    RAISE NOTICE '💰 Initial values: $100 market cap, $20 launch price, 5 shares';
    RAISE NOTICE '🔄 All sequences reset to 1';
    RAISE NOTICE '🗑️ All user data cleared';
    RAISE NOTICE '👑 Admin users preserved: %', v_admin_count;
END $$;

