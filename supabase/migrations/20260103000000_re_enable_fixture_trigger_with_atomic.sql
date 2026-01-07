-- Re-enable fixture_result_trigger and update it to use process_match_result_atomic
-- This ensures fixtures are automatically processed when updated with results
-- The trigger was disabled in migration 20250131000019, but we need it for automatic processing

-- Step 1: Update the trigger function to use process_match_result_atomic instead of manual processing
CREATE OR REPLACE FUNCTION public.fixture_result_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER -- CRITICAL: Run with service_role permissions to bypass RLS
SET search_path = public
AS $$
DECLARE
    v_result JSON;
    v_fixture_id INTEGER;
BEGIN
    -- Skip if result is still pending
    IF NEW.result = 'pending' OR OLD.result = NEW.result THEN
        RETURN NEW;
    END IF;
    
    -- Only process when result changes from 'pending' to something else
    IF OLD.result = 'pending' AND NEW.result != 'pending' THEN
        v_fixture_id := NEW.id;
        
        -- Check if entries already exist for this fixture (prevent duplicates)
        IF EXISTS(
            SELECT 1 FROM total_ledger 
            WHERE trigger_event_id = v_fixture_id 
              AND trigger_event_type = 'fixture'
              AND ledger_type IN ('match_win', 'match_loss', 'match_draw')
            LIMIT 1
        ) THEN
            -- Already processed, skip
            RETURN NEW;
        END IF;
        
        -- Ensure snapshots exist before processing
        IF NEW.snapshot_home_cap IS NULL OR NEW.snapshot_away_cap IS NULL THEN
            -- Capture snapshots if missing
            UPDATE fixtures SET
                snapshot_home_cap = (SELECT market_cap FROM teams WHERE id = NEW.home_team_id),
                snapshot_away_cap = (SELECT market_cap FROM teams WHERE id = NEW.away_team_id)
            WHERE id = v_fixture_id;
            
            -- Refresh NEW record with snapshots
            SELECT snapshot_home_cap, snapshot_away_cap INTO NEW.snapshot_home_cap, NEW.snapshot_away_cap
            FROM fixtures WHERE id = v_fixture_id;
        END IF;
        
        -- Only process if snapshots exist
        IF NEW.snapshot_home_cap IS NOT NULL AND NEW.snapshot_away_cap IS NOT NULL THEN
            -- Use the atomic function to process the match result
            SELECT process_match_result_atomic(v_fixture_id) INTO v_result;
            
            -- Log if processing failed
            IF v_result->>'success' = 'false' THEN
                RAISE WARNING 'Failed to process fixture %: %', v_fixture_id, v_result->>'error';
            END IF;
        ELSE
            RAISE WARNING 'Skipping fixture % processing: missing snapshots', v_fixture_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fixture_result_trigger() IS 
  'Trigger function that processes match results using process_match_result_atomic. Runs as SECURITY DEFINER to bypass RLS. Automatically processes fixtures when result changes from pending to final.';

-- Step 2: Re-enable the trigger
ALTER TABLE fixtures ENABLE TRIGGER fixture_result_trigger;

-- Verify trigger is enabled
DO $$
DECLARE
    v_enabled TEXT;
BEGIN
    SELECT tgenabled INTO v_enabled
    FROM pg_trigger
    WHERE tgname = 'fixture_result_trigger'
    AND tgrelid = 'fixtures'::regclass;
    
    IF v_enabled = 'O' THEN
        RAISE NOTICE '✅ fixture_result_trigger is now ENABLED';
    ELSE
        RAISE WARNING '⚠️ fixture_result_trigger status: % (expected O for enabled)', v_enabled;
    END IF;
END $$;



