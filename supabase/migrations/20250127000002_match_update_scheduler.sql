-- Database function to automatically update match data
-- This runs on the server, not in user browsers

CREATE OR REPLACE FUNCTION update_match_data_from_api()
RETURNS TABLE(updated_count INTEGER, error_message TEXT) 
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_fixture RECORD;
  v_external_id TEXT;
  v_match_status TEXT;
  v_home_score INTEGER;
  v_away_score INTEGER;
  v_error_message TEXT := '';
BEGIN
  -- Get all fixtures that need updating:
  -- - Status is 'scheduled' or 'closed' 
  -- - Kickoff time is within last 2 hours or in next 48 hours
  -- - External ID exists
  
  FOR v_fixture IN 
    SELECT f.id, f.external_id, f.home_team_id, f.away_team_id, 
           f.kickoff_at, f.status, f.result
    FROM fixtures f
    WHERE f.external_id IS NOT NULL
      AND f.status IN ('scheduled', 'closed')
      AND f.kickoff_at >= NOW() - INTERVAL '2 hours'
      AND f.kickoff_at <= NOW() + INTERVAL '48 hours'
  LOOP
    -- In a real implementation, you would fetch from the Football API here
    -- For now, we'll just update the database structure to support this
    -- You'll need to set up a separate background job (cron or serverless function)
    -- to call this function and provide the API data
    
    -- This is a placeholder - the actual API call should happen
    -- in a scheduled Supabase Edge Function or external cron job
    RAISE NOTICE 'Fixture % needs to be updated (external_id: %)', 
      v_fixture.id, v_fixture.external_id;
  END LOOP;
  
  RETURN QUERY SELECT v_updated_count, v_error_message;
END;
$$;

-- Create a function to manually trigger match updates
CREATE OR REPLACE FUNCTION trigger_match_update_checks()
RETURNS VOID
LANGUAGE sql
AS $$
  -- Check for fixtures that need snapshots (30 min before kickoff)
  PERFORM 1
  FROM fixtures
  WHERE status = 'scheduled'
    AND kickoff_at > NOW()
    AND kickoff_at - INTERVAL '30 minutes' <= NOW()
    AND (snapshot_home_cap IS NULL OR snapshot_away_cap IS NULL);
  
  -- Check for fixtures that need result updates (match finished)
  PERFORM 1
  FROM fixtures
  WHERE status IN ('scheduled', 'closed')
    AND kickoff_at <= NOW() - INTERVAL '30 minutes'
    AND result = 'pending';
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION update_match_data_from_api() TO authenticated;
GRANT EXECUTE ON FUNCTION update_match_data_from_api() TO anon;
GRANT EXECUTE ON FUNCTION trigger_match_update_checks() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_match_update_checks() TO anon;

COMMENT ON FUNCTION update_match_data_from_api() IS 'Stub function for server-side match updates. Implement the API fetch in a separate scheduled job.';
COMMENT ON FUNCTION trigger_match_update_checks() IS 'Helper function to check if fixtures need updates';





