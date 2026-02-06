-- RPC that returns leaderboard with display name (bypasses join RLS)
-- Uses full_name, first_name+last_name, username (email), or 'Unknown User' as fallbacks
CREATE OR REPLACE FUNCTION public.get_weekly_leaderboard_current()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  rank BIGINT,
  weekly_return NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    wl.user_id,
    COALESCE(
      CASE WHEN p.full_name IS NOT NULL AND trim(p.full_name) <> '' 
           AND p.full_name !~ '^User [0-9a-fA-F]{8}$'  -- ignore "User xxxxxxxx" placeholder
           THEN trim(p.full_name) END,
      NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
      p.username,
      'Unknown User'
    ) AS full_name,
    wl.rank::BIGINT,
    wl.weekly_return
  FROM weekly_leaderboard wl
  JOIN profiles p ON p.id = wl.user_id
  WHERE wl.is_latest = true
  ORDER BY wl.rank ASC;
$$;
