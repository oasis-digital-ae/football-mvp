-- Isolated to avoid Supabase CLI parser "syntax error at or near as" when splitting CTEs
CREATE OR REPLACE FUNCTION public.generate_weekly_leaderboard_exact_v2(p_week_start timestamp with time zone, p_week_end timestamp with time zone)
 RETURNS TABLE(user_id uuid, start_wallet_value bigint, start_portfolio_value bigint, start_account_value bigint, end_wallet_value bigint, end_portfolio_value bigint, end_account_value bigint, deposits_week bigint, weekly_return numeric, rank bigint, week_number integer)
 LANGUAGE sql
 STABLE
AS $function$
WITH

-- Compute week number
computed_week AS (
  SELECT COALESCE(
    (SELECT wl.week_number
     FROM weekly_leaderboard wl
     WHERE wl.week_start = p_week_start
     LIMIT 1),
    (SELECT COALESCE(MAX(wl.week_number), 0) + 1
     FROM weekly_leaderboard wl
     WHERE wl.week_start < p_week_start)
  ) AS wk
),

-- Previous week's ending values
prev_week AS (
  SELECT DISTINCT ON (wl.user_id)
    wl.user_id,
    wl.end_wallet_value,
    wl.end_portfolio_value
  FROM weekly_leaderboard wl
  WHERE wl.week_end < p_week_start
    AND wl.week_end >= (p_week_start - INTERVAL '7 days')
  ORDER BY wl.user_id, wl.week_end DESC
),

-- Current wallet values
current_wallet AS (
  SELECT
    p.id AS user_id,
    p.wallet_balance AS current_wallet_value
  FROM profiles p
),

--  Portfolio now comes directly from profiles
current_portfolio AS (
  SELECT
    p.id AS user_id,
    COALESCE(p.portfolio_value, 0)::BIGINT AS current_portfolio_value
  FROM profiles p
),

-- Deposits during this week
week_deposits AS (
  SELECT
    wt.user_id,
    COALESCE(SUM(wt.amount_cents), 0)::BIGINT AS deposit_amount
  FROM wallet_transactions wt
  WHERE wt.type = 'deposit'
    AND wt.created_at >= p_week_start
    AND wt.created_at <= p_week_end
  GROUP BY wt.user_id
),

-- Active users ONLY if historically active
active_users AS (
  SELECT DISTINCT user_id
  FROM (
    SELECT user_id FROM prev_week
    UNION
    SELECT user_id FROM week_deposits
    UNION
    SELECT o.user_id
    FROM orders o
    WHERE COALESCE(o.executed_at, o.created_at)
          BETWEEN p_week_start AND p_week_end
  ) x
),

-- Assemble all numbers
assembled_data AS (
  SELECT
    au.user_id,
    COALESCE(pw.end_wallet_value, 0)::BIGINT AS start_wallet,
    COALESCE(pw.end_portfolio_value, 0)::BIGINT AS start_portfolio,
    COALESCE(cw.current_wallet_value, 0)::BIGINT AS end_wallet,
    COALESCE(cp.current_portfolio_value, 0)::BIGINT AS end_portfolio,
    COALESCE(wd.deposit_amount, 0)::BIGINT AS deposits
  FROM active_users au
  LEFT JOIN prev_week pw ON pw.user_id = au.user_id
  LEFT JOIN current_wallet cw ON cw.user_id = au.user_id
  LEFT JOIN current_portfolio cp ON cp.user_id = au.user_id
  LEFT JOIN week_deposits wd ON wd.user_id = au.user_id
),

-- Compute weekly returns
calculated_returns AS (
  SELECT
    user_id,
    start_wallet,
    start_portfolio,
    (start_wallet + start_portfolio)::NUMERIC AS start_total,
    end_wallet,
    end_portfolio,
    (end_wallet + end_portfolio)::NUMERIC AS end_total,
    deposits,
    CASE
      WHEN ((start_wallet + start_portfolio) + deposits) = 0
      THEN 0::NUMERIC
      ELSE
        (
          (
            ((end_wallet + end_portfolio)::NUMERIC)
            - ((start_wallet + start_portfolio)::NUMERIC)
            - deposits
          )::NUMERIC
          /
          NULLIF(((start_wallet + start_portfolio) + deposits), 0)::NUMERIC
        )
    END AS weekly_return_decimal
  FROM assembled_data
),

-- Attach username for ranking stability
returns_with_username AS (
  SELECT
    cr.user_id,
    cr.start_wallet,
    cr.start_portfolio,
    cr.start_total,
    cr.end_wallet,
    cr.end_portfolio,
    cr.end_total,
    cr.deposits,
    cr.weekly_return_decimal,
    p.username
  FROM calculated_returns cr
  JOIN profiles p ON p.id = cr.user_id
)

-- Final output
SELECT
  rwu.user_id,
  rwu.start_wallet AS start_wallet_value,
  rwu.start_portfolio AS start_portfolio_value,
  rwu.start_total AS start_account_value,
  rwu.end_wallet AS end_wallet_value,
  rwu.end_portfolio AS end_portfolio_value,
  rwu.end_total AS end_account_value,
  rwu.deposits AS deposits_week,
  ROUND(rwu.weekly_return_decimal, 6) AS weekly_return,
  ROW_NUMBER() OVER (
    ORDER BY rwu.weekly_return_decimal DESC, rwu.username ASC
  )::BIGINT AS rank,
  cw.wk AS week_number
FROM returns_with_username rwu
CROSS JOIN computed_week cw
ORDER BY rwu.weekly_return_decimal DESC, rwu.username ASC;
$function$
;
