-- Seed data for Supabase branches and local development
-- Teams start with initial/reset values ($5,000 market cap, 1000 shares)
-- Fixtures can be synced from the Football API via the app

INSERT INTO public.teams (
  external_id,
  name,
  short_name,
  logo_url,
  initial_market_cap,
  market_cap,
  total_shares,
  available_shares,
  shares_outstanding,
  is_tradeable,
  launch_price
) VALUES
  (1044, 'AFC Bournemouth', 'Bournemouth', 'https://crests.football-data.org/bournemouth.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (57, 'Arsenal FC', 'Arsenal', 'https://crests.football-data.org/57.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (58, 'Aston Villa FC', 'Aston Villa', 'https://crests.football-data.org/58.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (402, 'Brentford FC', 'Brentford', 'https://crests.football-data.org/402.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (397, 'Brighton & Hove Albion FC', 'Brighton Hove', 'https://crests.football-data.org/397.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (328, 'Burnley FC', 'Burnley', 'https://crests.football-data.org/328.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (61, 'Chelsea FC', 'Chelsea', 'https://crests.football-data.org/61.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (354, 'Crystal Palace FC', 'Crystal Palace', 'https://crests.football-data.org/354.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (62, 'Everton FC', 'Everton', 'https://crests.football-data.org/62.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (63, 'Fulham FC', 'Fulham', 'https://crests.football-data.org/63.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (341, 'Leeds United FC', 'Leeds United', 'https://crests.football-data.org/341.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (64, 'Liverpool FC', 'Liverpool', 'https://crests.football-data.org/64.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (65, 'Manchester City FC', 'Man City', 'https://crests.football-data.org/65.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (66, 'Manchester United FC', 'Man United', 'https://crests.football-data.org/66.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (67, 'Newcastle United FC', 'Newcastle', 'https://crests.football-data.org/67.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (351, 'Nottingham Forest FC', 'Nottingham', 'https://crests.football-data.org/351.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (71, 'Sunderland AFC', 'Sunderland', 'https://crests.football-data.org/71.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (73, 'Tottenham Hotspur FC', 'Tottenham', 'https://crests.football-data.org/73.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (563, 'West Ham United FC', 'West Ham', 'https://crests.football-data.org/563.png', 500000, 500000, 1000, 1000, 1000, true, 500),
  (76, 'Wolverhampton Wanderers FC', 'Wolverhampton', 'https://crests.football-data.org/76.png', 500000, 500000, 1000, 1000, 1000, true, 500)
ON CONFLICT (external_id) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  logo_url = EXCLUDED.logo_url,
  initial_market_cap = EXCLUDED.initial_market_cap,
  market_cap = EXCLUDED.market_cap,
  total_shares = EXCLUDED.total_shares,
  available_shares = EXCLUDED.available_shares,
  shares_outstanding = EXCLUDED.shares_outstanding,
  is_tradeable = EXCLUDED.is_tradeable,
  launch_price = EXCLUDED.launch_price,
  updated_at = now();

-- 2. Fixtures (Premier League 2025 season, matchdays 1-5 - same as production)
INSERT INTO public.fixtures (external_id, home_team_id, away_team_id, matchday, status, home_score, away_score, kickoff_at, buy_close_at, result, season)
SELECT f.ext_id, ht.id, at.id, f.md, f.st, f.hs, f.as, f.ko::timestamptz, f.bc::timestamptz, f.res, f.seas
FROM (VALUES
  (537785, 64, 1044, 1, 'applied', 4, 2, '2025-08-15 19:00:00+00', '2025-08-15 18:45:00+00', 'home_win', 2025),
  (537786, 58, 67, 1, 'applied', 0, 0, '2025-08-16 11:30:00+00', '2025-08-16 11:15:00+00', 'draw', 2025),
  (537787, 397, 63, 1, 'applied', 1, 1, '2025-08-16 14:00:00+00', '2025-08-16 13:45:00+00', 'draw', 2025),
  (537789, 71, 563, 1, 'applied', 3, 0, '2025-08-16 14:00:00+00', '2025-08-16 13:45:00+00', 'home_win', 2025),
  (537790, 73, 328, 1, 'applied', 3, 0, '2025-08-16 14:00:00+00', '2025-08-16 13:45:00+00', 'home_win', 2025),
  (537791, 76, 65, 1, 'applied', 0, 4, '2025-08-16 16:30:00+00', '2025-08-16 16:15:00+00', 'away_win', 2025),
  (537788, 351, 402, 1, 'applied', 3, 1, '2025-08-17 13:00:00+00', '2025-08-17 12:45:00+00', 'home_win', 2025),
  (537792, 61, 354, 1, 'applied', 0, 0, '2025-08-17 13:00:00+00', '2025-08-17 12:45:00+00', 'draw', 2025),
  (537793, 66, 57, 1, 'applied', 0, 1, '2025-08-17 15:30:00+00', '2025-08-17 15:15:00+00', 'away_win', 2025),
  (537794, 341, 62, 1, 'applied', 1, 0, '2025-08-18 19:00:00+00', '2025-08-18 18:45:00+00', 'home_win', 2025),
  (537804, 563, 61, 2, 'applied', 1, 5, '2025-08-22 19:00:00+00', '2025-08-22 18:45:00+00', 'away_win', 2025),
  (537802, 65, 73, 2, 'applied', 0, 2, '2025-08-23 11:30:00+00', '2025-08-23 11:15:00+00', 'away_win', 2025),
  (537799, 328, 71, 2, 'applied', 2, 0, '2025-08-23 14:00:00+00', '2025-08-23 13:45:00+00', 'home_win', 2025),
  (537795, 1044, 76, 2, 'applied', 1, 0, '2025-08-23 14:00:00+00', '2025-08-23 13:45:00+00', 'home_win', 2025),
  (537798, 402, 58, 2, 'applied', 1, 0, '2025-08-23 14:00:00+00', '2025-08-23 13:45:00+00', 'home_win', 2025),
  (537797, 57, 341, 2, 'applied', 5, 0, '2025-08-23 16:30:00+00', '2025-08-23 16:15:00+00', 'home_win', 2025),
  (537796, 354, 351, 2, 'applied', 1, 1, '2025-08-24 13:00:00+00', '2025-08-24 12:45:00+00', 'draw', 2025),
  (537800, 62, 397, 2, 'applied', 2, 0, '2025-08-24 13:00:00+00', '2025-08-24 12:45:00+00', 'home_win', 2025),
  (537801, 63, 66, 2, 'applied', 1, 1, '2025-08-24 15:30:00+00', '2025-08-24 15:15:00+00', 'draw', 2025),
  (537803, 67, 64, 2, 'applied', 2, 3, '2025-08-25 19:00:00+00', '2025-08-25 18:45:00+00', 'away_win', 2025),
  (537808, 61, 63, 3, 'applied', 2, 0, '2025-08-30 11:30:00+00', '2025-08-30 11:15:00+00', 'home_win', 2025),
  (537805, 71, 402, 3, 'applied', 2, 1, '2025-08-30 14:00:00+00', '2025-08-30 13:45:00+00', 'home_win', 2025),
  (537811, 66, 328, 3, 'applied', 3, 2, '2025-08-30 14:00:00+00', '2025-08-30 13:45:00+00', 'home_win', 2025),
  (537813, 73, 1044, 3, 'applied', 0, 1, '2025-08-30 14:00:00+00', '2025-08-30 13:45:00+00', 'away_win', 2025),
  (537814, 76, 62, 3, 'applied', 2, 3, '2025-08-30 14:00:00+00', '2025-08-30 13:45:00+00', 'away_win', 2025),
  (537810, 341, 67, 3, 'applied', 0, 0, '2025-08-30 16:30:00+00', '2025-08-30 16:15:00+00', 'draw', 2025),
  (537807, 397, 65, 3, 'applied', 2, 1, '2025-08-31 13:00:00+00', '2025-08-31 12:45:00+00', 'home_win', 2025),
  (537812, 351, 563, 3, 'applied', 0, 3, '2025-08-31 13:00:00+00', '2025-08-31 12:45:00+00', 'away_win', 2025),
  (537809, 64, 57, 3, 'applied', 1, 0, '2025-08-31 15:30:00+00', '2025-08-31 15:15:00+00', 'home_win', 2025),
  (537806, 58, 354, 3, 'applied', 0, 3, '2025-08-31 18:00:00+00', '2025-08-31 17:45:00+00', 'away_win', 2025),
  (537817, 57, 351, 4, 'applied', 3, 0, '2025-09-13 11:30:00+00', '2025-09-13 11:15:00+00', 'home_win', 2025),
  (537816, 354, 71, 4, 'applied', 0, 0, '2025-09-13 14:00:00+00', '2025-09-13 13:45:00+00', 'draw', 2025),
  (537815, 1044, 397, 4, 'applied', 2, 1, '2025-09-13 14:00:00+00', '2025-09-13 13:45:00+00', 'home_win', 2025),
  (537820, 62, 58, 4, 'applied', 0, 0, '2025-09-13 14:00:00+00', '2025-09-13 13:45:00+00', 'draw', 2025),
  (537821, 63, 341, 4, 'applied', 1, 0, '2025-09-13 14:00:00+00', '2025-09-13 13:45:00+00', 'home_win', 2025),
  (537823, 67, 76, 4, 'applied', 1, 0, '2025-09-13 14:00:00+00', '2025-09-13 13:45:00+00', 'home_win', 2025),
  (537824, 563, 73, 4, 'applied', 0, 3, '2025-09-13 16:30:00+00', '2025-09-13 16:15:00+00', 'away_win', 2025),
  (537818, 402, 61, 4, 'applied', 2, 2, '2025-09-13 19:00:00+00', '2025-09-13 18:45:00+00', 'draw', 2025),
  (537819, 328, 64, 4, 'applied', 0, 1, '2025-09-14 13:00:00+00', '2025-09-14 12:45:00+00', 'away_win', 2025),
  (537822, 65, 66, 4, 'applied', 3, 0, '2025-09-14 15:30:00+00', '2025-09-14 15:15:00+00', 'home_win', 2025),
  (537831, 64, 62, 5, 'applied', 2, 1, '2025-09-20 11:30:00+00', '2025-09-20 11:15:00+00', 'home_win', 2025),
  (537827, 397, 73, 5, 'applied', 2, 2, '2025-09-20 14:00:00+00', '2025-09-20 13:45:00+00', 'draw', 2025),
  (537829, 328, 351, 5, 'applied', 1, 1, '2025-09-20 14:00:00+00', '2025-09-20 13:45:00+00', 'draw', 2025),
  (537833, 563, 354, 5, 'applied', 1, 2, '2025-09-20 14:00:00+00', '2025-09-20 13:45:00+00', 'away_win', 2025),
  (537834, 76, 341, 5, 'applied', 1, 3, '2025-09-20 14:00:00+00', '2025-09-20 13:45:00+00', 'away_win', 2025),
  (537832, 66, 61, 5, 'applied', 2, 1, '2025-09-20 16:30:00+00', '2025-09-20 16:15:00+00', 'home_win', 2025),
  (537830, 63, 402, 5, 'applied', 3, 1, '2025-09-20 19:00:00+00', '2025-09-20 18:45:00+00', 'home_win', 2025),
  (537825, 1044, 67, 5, 'applied', 0, 0, '2025-09-21 13:00:00+00', '2025-09-21 12:45:00+00', 'draw', 2025),
  (537826, 71, 58, 5, 'applied', 1, 1, '2025-09-21 13:00:00+00', '2025-09-21 12:45:00+00', 'draw', 2025),
  (537828, 57, 65, 5, 'applied', 1, 1, '2025-09-21 15:30:00+00', '2025-09-21 15:15:00+00', 'draw', 2025)
) AS f(ext_id, home_ext, away_ext, md, st, hs, as, ko, bc, res, seas)
JOIN teams ht ON ht.external_id = f.home_ext
JOIN teams at ON at.external_id = f.away_ext
ON CONFLICT (external_id) DO UPDATE SET
  home_team_id = EXCLUDED.home_team_id,
  away_team_id = EXCLUDED.away_team_id,
  matchday = EXCLUDED.matchday,
  status = EXCLUDED.status,
  home_score = EXCLUDED.home_score,
  away_score = EXCLUDED.away_score,
  kickoff_at = EXCLUDED.kickoff_at,
  buy_close_at = EXCLUDED.buy_close_at,
  result = EXCLUDED.result,
  season = EXCLUDED.season,
  updated_at = now();

-- 3. Test users for staging (password: TestPassword123!)
-- NOTE: Production user data is NOT included for security. Use these test accounts for staging.
-- For production-like user sync, run a separate script post-branch-creation (not in repo).
DO $$
DECLARE
  v_instance_id uuid;
  v_admin_id uuid := '11111111-1111-1111-1111-111111111111';
  v_user_id uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
  SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
  IF v_instance_id IS NULL THEN
    v_instance_id := '00000000-0000-0000-0000-000000000000';
  END IF;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (v_instance_id, v_admin_id, 'authenticated', 'authenticated', 'admin@staging.local', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
    (v_instance_id, v_user_id, 'authenticated', 'authenticated', 'testuser@staging.local', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, username, full_name, email, is_admin, wallet_balance, portfolio_value)
  VALUES
    (v_admin_id, 'admin_staging', 'Staging Admin', 'admin@staging.local', true, 100000, 0),
    (v_user_id, 'testuser_staging', 'Test User', 'testuser@staging.local', false, 50000, 0)
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    is_admin = EXCLUDED.is_admin,
    wallet_balance = EXCLUDED.wallet_balance,
    portfolio_value = EXCLUDED.portfolio_value,
    updated_at = now();
END $$;
