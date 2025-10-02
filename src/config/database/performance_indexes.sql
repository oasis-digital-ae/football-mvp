-- Performance optimization indexes for Football MVP
-- Run this after the main migration to improve query performance

-- =====================================================
-- COMPOSITE INDEXES FOR COMMON QUERY PATTERNS
-- =====================================================

-- Positions table - most common query pattern
CREATE INDEX IF NOT EXISTS idx_positions_user_team_latest 
ON positions(user_id, team_id, is_latest) 
WHERE is_latest = true;

-- Fixtures table - team-based queries with covering index
CREATE INDEX IF NOT EXISTS idx_fixtures_team_status_covering 
ON fixtures(home_team_id, away_team_id, status) 
INCLUDE (id, kickoff_at, result, home_score, away_score)
WHERE status IN ('applied', 'scheduled');

-- Teams table - market cap queries
CREATE INDEX IF NOT EXISTS idx_teams_market_cap 
ON teams(market_cap DESC, id);

-- Teams table - tradeable teams
CREATE INDEX IF NOT EXISTS idx_teams_tradeable 
ON teams(is_tradeable, market_cap DESC) 
WHERE is_tradeable = true;

-- Fixtures table - time-based queries
CREATE INDEX IF NOT EXISTS idx_fixtures_kickoff_status 
ON fixtures(kickoff_at, status);

-- Orders table - user and team queries
CREATE INDEX IF NOT EXISTS idx_orders_user_status 
ON orders(user_id, status, created_at);

-- Orders table - team-based queries for cash injections
CREATE INDEX IF NOT EXISTS idx_orders_team_type_status 
ON orders(team_id, order_type, status, created_at);

-- Orders table - user-based queries for portfolio
CREATE INDEX IF NOT EXISTS idx_orders_user_type_status 
ON orders(user_id, order_type, status, created_at);

-- Orders table - covering index for cash injection queries
CREATE INDEX IF NOT EXISTS idx_orders_cash_injection_covering 
ON orders(team_id, order_type, status) 
INCLUDE (id, user_id, total_amount, quantity, price_per_share, created_at)
WHERE order_type = 'BUY' AND status = 'FILLED';

-- Transfers ledger - team-based queries
CREATE INDEX IF NOT EXISTS idx_transfers_team_applied 
ON transfers_ledger(winner_team_id, loser_team_id, applied_at);

-- =====================================================
-- PARTIAL INDEXES FOR SPECIFIC CONDITIONS
-- =====================================================

-- Only index active positions
CREATE INDEX IF NOT EXISTS idx_positions_active 
ON positions(user_id, team_id) 
WHERE is_latest = true AND quantity > 0;

-- Only index pending orders
CREATE INDEX IF NOT EXISTS idx_orders_pending 
ON orders(created_at) 
WHERE status = 'PENDING';

-- Only index applied fixtures
CREATE INDEX IF NOT EXISTS idx_fixtures_applied 
ON fixtures(kickoff_at) 
WHERE status = 'applied';

-- Only index scheduled fixtures
CREATE INDEX IF NOT EXISTS idx_fixtures_scheduled 
ON fixtures(kickoff_at) 
WHERE status = 'scheduled';

-- =====================================================
-- COVERING INDEXES FOR COMMON SELECTS
-- =====================================================

-- Teams - cover common select fields
CREATE INDEX IF NOT EXISTS idx_teams_market_data 
ON teams(id, name, market_cap, shares_outstanding);

-- Fixtures - cover team and result data
CREATE INDEX IF NOT EXISTS idx_fixtures_team_results 
ON fixtures(home_team_id, away_team_id, result, status, kickoff_at);

-- Positions - cover user portfolio data
CREATE INDEX IF NOT EXISTS idx_positions_portfolio 
ON positions(user_id, team_id, quantity, total_invested, is_latest);

-- =====================================================
-- FUNCTIONAL INDEXES FOR CALCULATED FIELDS
-- =====================================================

-- Index for market cap calculations
CREATE INDEX IF NOT EXISTS idx_teams_market_cap_calc 
ON teams((market_cap / NULLIF(shares_outstanding, 0)));

-- Index for team name searches (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_teams_name_lower 
ON teams(LOWER(name));

-- Index for external ID lookups
CREATE INDEX IF NOT EXISTS idx_teams_external_id 
ON teams(external_id) 
WHERE external_id IS NOT NULL;

-- =====================================================
-- STATISTICS AND MAINTENANCE
-- =====================================================

-- Update table statistics for better query planning
ANALYZE teams;
ANALYZE fixtures;
ANALYZE positions;
ANALYZE orders;
ANALYZE transfers_ledger;
ANALYZE profiles;

-- =====================================================
-- QUERY OPTIMIZATION HINTS
-- =====================================================

-- Create a view for common team queries
CREATE OR REPLACE VIEW team_market_data AS
SELECT 
    t.id,
    t.name,
    t.short_name,
    t.external_id,
    t.logo_url,
    t.launch_price,
    t.initial_market_cap,
    t.market_cap,
    t.shares_outstanding,
    CASE 
        WHEN t.shares_outstanding > 0 
        THEN t.market_cap / t.shares_outstanding 
        ELSE 20.00 
    END as current_price,
    t.is_tradeable,
    t.created_at,
    t.updated_at
FROM teams t;

-- Create a view for user portfolio summary
CREATE OR REPLACE VIEW user_portfolio_summary AS
SELECT 
    p.user_id,
    p.team_id,
    t.name as team_name,
    p.quantity,
    p.total_invested,
    CASE 
        WHEN p.quantity > 0 
        THEN p.total_invested / p.quantity 
        ELSE 0 
    END as avg_cost,
    CASE 
        WHEN t.shares_outstanding > 0 
        THEN t.market_cap / t.shares_outstanding 
        ELSE 20.00 
    END as current_price,
    p.quantity * CASE 
        WHEN t.shares_outstanding > 0 
        THEN t.market_cap / t.shares_outstanding 
        ELSE 20.00 
    END as current_value,
    p.quantity * CASE 
        WHEN t.shares_outstanding > 0 
        THEN t.market_cap / t.shares_outstanding 
        ELSE 20.00 
    END - p.total_invested as profit_loss
FROM positions p
JOIN teams t ON p.team_id = t.id
WHERE p.is_latest = true AND p.quantity > 0;

-- =====================================================
-- PERFORMANCE MONITORING QUERIES
-- =====================================================

-- Query to check index usage
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch 
-- FROM pg_stat_user_indexes 
-- ORDER BY idx_scan DESC;

-- Query to check slow queries
-- SELECT query, mean_time, calls, total_time 
-- FROM pg_stat_statements 
-- ORDER BY mean_time DESC 
-- LIMIT 10;

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'PERFORMANCE INDEXES CREATED SUCCESSFULLY!';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'Composite indexes for common query patterns';
    RAISE NOTICE 'Partial indexes for specific conditions';
    RAISE NOTICE 'Covering indexes for common selects';
    RAISE NOTICE 'Functional indexes for calculated fields';
    RAISE NOTICE 'Views for optimized queries';
    RAISE NOTICE 'Table statistics updated';
    RAISE NOTICE '=====================================================';
END $$;
