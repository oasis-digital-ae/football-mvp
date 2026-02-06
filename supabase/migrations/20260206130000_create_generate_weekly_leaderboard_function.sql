-- generate_weekly_leaderboard: computes weekly performance for football-mvp schema
-- Uses: profiles (wallet_balance), positions, teams, wallet_transactions
-- Note: Uses current snapshot for end; start = end - deposits (no historical market_cap).
-- For accurate historical returns, add point-in-time market_cap snapshots later.
CREATE OR REPLACE FUNCTION public.generate_weekly_leaderboard(
  p_week_start TIMESTAMPTZ,
  p_week_end TIMESTAMPTZ
)
RETURNS TABLE (
  user_id UUID,
  start_wallet_value BIGINT,
  start_portfolio_value BIGINT,
  start_account_value BIGINT,
  end_wallet_value BIGINT,
  end_portfolio_value BIGINT,
  end_account_value BIGINT,
  deposits_week BIGINT,
  weekly_return NUMERIC,
  rank BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH
  portfolio_values AS (
    SELECT
      p.user_id,
      COALESCE(SUM(
        p.quantity * (
          CASE WHEN COALESCE(t.shares_outstanding, 0) > 0
            THEN t.market_cap::numeric / t.shares_outstanding
            ELSE 0
          END
        )
      ), 0)::BIGINT AS portfolio_value
    FROM positions p
    JOIN teams t ON t.id = p.team_id
    GROUP BY p.user_id
  ),
  users_with_accounts AS (
    SELECT pr.id AS user_id
    FROM profiles pr
    WHERE pr.wallet_balance > 0
       OR EXISTS (SELECT 1 FROM positions pos WHERE pos.user_id = pr.id)
  ),
  end_snapshot AS (
    SELECT
      u.user_id,
      COALESCE(pr.wallet_balance, 0)::BIGINT AS end_wallet_value,
      COALESCE(pv.portfolio_value, 0)::BIGINT AS end_portfolio_value,
      (COALESCE(pr.wallet_balance, 0) + COALESCE(pv.portfolio_value, 0))::BIGINT AS end_account_value
    FROM users_with_accounts u
    JOIN profiles pr ON pr.id = u.user_id
    LEFT JOIN portfolio_values pv ON pv.user_id = u.user_id
  ),
  deposits AS (
    SELECT
      wt.user_id,
      COALESCE(SUM(wt.amount_cents), 0)::BIGINT AS deposits_week
    FROM wallet_transactions wt
    WHERE wt.type = 'deposit'
      AND wt.created_at >= p_week_start
      AND wt.created_at < p_week_end
    GROUP BY wt.user_id
  ),
  returns AS (
    SELECT
      e.user_id,
      GREATEST(e.end_wallet_value - COALESCE(d.deposits_week, 0), 0)::BIGINT AS start_wallet_value,
      e.end_portfolio_value AS start_portfolio_value,
      GREATEST(e.end_account_value - COALESCE(d.deposits_week, 0), 0)::BIGINT AS start_account_value,
      e.end_wallet_value,
      e.end_portfolio_value,
      e.end_account_value,
      COALESCE(d.deposits_week, 0)::BIGINT AS deposits_week,
      CASE
        WHEN GREATEST(e.end_account_value - COALESCE(d.deposits_week, 0), 0) > 0
        THEN (
          (e.end_account_value - GREATEST(e.end_account_value - COALESCE(d.deposits_week, 0), 0) - COALESCE(d.deposits_week, 0))::NUMERIC
          / GREATEST(e.end_account_value - COALESCE(d.deposits_week, 0), 0)
        )
        ELSE 0::NUMERIC
      END AS weekly_return
    FROM end_snapshot e
    LEFT JOIN deposits d ON d.user_id = e.user_id
  ),
  ranked AS (
    SELECT
      r.*,
      RANK() OVER (ORDER BY r.weekly_return DESC)::BIGINT AS rank
    FROM returns r
  )
  SELECT
    ranked.user_id,
    ranked.start_wallet_value,
    ranked.start_portfolio_value,
    ranked.start_account_value,
    ranked.end_wallet_value,
    ranked.end_portfolio_value,
    ranked.end_account_value,
    ranked.deposits_week,
    ranked.weekly_return,
    ranked.rank
  FROM ranked;
END;
$$;
