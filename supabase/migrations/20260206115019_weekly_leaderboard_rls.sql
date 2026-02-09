-- Enable RLS on weekly_leaderboard
ALTER TABLE public.weekly_leaderboard ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read leaderboard (public leaderboard)
CREATE POLICY "Allow authenticated read access"
ON public.weekly_leaderboard
FOR SELECT
TO authenticated
USING (true);
