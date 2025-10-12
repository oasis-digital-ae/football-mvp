-- Add Match Result Audit Logging
-- Create trigger to log match results when processed

CREATE OR REPLACE FUNCTION log_match_result_audit()
RETURNS TRIGGER AS $$
BEGIN
  -- Log when a fixture status changes to 'applied' (match result processed)
  IF NEW.status = 'applied' AND OLD.status != 'applied' THEN
    INSERT INTO audit_log (
      user_id,
      action,
      table_name,
      record_id,
      new_values,
      created_at
    ) VALUES (
      NULL, -- System action
      'match_result_processed',
      'fixtures',
      NEW.id,
      jsonb_build_object(
        'home_team_id', NEW.home_team_id,
        'away_team_id', NEW.away_team_id,
        'result', NEW.result,
        'home_score', NEW.home_score,
        'away_score', NEW.away_score,
        'status', NEW.status,
        'kickoff_at', NEW.kickoff_at
      ),
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER match_result_audit_trigger
AFTER UPDATE ON fixtures
FOR EACH ROW
EXECUTE FUNCTION log_match_result_audit();

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Match result audit logging trigger created successfully';
END $$;

