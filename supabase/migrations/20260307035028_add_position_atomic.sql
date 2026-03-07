CREATE OR REPLACE FUNCTION public.add_position_atomic(p_user_id uuid, p_team_id integer, p_quantity integer, p_total_invested numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_result JSON;
    v_existing_position RECORD;
BEGIN
    -- Get existing latest position
    SELECT quantity, total_invested, id
    INTO v_existing_position
    FROM positions
    WHERE user_id = p_user_id 
      AND team_id = p_team_id 
      AND is_latest = true
    ORDER BY created_at DESC
    LIMIT 1;

    -- Start transaction (implicit in function)
    BEGIN
        -- Step 1: Set all existing latest positions to false
        UPDATE positions 
        SET is_latest = false,
            updated_at = NOW()
        WHERE user_id = p_user_id 
          AND team_id = p_team_id 
          AND is_latest = true;

        -- Step 2: Insert new position with is_latest = true
        INSERT INTO positions (
            user_id,
            team_id,
            quantity,
            total_invested,
            is_latest,
            created_at,
            updated_at
        ) VALUES (
            p_user_id,
            p_team_id,
            p_quantity,
            p_total_invested,
            true,
            NOW(),
            NOW()
        );

        -- Return success result
        v_result := json_build_object(
            'success', true,
            'message', 'Position added successfully',
            'user_id', p_user_id,
            'team_id', p_team_id,
            'quantity', p_quantity,
            'total_invested', p_total_invested,
            'previous_position', CASE 
                WHEN v_existing_position.id IS NOT NULL THEN
                    json_build_object(
                        'id', v_existing_position.id,
                        'quantity', v_existing_position.quantity,
                        'total_invested', v_existing_position.total_invested
                    )
                ELSE NULL
            END
        );

        RETURN v_result;

    EXCEPTION
        WHEN OTHERS THEN
            -- Return error result
            v_result := json_build_object(
                'success', false,
                'error', SQLERRM,
                'error_code', SQLSTATE
            );
            RETURN v_result;
    END;
END;
$function$
;
