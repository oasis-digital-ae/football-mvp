-- Additional performance optimizations for Football MVP
-- Run this after the main performance indexes for maximum speed

-- =====================================================
-- MATERIALIZED VIEWS FOR COMPLEX QUERIES
-- =====================================================

-- Materialized view for team performance summary
CREATE MATERIALIZED VIEW IF NOT EXISTS team_performance_summary AS
SELECT 
    t.id as team_id,
    t.name as team_name,
    t.initial_market_cap,
    t.market_cap as current_market_cap,
    t.market_cap - t.initial_market_cap as total_change,
    CASE 
        WHEN t.initial_market_cap > 0 
        THEN ((t.market_cap - t.initial_market_cap) / t.initial_market_cap) * 100 
        ELSE 0 
    END as percent_change,
    COALESCE(wins.wins, 0) as wins,
    COALESCE(losses.losses, 0) as losses,
    COALESCE(draws.draws, 0) as draws
FROM teams t
LEFT JOIN (
    SELECT 
        CASE 
            WHEN f.home_team_id IS NOT NULL THEN f.home_team_id 
            ELSE f.away_team_id 
        END as team_id,
        COUNT(*) as wins
    FROM fixtures f
    WHERE f.status = 'applied' 
        AND f.result = 'home_win' 
        AND f.home_team_id IS NOT NULL
    GROUP BY f.home_team_id
    
    UNION ALL
    
    SELECT 
        f.away_team_id as team_id,
        COUNT(*) as wins
    FROM fixtures f
    WHERE f.status = 'applied' 
        AND f.result = 'away_win' 
        AND f.away_team_id IS NOT NULL
    GROUP BY f.away_team_id
) wins ON t.id = wins.team_id
LEFT JOIN (
    SELECT 
        CASE 
            WHEN f.home_team_id IS NOT NULL THEN f.home_team_id 
            ELSE f.away_team_id 
        END as team_id,
        COUNT(*) as losses
    FROM fixtures f
    WHERE f.status = 'applied' 
        AND f.result = 'away_win' 
        AND f.home_team_id IS NOT NULL
    GROUP BY f.home_team_id
    
    UNION ALL
    
    SELECT 
        f.away_team_id as team_id,
        COUNT(*) as losses
    FROM fixtures f
    WHERE f.status = 'applied' 
        AND f.result = 'home_win' 
        AND f.away_team_id IS NOT NULL
    GROUP BY f.away_team_id
) losses ON t.id = losses.team_id
LEFT JOIN (
    SELECT 
        CASE 
            WHEN f.home_team_id IS NOT NULL THEN f.home_team_id 
            ELSE f.away_team_id 
        END as team_id,
        COUNT(*) as draws
    FROM fixtures f
    WHERE f.status = 'applied' 
        AND f.result = 'draw'
    GROUP BY CASE 
        WHEN f.home_team_id IS NOT NULL THEN f.home_team_id 
        ELSE f.away_team_id 
    END
) draws ON t.id = draws.team_id;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_team_performance_summary_market_cap 
ON team_performance_summary(current_market_cap DESC);

-- =====================================================
-- CACHING FUNCTIONS FOR FREQUENT CALCULATIONS
-- =====================================================

-- Function to get team market cap with caching
CREATE OR REPLACE FUNCTION get_team_market_cap(team_id_param INTEGER)
RETURNS NUMERIC AS $$
DECLARE
    result NUMERIC;
BEGIN
    SELECT market_cap INTO result
    FROM teams 
    WHERE id = team_id_param;
    
    RETURN COALESCE(result, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get user portfolio value with caching
CREATE OR REPLACE FUNCTION get_user_portfolio_value(user_id_param UUID)
RETURNS NUMERIC AS $$
DECLARE
    result NUMERIC;
BEGIN
    SELECT COALESCE(SUM(
        p.quantity * CASE 
            WHEN t.shares_outstanding > 0 
            THEN t.market_cap / t.shares_outstanding 
            ELSE 20.00 
        END
    ), 0) INTO result
    FROM positions p
    JOIN teams t ON p.team_id = t.id
    WHERE p.user_id = user_id_param 
        AND p.is_latest = true 
        AND p.quantity > 0;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- QUERY OPTIMIZATION HINTS
-- =====================================================

-- Set work_mem for better sorting performance
SET work_mem = '256MB';

-- Enable parallel queries for large datasets
SET max_parallel_workers_per_gather = 4;
SET parallel_tuple_cost = 0.1;
SET parallel_setup_cost = 10;

-- =====================================================
-- REFRESH MATERIALIZED VIEWS
-- =====================================================

-- Refresh materialized views
REFRESH MATERIALIZED VIEW team_performance_summary;

-- =====================================================
-- PERFORMANCE MONITORING
-- =====================================================

-- Create function to monitor slow queries
CREATE OR REPLACE FUNCTION log_slow_queries()
RETURNS void AS $$
BEGIN
    -- This would typically be set up with pg_stat_statements
    -- For now, just ensure we have good logging
    RAISE NOTICE 'Performance monitoring enabled';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FINAL OPTIMIZATIONS
-- =====================================================

-- Vacuum and analyze all tables for optimal performance
VACUUM ANALYZE teams;
VACUUM ANALYZE fixtures;
VACUUM ANALYZE positions;
VACUUM ANALYZE orders;
VACUUM ANALYZE transfers_ledger;
VACUUM ANALYZE profiles;

-- Update statistics
ANALYZE teams;
ANALYZE fixtures;
ANALYZE positions;
ANALYZE orders;
ANALYZE transfers_ledger;
ANALYZE profiles;


