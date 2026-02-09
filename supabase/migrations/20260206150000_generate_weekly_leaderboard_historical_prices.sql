-- generate_weekly_leaderboard: uses total_ledger for historical market caps
-- Gives real weekly returns: (end - start - deposits) / start
-- start_portfolio: positions valued at market_cap from total_ledger at week_start
-- start_wallet: end_wallet - net wallet change (deposits + sales - purchases) during week
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
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH
  team_cap_at_start AS (
    SELECT DISTINCT ON (tl.team_id)
      tl.team_id,
      tl.market_cap_after,
      COALESCE(tl.shares_outstanding_after, 1000)::INTEGER AS shares_outstanding
    FROM total_ledger tl
    WHERE tl.event_date <= p_week_start
    ORDER BY tl.team_id, tl.event_date DESC
  ),
  team_cap_full AS (
    SELECT t.id AS team_id,
      COALESCE(tcs.market_cap_after, t.market_cap)::BIGINT AS market_cap,
      COALESCE(tcs.shares_outstanding, COALESCE(t.shares_outstanding, 1000))::INTEGER AS shares_outstanding
    FROM teams t
    LEFT JOIN team_cap_at_start tcs ON tcs.team_id = t.id
  ),
  sp AS (
    SELECT p.user_id AS uid,
      COALESCE(SUM(p.quantity * (tc.market_cap::numeric / NULLIF(tc.shares_outstanding, 0))), 0)::BIGINT AS pv
    FROM positions p
    JOIN team_cap_full tc ON tc.team_id = p.team_id
    GROUP BY p.user_id
  ),
  ep AS (
    SELECT p.user_id AS uid,
      COALESCE(SUM(p.quantity * (t.market_cap::numeric / NULLIF(COALESCE(t.shares_outstanding, 1000), 0))), 0)::BIGINT AS pv
    FROM positions p
    JOIN teams t ON t.id = p.team_id
    GROUP BY p.user_id
  ),
  wnc AS (
    SELECT wt.user_id AS uid,
      SUM(CASE WHEN wt.type = 'deposit' THEN wt.amount_cents WHEN wt.type = 'sale' THEN wt.amount_cents WHEN wt.type = 'purchase' THEN -wt.amount_cents ELSE 0 END)::BIGINT AS net
    FROM wallet_transactions wt
    WHERE wt.created_at >= p_week_start AND wt.created_at < p_week_end
    GROUP BY wt.user_id
  ),
  dep AS (
    SELECT wt.user_id AS uid, COALESCE(SUM(wt.amount_cents), 0)::BIGINT AS amt
    FROM wallet_transactions wt
    WHERE wt.type = 'deposit' AND wt.created_at >= p_week_start AND wt.created_at < p_week_end
    GROUP BY wt.user_id
  ),
  uwa AS (
    SELECT pr.id AS uid FROM profiles pr
    WHERE pr.wallet_balance > 0 OR EXISTS (SELECT 1 FROM positions pos WHERE pos.user_id = pr.id)
  ),
  snap AS (
    SELECT u.uid,
      COALESCE(sp.pv, 0)::BIGINT AS spv,
      COALESCE(ep.pv, 0)::BIGINT AS epv,
      COALESCE(pr.wallet_balance, 0)::BIGINT AS ew,
      COALESCE(wnc.net, 0)::BIGINT AS wnet,
      COALESCE(dep.amt, 0)::BIGINT AS dep_amt
    FROM uwa u
    JOIN profiles pr ON pr.id = u.uid
    LEFT JOIN sp ON sp.uid = u.uid
    LEFT JOIN ep ON ep.uid = u.uid
    LEFT JOIN wnc ON wnc.uid = u.uid
    LEFT JOIN dep ON dep.uid = u.uid
  ),
  calc AS (
    SELECT uid,
      spv AS start_portfolio_value,
      epv AS end_portfolio_value,
      ew AS end_wallet_value,
      (ew - wnet)::BIGINT AS start_wallet_value,
      dep_amt AS deposits_week,
      CASE WHEN (ew - wnet + spv) > 0
        THEN ((ew + epv) - (ew - wnet + spv) - dep_amt)::NUMERIC / (ew - wnet + spv)
        ELSE 0::NUMERIC
      END AS weekly_return
    FROM snap
  ),
  ranked AS (
    SELECT uid, start_wallet_value, start_portfolio_value,
      (start_wallet_value + start_portfolio_value)::BIGINT AS start_account_value,
      end_wallet_value, end_portfolio_value,
      (end_wallet_value + end_portfolio_value)::BIGINT AS end_account_value,
      deposits_week, weekly_return,
      RANK() OVER (ORDER BY weekly_return DESC)::BIGINT AS r
    FROM calc
  )
  SELECT uid, start_wallet_value, start_portfolio_value, start_account_value,
    end_wallet_value, end_portfolio_value, end_account_value,
    deposits_week, weekly_return, r
  FROM ranked;
$$;
