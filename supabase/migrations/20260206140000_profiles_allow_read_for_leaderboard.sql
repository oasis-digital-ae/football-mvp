-- Allow authenticated users to read profiles (full_name) for leaderboard display
CREATE POLICY "Allow authenticated read profiles for leaderboard"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);
