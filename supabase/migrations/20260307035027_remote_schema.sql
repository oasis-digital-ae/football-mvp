drop policy "Users can view own wallet transactions" on "public"."wallet_transactions";

revoke delete on table "public"."audit_log" from "anon";

revoke insert on table "public"."audit_log" from "anon";

revoke references on table "public"."audit_log" from "anon";

revoke select on table "public"."audit_log" from "anon";

revoke trigger on table "public"."audit_log" from "anon";

revoke truncate on table "public"."audit_log" from "anon";

revoke update on table "public"."audit_log" from "anon";

revoke delete on table "public"."audit_log" from "authenticated";

revoke insert on table "public"."audit_log" from "authenticated";

revoke references on table "public"."audit_log" from "authenticated";

revoke select on table "public"."audit_log" from "authenticated";

revoke trigger on table "public"."audit_log" from "authenticated";

revoke truncate on table "public"."audit_log" from "authenticated";

revoke update on table "public"."audit_log" from "authenticated";

revoke delete on table "public"."audit_log" from "service_role";

revoke insert on table "public"."audit_log" from "service_role";

revoke references on table "public"."audit_log" from "service_role";

revoke select on table "public"."audit_log" from "service_role";

revoke trigger on table "public"."audit_log" from "service_role";

revoke truncate on table "public"."audit_log" from "service_role";

revoke update on table "public"."audit_log" from "service_role";

revoke delete on table "public"."deposits" from "anon";

revoke insert on table "public"."deposits" from "anon";

revoke references on table "public"."deposits" from "anon";

revoke select on table "public"."deposits" from "anon";

revoke trigger on table "public"."deposits" from "anon";

revoke truncate on table "public"."deposits" from "anon";

revoke update on table "public"."deposits" from "anon";

revoke delete on table "public"."deposits" from "authenticated";

revoke insert on table "public"."deposits" from "authenticated";

revoke references on table "public"."deposits" from "authenticated";

revoke select on table "public"."deposits" from "authenticated";

revoke trigger on table "public"."deposits" from "authenticated";

revoke truncate on table "public"."deposits" from "authenticated";

revoke update on table "public"."deposits" from "authenticated";

revoke delete on table "public"."deposits" from "service_role";

revoke insert on table "public"."deposits" from "service_role";

revoke references on table "public"."deposits" from "service_role";

revoke select on table "public"."deposits" from "service_role";

revoke trigger on table "public"."deposits" from "service_role";

revoke truncate on table "public"."deposits" from "service_role";

revoke update on table "public"."deposits" from "service_role";

revoke delete on table "public"."fixtures" from "anon";

revoke insert on table "public"."fixtures" from "anon";

revoke references on table "public"."fixtures" from "anon";

revoke select on table "public"."fixtures" from "anon";

revoke trigger on table "public"."fixtures" from "anon";

revoke truncate on table "public"."fixtures" from "anon";

revoke update on table "public"."fixtures" from "anon";

revoke delete on table "public"."fixtures" from "authenticated";

revoke insert on table "public"."fixtures" from "authenticated";

revoke references on table "public"."fixtures" from "authenticated";

revoke select on table "public"."fixtures" from "authenticated";

revoke trigger on table "public"."fixtures" from "authenticated";

revoke truncate on table "public"."fixtures" from "authenticated";

revoke update on table "public"."fixtures" from "authenticated";

revoke delete on table "public"."fixtures" from "service_role";

revoke insert on table "public"."fixtures" from "service_role";

revoke references on table "public"."fixtures" from "service_role";

revoke select on table "public"."fixtures" from "service_role";

revoke trigger on table "public"."fixtures" from "service_role";

revoke truncate on table "public"."fixtures" from "service_role";

revoke update on table "public"."fixtures" from "service_role";

revoke delete on table "public"."orders" from "anon";

revoke insert on table "public"."orders" from "anon";

revoke references on table "public"."orders" from "anon";

revoke select on table "public"."orders" from "anon";

revoke trigger on table "public"."orders" from "anon";

revoke truncate on table "public"."orders" from "anon";

revoke update on table "public"."orders" from "anon";

revoke delete on table "public"."orders" from "authenticated";

revoke insert on table "public"."orders" from "authenticated";

revoke references on table "public"."orders" from "authenticated";

revoke select on table "public"."orders" from "authenticated";

revoke trigger on table "public"."orders" from "authenticated";

revoke truncate on table "public"."orders" from "authenticated";

revoke update on table "public"."orders" from "authenticated";

revoke delete on table "public"."orders" from "service_role";

revoke insert on table "public"."orders" from "service_role";

revoke references on table "public"."orders" from "service_role";

revoke select on table "public"."orders" from "service_role";

revoke trigger on table "public"."orders" from "service_role";

revoke truncate on table "public"."orders" from "service_role";

revoke update on table "public"."orders" from "service_role";

revoke delete on table "public"."positions" from "anon";

revoke insert on table "public"."positions" from "anon";

revoke references on table "public"."positions" from "anon";

revoke select on table "public"."positions" from "anon";

revoke trigger on table "public"."positions" from "anon";

revoke truncate on table "public"."positions" from "anon";

revoke update on table "public"."positions" from "anon";

revoke delete on table "public"."positions" from "authenticated";

revoke insert on table "public"."positions" from "authenticated";

revoke references on table "public"."positions" from "authenticated";

revoke select on table "public"."positions" from "authenticated";

revoke trigger on table "public"."positions" from "authenticated";

revoke truncate on table "public"."positions" from "authenticated";

revoke update on table "public"."positions" from "authenticated";

revoke delete on table "public"."positions" from "service_role";

revoke insert on table "public"."positions" from "service_role";

revoke references on table "public"."positions" from "service_role";

revoke select on table "public"."positions" from "service_role";

revoke trigger on table "public"."positions" from "service_role";

revoke truncate on table "public"."positions" from "service_role";

revoke update on table "public"."positions" from "service_role";

revoke delete on table "public"."profiles" from "anon";

revoke insert on table "public"."profiles" from "anon";

revoke references on table "public"."profiles" from "anon";

revoke select on table "public"."profiles" from "anon";

revoke trigger on table "public"."profiles" from "anon";

revoke truncate on table "public"."profiles" from "anon";

revoke update on table "public"."profiles" from "anon";

revoke delete on table "public"."profiles" from "authenticated";

revoke insert on table "public"."profiles" from "authenticated";

revoke references on table "public"."profiles" from "authenticated";

revoke select on table "public"."profiles" from "authenticated";

revoke trigger on table "public"."profiles" from "authenticated";

revoke truncate on table "public"."profiles" from "authenticated";

revoke update on table "public"."profiles" from "authenticated";

revoke delete on table "public"."profiles" from "service_role";

revoke insert on table "public"."profiles" from "service_role";

revoke references on table "public"."profiles" from "service_role";

revoke select on table "public"."profiles" from "service_role";

revoke trigger on table "public"."profiles" from "service_role";

revoke truncate on table "public"."profiles" from "service_role";

revoke update on table "public"."profiles" from "service_role";

revoke delete on table "public"."rate_limits" from "anon";

revoke insert on table "public"."rate_limits" from "anon";

revoke references on table "public"."rate_limits" from "anon";

revoke select on table "public"."rate_limits" from "anon";

revoke trigger on table "public"."rate_limits" from "anon";

revoke truncate on table "public"."rate_limits" from "anon";

revoke update on table "public"."rate_limits" from "anon";

revoke delete on table "public"."rate_limits" from "authenticated";

revoke insert on table "public"."rate_limits" from "authenticated";

revoke references on table "public"."rate_limits" from "authenticated";

revoke select on table "public"."rate_limits" from "authenticated";

revoke trigger on table "public"."rate_limits" from "authenticated";

revoke truncate on table "public"."rate_limits" from "authenticated";

revoke update on table "public"."rate_limits" from "authenticated";

revoke delete on table "public"."rate_limits" from "service_role";

revoke insert on table "public"."rate_limits" from "service_role";

revoke references on table "public"."rate_limits" from "service_role";

revoke select on table "public"."rate_limits" from "service_role";

revoke trigger on table "public"."rate_limits" from "service_role";

revoke truncate on table "public"."rate_limits" from "service_role";

revoke update on table "public"."rate_limits" from "service_role";

revoke delete on table "public"."stripe_events" from "anon";

revoke insert on table "public"."stripe_events" from "anon";

revoke references on table "public"."stripe_events" from "anon";

revoke select on table "public"."stripe_events" from "anon";

revoke trigger on table "public"."stripe_events" from "anon";

revoke truncate on table "public"."stripe_events" from "anon";

revoke update on table "public"."stripe_events" from "anon";

revoke delete on table "public"."stripe_events" from "authenticated";

revoke insert on table "public"."stripe_events" from "authenticated";

revoke references on table "public"."stripe_events" from "authenticated";

revoke select on table "public"."stripe_events" from "authenticated";

revoke trigger on table "public"."stripe_events" from "authenticated";

revoke truncate on table "public"."stripe_events" from "authenticated";

revoke update on table "public"."stripe_events" from "authenticated";

revoke delete on table "public"."stripe_events" from "service_role";

revoke insert on table "public"."stripe_events" from "service_role";

revoke references on table "public"."stripe_events" from "service_role";

revoke select on table "public"."stripe_events" from "service_role";

revoke trigger on table "public"."stripe_events" from "service_role";

revoke truncate on table "public"."stripe_events" from "service_role";

revoke update on table "public"."stripe_events" from "service_role";

revoke delete on table "public"."teams" from "anon";

revoke insert on table "public"."teams" from "anon";

revoke references on table "public"."teams" from "anon";

revoke select on table "public"."teams" from "anon";

revoke trigger on table "public"."teams" from "anon";

revoke truncate on table "public"."teams" from "anon";

revoke update on table "public"."teams" from "anon";

revoke delete on table "public"."teams" from "authenticated";

revoke insert on table "public"."teams" from "authenticated";

revoke references on table "public"."teams" from "authenticated";

revoke select on table "public"."teams" from "authenticated";

revoke trigger on table "public"."teams" from "authenticated";

revoke truncate on table "public"."teams" from "authenticated";

revoke update on table "public"."teams" from "authenticated";

revoke delete on table "public"."teams" from "service_role";

revoke insert on table "public"."teams" from "service_role";

revoke references on table "public"."teams" from "service_role";

revoke select on table "public"."teams" from "service_role";

revoke trigger on table "public"."teams" from "service_role";

revoke truncate on table "public"."teams" from "service_role";

revoke update on table "public"."teams" from "service_role";

revoke delete on table "public"."total_ledger" from "anon";

revoke insert on table "public"."total_ledger" from "anon";

revoke references on table "public"."total_ledger" from "anon";

revoke select on table "public"."total_ledger" from "anon";

revoke trigger on table "public"."total_ledger" from "anon";

revoke truncate on table "public"."total_ledger" from "anon";

revoke update on table "public"."total_ledger" from "anon";

revoke delete on table "public"."total_ledger" from "authenticated";

revoke insert on table "public"."total_ledger" from "authenticated";

revoke references on table "public"."total_ledger" from "authenticated";

revoke select on table "public"."total_ledger" from "authenticated";

revoke trigger on table "public"."total_ledger" from "authenticated";

revoke truncate on table "public"."total_ledger" from "authenticated";

revoke update on table "public"."total_ledger" from "authenticated";

revoke delete on table "public"."total_ledger" from "service_role";

revoke insert on table "public"."total_ledger" from "service_role";

revoke references on table "public"."total_ledger" from "service_role";

revoke select on table "public"."total_ledger" from "service_role";

revoke trigger on table "public"."total_ledger" from "service_role";

revoke truncate on table "public"."total_ledger" from "service_role";

revoke update on table "public"."total_ledger" from "service_role";

revoke delete on table "public"."transfers_ledger" from "anon";

revoke insert on table "public"."transfers_ledger" from "anon";

revoke references on table "public"."transfers_ledger" from "anon";

revoke select on table "public"."transfers_ledger" from "anon";

revoke trigger on table "public"."transfers_ledger" from "anon";

revoke truncate on table "public"."transfers_ledger" from "anon";

revoke update on table "public"."transfers_ledger" from "anon";

revoke delete on table "public"."transfers_ledger" from "authenticated";

revoke insert on table "public"."transfers_ledger" from "authenticated";

revoke references on table "public"."transfers_ledger" from "authenticated";

revoke select on table "public"."transfers_ledger" from "authenticated";

revoke trigger on table "public"."transfers_ledger" from "authenticated";

revoke truncate on table "public"."transfers_ledger" from "authenticated";

revoke update on table "public"."transfers_ledger" from "authenticated";

revoke delete on table "public"."transfers_ledger" from "service_role";

revoke insert on table "public"."transfers_ledger" from "service_role";

revoke references on table "public"."transfers_ledger" from "service_role";

revoke select on table "public"."transfers_ledger" from "service_role";

revoke trigger on table "public"."transfers_ledger" from "service_role";

revoke truncate on table "public"."transfers_ledger" from "service_role";

revoke update on table "public"."transfers_ledger" from "service_role";

revoke delete on table "public"."wallet_transactions" from "anon";

revoke insert on table "public"."wallet_transactions" from "anon";

revoke references on table "public"."wallet_transactions" from "anon";

revoke select on table "public"."wallet_transactions" from "anon";

revoke trigger on table "public"."wallet_transactions" from "anon";

revoke truncate on table "public"."wallet_transactions" from "anon";

revoke update on table "public"."wallet_transactions" from "anon";

revoke delete on table "public"."wallet_transactions" from "authenticated";

revoke insert on table "public"."wallet_transactions" from "authenticated";

revoke references on table "public"."wallet_transactions" from "authenticated";

revoke select on table "public"."wallet_transactions" from "authenticated";

revoke trigger on table "public"."wallet_transactions" from "authenticated";

revoke truncate on table "public"."wallet_transactions" from "authenticated";

revoke update on table "public"."wallet_transactions" from "authenticated";

revoke delete on table "public"."wallet_transactions" from "service_role";

revoke insert on table "public"."wallet_transactions" from "service_role";

revoke references on table "public"."wallet_transactions" from "service_role";

revoke select on table "public"."wallet_transactions" from "service_role";

revoke trigger on table "public"."wallet_transactions" from "service_role";

revoke truncate on table "public"."wallet_transactions" from "service_role";

revoke update on table "public"."wallet_transactions" from "service_role";

revoke delete on table "public"."weekly_leaderboard" from "anon";

revoke insert on table "public"."weekly_leaderboard" from "anon";

revoke references on table "public"."weekly_leaderboard" from "anon";

revoke select on table "public"."weekly_leaderboard" from "anon";

revoke trigger on table "public"."weekly_leaderboard" from "anon";

revoke truncate on table "public"."weekly_leaderboard" from "anon";

revoke update on table "public"."weekly_leaderboard" from "anon";

revoke delete on table "public"."weekly_leaderboard" from "authenticated";

revoke insert on table "public"."weekly_leaderboard" from "authenticated";

revoke references on table "public"."weekly_leaderboard" from "authenticated";

revoke select on table "public"."weekly_leaderboard" from "authenticated";

revoke trigger on table "public"."weekly_leaderboard" from "authenticated";

revoke truncate on table "public"."weekly_leaderboard" from "authenticated";

revoke update on table "public"."weekly_leaderboard" from "authenticated";

revoke delete on table "public"."weekly_leaderboard" from "service_role";

revoke insert on table "public"."weekly_leaderboard" from "service_role";

revoke references on table "public"."weekly_leaderboard" from "service_role";

revoke select on table "public"."weekly_leaderboard" from "service_role";

revoke trigger on table "public"."weekly_leaderboard" from "service_role";

revoke truncate on table "public"."weekly_leaderboard" from "service_role";

revoke update on table "public"."weekly_leaderboard" from "service_role";

revoke delete on table "public"."weekly_leaderboard_backup" from "anon";

revoke insert on table "public"."weekly_leaderboard_backup" from "anon";

revoke references on table "public"."weekly_leaderboard_backup" from "anon";

revoke select on table "public"."weekly_leaderboard_backup" from "anon";

revoke trigger on table "public"."weekly_leaderboard_backup" from "anon";

revoke truncate on table "public"."weekly_leaderboard_backup" from "anon";

revoke update on table "public"."weekly_leaderboard_backup" from "anon";

revoke delete on table "public"."weekly_leaderboard_backup" from "authenticated";

revoke insert on table "public"."weekly_leaderboard_backup" from "authenticated";

revoke references on table "public"."weekly_leaderboard_backup" from "authenticated";

revoke select on table "public"."weekly_leaderboard_backup" from "authenticated";

revoke trigger on table "public"."weekly_leaderboard_backup" from "authenticated";

revoke truncate on table "public"."weekly_leaderboard_backup" from "authenticated";

revoke update on table "public"."weekly_leaderboard_backup" from "authenticated";

revoke delete on table "public"."weekly_leaderboard_backup" from "service_role";

revoke insert on table "public"."weekly_leaderboard_backup" from "service_role";

revoke references on table "public"."weekly_leaderboard_backup" from "service_role";

revoke select on table "public"."weekly_leaderboard_backup" from "service_role";

revoke trigger on table "public"."weekly_leaderboard_backup" from "service_role";

revoke truncate on table "public"."weekly_leaderboard_backup" from "service_role";

revoke update on table "public"."weekly_leaderboard_backup" from "service_role";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.acquire_user_lock(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Use PostgreSQL advisory locks for user-level locking
  -- This prevents concurrent operations on the same user
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));
END;
$function$
;



CREATE OR REPLACE FUNCTION public.add_position_with_history(p_user_id uuid, p_team_id integer, p_quantity integer, p_total_invested numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_result JSON;
    v_existing_position RECORD;
    v_new_position_id INTEGER;
BEGIN
    -- Get existing latest position
    SELECT id, quantity, total_invested
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
        -- This works because the constraint is deferred until end of transaction
        UPDATE positions 
        SET is_latest = false,
            updated_at = NOW()
        WHERE user_id = p_user_id 
          AND team_id = p_team_id 
          AND is_latest = true;

        -- Step 2: Insert new position with is_latest = true
        -- This also works because constraint is deferred
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
        ) RETURNING id INTO v_new_position_id;

        -- Return success result
        v_result := json_build_object(
            'success', true,
            'message', 'Position added successfully with history',
            'user_id', p_user_id,
            'team_id', p_team_id,
            'quantity', p_quantity,
            'total_invested', p_total_invested,
            'new_position_id', v_new_position_id,
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

CREATE OR REPLACE FUNCTION public.calculate_position_total_pnl(p_user_id uuid, p_team_id integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_position RECORD;
  v_team RECORD;
  v_unrealized_pl_cents BIGINT;
  v_realized_pl_cents BIGINT;
  v_total_pl_cents BIGINT;
  v_current_value_cents BIGINT;
  v_total_invested_cents BIGINT;
  v_current_price_cents_per_share BIGINT;
  v_team_cost_basis_total_invested BIGINT;
  v_team_cost_basis_total_quantity INTEGER;
  v_order RECORD;
  v_proportional_cost_cents BIGINT;
BEGIN
  -- Get position
  SELECT * INTO v_position
  FROM positions
  WHERE user_id = p_user_id AND team_id = p_team_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Get team data
  SELECT * INTO v_team
  FROM teams
  WHERE id = p_team_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Calculate current value: (market_cap / total_shares) * quantity
  IF v_team.total_shares > 0 THEN
    v_current_price_cents_per_share := ROUND((v_team.market_cap::NUMERIC / v_team.total_shares))::BIGINT;
    v_current_value_cents := (v_current_price_cents_per_share * v_position.quantity::INTEGER);
  ELSE
    v_current_value_cents := 0;
  END IF;
  
  v_total_invested_cents := COALESCE(v_position.total_invested, 0);
  
  -- Calculate unrealized P&L: current_value - total_invested
  v_unrealized_pl_cents := v_current_value_cents - v_total_invested_cents;
  
  -- Calculate realized P&L from SELL orders
  v_realized_pl_cents := 0;
  v_team_cost_basis_total_invested := 0;
  v_team_cost_basis_total_quantity := 0;
  
  -- Process all orders chronologically (oldest first)
  FOR v_order IN 
    SELECT 
      order_type,
      quantity,
      total_amount,
      executed_at
    FROM orders
    WHERE user_id = p_user_id 
      AND team_id = p_team_id
      AND status = 'FILLED'
      AND executed_at IS NOT NULL
    ORDER BY executed_at ASC, created_at ASC
  LOOP
    IF v_order.order_type = 'BUY' THEN
      v_team_cost_basis_total_invested := v_team_cost_basis_total_invested + v_order.total_amount;
      v_team_cost_basis_total_quantity := v_team_cost_basis_total_quantity + v_order.quantity;
    ELSIF v_order.order_type = 'SELL' THEN
      IF v_team_cost_basis_total_quantity > 0 THEN
        v_proportional_cost_cents := (v_team_cost_basis_total_invested * v_order.quantity) / v_team_cost_basis_total_quantity;
        v_realized_pl_cents := v_realized_pl_cents + (v_order.total_amount - v_proportional_cost_cents);
        v_team_cost_basis_total_invested := v_team_cost_basis_total_invested - v_proportional_cost_cents;
        v_team_cost_basis_total_quantity := v_team_cost_basis_total_quantity - v_order.quantity;
      END IF;
    END IF;
  END LOOP;
  
  -- Total P&L = Unrealized + Realized
  v_total_pl_cents := v_unrealized_pl_cents + v_realized_pl_cents;
  
  RETURN v_total_pl_cents;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_user_portfolio_value(p_user_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_portfolio_value_cents BIGINT := 0;
BEGIN
  -- Calculate total portfolio value from positions
  -- MATCHES TypeScript: calculateSharePrice(marketCap, totalShares, 20.00) * quantity
  -- Formula: sharePrice = MAX(marketCap / totalShares, 20.00)
  -- Note: market_cap is stored in cents, so divide by 100 to get dollars
  -- Note: multiply final value by 100 to store result in cents
  
  SELECT COALESCE(
    SUM(
      ROUND(
        GREATEST(
          (t.market_cap::NUMERIC / 100.0) / NULLIF(t.total_shares, 0),
          20.00
        ) * p.quantity * 100.0
      )
    ),
    0
  )::BIGINT
  INTO v_portfolio_value_cents
  FROM positions p
  INNER JOIN teams t ON t.id = p.team_id
  WHERE p.user_id = p_user_id
    AND p.quantity > 0;
  
  RETURN v_portfolio_value_cents;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_season_data()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Clear all data except teams and profiles
    DELETE FROM audit_log;
    DELETE FROM transfers_ledger;
    DELETE FROM positions;
    DELETE FROM orders;
    DELETE FROM fixtures;
    
    -- Reset teams to default values
    UPDATE teams SET 
        market_cap = 100.00,
        total_shares = 1000000,
        available_shares = 1000000,
        is_tradeable = true;
    
    RAISE NOTICE 'Season data cleared successfully';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_ledger_entry(p_team_id integer, p_ledger_type text, p_amount_transferred numeric DEFAULT 0, p_price_impact numeric DEFAULT 0, p_shares_traded integer DEFAULT 0, p_trigger_event_id integer DEFAULT NULL::integer, p_trigger_event_type text DEFAULT NULL::text, p_opponent_team_id integer DEFAULT NULL::integer, p_opponent_team_name text DEFAULT NULL::text, p_match_result text DEFAULT NULL::text, p_match_score text DEFAULT NULL::text, p_is_home_match boolean DEFAULT NULL::boolean, p_event_description text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_ledger_id INTEGER;
    v_current_state RECORD;
    v_opponent_name TEXT;
BEGIN
    -- Get current team state
    SELECT 
        market_cap,
        shares_outstanding,
        CASE 
            WHEN shares_outstanding > 0 THEN market_cap / shares_outstanding
            ELSE 20.00
        END as current_share_price
    INTO v_current_state
    FROM teams
    WHERE id = p_team_id;
    
    -- Get opponent name if not provided
    IF p_opponent_team_id IS NOT NULL AND p_opponent_team_name IS NULL THEN
        SELECT name INTO v_opponent_name FROM teams WHERE id = p_opponent_team_id;
    ELSE
        v_opponent_name := p_opponent_team_name;
    END IF;
    
    -- Create ledger entry
    INSERT INTO total_ledger (
        team_id,
        ledger_type,
        event_description,
        trigger_event_id,
        trigger_event_type,
        opponent_team_id,
        opponent_team_name,
        match_result,
        match_score,
        is_home_match,
        amount_transferred,
        price_impact,
        market_cap_before,
        market_cap_after,
        shares_outstanding_before,
        shares_outstanding_after,
        shares_traded,
        share_price_before,
        share_price_after,
        notes
    ) VALUES (
        p_team_id,
        p_ledger_type,
        COALESCE(p_event_description, p_ledger_type),
        p_trigger_event_id,
        p_trigger_event_type,
        p_opponent_team_id,
        v_opponent_name,
        p_match_result,
        p_match_score,
        p_is_home_match,
        p_amount_transferred,
        p_price_impact,
        v_current_state.market_cap,
        v_current_state.market_cap + p_price_impact,
        v_current_state.shares_outstanding,
        v_current_state.shares_outstanding + p_shares_traded,
        p_shares_traded,
        v_current_state.current_share_price,
        CASE 
            WHEN (v_current_state.shares_outstanding + p_shares_traded) > 0 
            THEN (v_current_state.market_cap + p_price_impact) / (v_current_state.shares_outstanding + p_shares_traded)
            ELSE v_current_state.current_share_price
        END,
        p_notes
    ) RETURNING id INTO v_ledger_id;
    
    RETURN v_ledger_id;
END;
$function$
;



CREATE OR REPLACE FUNCTION public.create_team_snapshot(p_team_id integer, p_snapshot_type text, p_trigger_event_id integer DEFAULT NULL::integer, p_trigger_event_type text DEFAULT NULL::text, p_match_result text DEFAULT NULL::text, p_price_impact numeric DEFAULT 0, p_shares_traded integer DEFAULT 0, p_trade_amount numeric DEFAULT 0)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_snapshot_id INTEGER;
    v_current_state RECORD;
BEGIN
    -- Get current team state (SIMPLIFIED)
    SELECT 
        market_cap,
        shares_outstanding,
        CASE 
            WHEN shares_outstanding > 0 
            THEN market_cap / shares_outstanding 
            ELSE 20.00 
        END as current_share_price
    INTO v_current_state
    FROM teams 
    WHERE id = p_team_id;
    
    -- Insert snapshot (SIMPLIFIED)
    INSERT INTO team_state_snapshots (
        team_id,
        snapshot_type,
        trigger_event_id,
        trigger_event_type,
        market_cap,
        shares_outstanding,
        current_share_price,
        match_result,
        price_impact,
        shares_traded,
        trade_amount
    ) VALUES (
        p_team_id,
        p_snapshot_type,
        p_trigger_event_id,
        p_trigger_event_type,
        v_current_state.market_cap,
        v_current_state.shares_outstanding,
        v_current_state.current_share_price,
        p_match_result,
        p_price_impact,
        p_shares_traded,
        p_trade_amount
    ) RETURNING id INTO v_snapshot_id;
    
    RETURN v_snapshot_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_team_snapshot(p_team_id integer, p_snapshot_type text, p_trigger_event_id integer DEFAULT NULL::integer, p_trigger_event_type text DEFAULT NULL::text, p_match_result text DEFAULT NULL::text, p_price_impact numeric DEFAULT 0, p_shares_traded integer DEFAULT 0, p_trade_amount numeric DEFAULT 0, p_effective_at timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_snapshot_id INTEGER;
    v_current_state RECORD;
BEGIN
    -- Get current team state
    SELECT
        market_cap,
        shares_outstanding,
        CASE
            WHEN shares_outstanding > 0
            THEN market_cap / shares_outstanding
            ELSE 20.00
        END as current_share_price
    INTO v_current_state
    FROM teams
    WHERE id = p_team_id;

    -- Insert snapshot
    INSERT INTO team_state_snapshots (
        team_id,
        snapshot_type,
        trigger_event_id,
        trigger_event_type,
        market_cap,
        shares_outstanding,
        current_share_price,
        match_result,
        price_impact,
        shares_traded,
        trade_amount,
        effective_at
    ) VALUES (
        p_team_id,
        p_snapshot_type,
        p_trigger_event_id,
        p_trigger_event_type,
        v_current_state.market_cap,
        v_current_state.shares_outstanding,
        v_current_state.current_share_price,
        p_match_result,
        p_price_impact,
        p_shares_traded,
        p_trade_amount,
        p_effective_at
    ) RETURNING id INTO v_snapshot_id;

    RETURN v_snapshot_id;
END;
$function$
;

-- Drop first to avoid "cannot remove parameter defaults" when replacing with different signature
DROP FUNCTION IF EXISTS public.credit_wallet(uuid, bigint, text, text);

CREATE OR REPLACE FUNCTION public.credit_wallet(p_user_id uuid, p_amount_cents bigint, p_ref text DEFAULT NULL::text, p_currency text DEFAULT 'usd'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_wallet_balance_cents BIGINT;
  v_new_wallet_balance_cents BIGINT;
BEGIN
  -- Validate inputs
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Set session variable to allow wallet_balance update
  PERFORM set_config('app.allow_wallet_update', 'true', true);

  -- Get current balance with lock (profiles table always has wallet_balance as BIGINT)
  BEGIN
    SELECT COALESCE(wallet_balance, 0) INTO v_wallet_balance_cents
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE NOWAIT; -- Use NOWAIT to fail fast if locked instead of waiting
    
    IF NOT FOUND THEN
      PERFORM set_config('app.allow_wallet_update', '', true);
      RAISE EXCEPTION 'User profile not found: %', p_user_id;
    END IF;
    
    -- Calculate new balance (both values are in cents, so just add them)
    v_new_wallet_balance_cents := v_wallet_balance_cents + p_amount_cents;
    
    -- Update wallet balance atomically (store as BIGINT cents)
    UPDATE public.profiles
    SET wallet_balance = v_new_wallet_balance_cents
    WHERE id = p_user_id;
    
  EXCEPTION WHEN lock_not_available THEN
    -- Row is locked by another transaction
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE EXCEPTION 'Wallet is currently being updated. Please try again in a moment.';
  WHEN OTHERS THEN
    -- Any other error
    PERFORM set_config('app.allow_wallet_update', '', true);
    RAISE;
  END;

  -- Insert wallet transaction record (atomic within same transaction)
  INSERT INTO public.wallet_transactions(user_id, amount_cents, currency, type, ref)
  VALUES (p_user_id, p_amount_cents, p_currency, 'deposit', p_ref);
  
  -- Clear the session variable
  PERFORM set_config('app.allow_wallet_update', '', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.credit_wallet_loan(p_user_id uuid, p_amount_cents bigint, p_ref text DEFAULT NULL::text, p_currency text DEFAULT 'usd'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  INSERT INTO wallet_transactions (user_id, amount_cents, type, currency, ref)
  VALUES (p_user_id, p_amount_cents, 'credit_loan', COALESCE(p_currency, 'usd'), COALESCE(p_ref, 'credit_loan_' || extract(epoch from now())::bigint));

  UPDATE profiles
  SET wallet_balance = COALESCE(wallet_balance, 0) + p_amount_cents
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_fixture_matchday()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$BEGIN

  -- Force matchday = 27 for fixture id 690
  IF NEW.id = 690 THEN
    NEW.matchday := 31;
  END IF;

  RETURN NEW;

END;$function$
;

CREATE OR REPLACE FUNCTION public.fixture_result_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.fixture_result_trigger_func()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_transfer_percentage NUMERIC := 0.10;
    v_transfer_amount NUMERIC;
    v_winner_team_id INTEGER;
    v_loser_team_id INTEGER;
    v_home_ledger_type TEXT;
    v_away_ledger_type TEXT;
    v_home_price_impact NUMERIC;
    v_away_price_impact NUMERIC;
    v_match_score TEXT;
    
    v_home_team RECORD;
    v_away_team RECORD;
    v_home_current_cap NUMERIC;
    v_away_current_cap NUMERIC;
    v_home_shares INTEGER;
    v_away_shares INTEGER;
    v_opponent_team_id INTEGER;
    v_opponent_team_name TEXT;
BEGIN
    SELECT * INTO v_home_team FROM teams WHERE id = NEW.home_team_id;
    SELECT * INTO v_away_team FROM teams WHERE id = NEW.away_team_id;
    
    IF v_home_team IS NULL OR v_away_team IS NULL THEN
        RETURN NEW;
    END IF;
    
    v_home_current_cap := v_home_team.market_cap;
    v_away_current_cap := v_away_team.market_cap;
    v_home_shares := v_home_team.shares_outstanding;
    v_away_shares := v_away_team.shares_outstanding;
    
    IF NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL THEN
        v_match_score := CONCAT(NEW.home_score, '-', NEW.away_score);
    ELSE
        v_match_score := '0-0';
    END IF;
    
    CASE NEW.result
        WHEN 'home_win' THEN
            v_winner_team_id := NEW.home_team_id;
            v_loser_team_id := NEW.away_team_id;
            v_home_ledger_type := 'match_win';
            v_away_ledger_type := 'match_loss';
            v_transfer_amount := v_away_current_cap * v_transfer_percentage;
            v_home_price_impact := v_transfer_amount;
            v_away_price_impact := -v_transfer_amount;
            v_opponent_team_id := NEW.away_team_id;
            v_opponent_team_name := v_away_team.name;
        WHEN 'away_win' THEN
            v_winner_team_id := NEW.away_team_id;
            v_loser_team_id := NEW.home_team_id;
            v_home_ledger_type := 'match_loss';
            v_away_ledger_type := 'match_win';
            v_transfer_amount := v_home_current_cap * v_transfer_percentage;
            v_home_price_impact := -v_transfer_amount;
            v_away_price_impact := v_transfer_amount;
            v_opponent_team_id := NEW.home_team_id;
            v_opponent_team_name := v_home_team.name;
        WHEN 'draw' THEN
            v_home_ledger_type := 'match_draw';
            v_away_ledger_type := 'match_draw';
            v_transfer_amount := 0;
            v_home_price_impact := 0;
            v_away_price_impact := 0;
            v_opponent_team_id := NEW.away_team_id;
            v_opponent_team_name := v_away_team.name;
    END CASE;
    
    INSERT INTO total_ledger (
        team_id, ledger_type, event_date, event_description,
        trigger_event_id, trigger_event_type,
        opponent_team_id, opponent_team_name,
        match_result, match_score, is_home_match,
        amount_transferred, price_impact,
        market_cap_before, market_cap_after,
        shares_outstanding_before, shares_outstanding_after,
        share_price_before, share_price_after,
        created_by
    ) VALUES (
        NEW.home_team_id, v_home_ledger_type,
        NEW.kickoff_at,  -- ✅ FIXED: Using kickoff_at instead of updated_at
        CONCAT('Match vs ', v_away_team.name),
        NEW.id, 'fixture',
        NEW.away_team_id, v_away_team.name,
        CASE 
            WHEN v_home_ledger_type = 'match_win' THEN 'win'
            WHEN v_home_ledger_type = 'match_loss' THEN 'loss'
            ELSE 'draw'
        END,
        v_match_score, true,
        v_transfer_amount, v_home_price_impact,
        v_home_current_cap, v_home_current_cap + v_home_price_impact,
        v_home_shares, v_home_shares,
        CASE WHEN v_home_shares > 0 THEN v_home_current_cap / v_home_shares ELSE 0 END,
        CASE WHEN v_home_shares > 0 THEN (v_home_current_cap + v_home_price_impact) / v_home_shares ELSE 0 END,
        'system'
    );
    
    INSERT INTO total_ledger (
        team_id, ledger_type, event_date, event_description,
        trigger_event_id, trigger_event_type,
        opponent_team_id, opponent_team_name,
        match_result, match_score, is_home_match,
        amount_transferred, price_impact,
        market_cap_before, market_cap_after,
        shares_outstanding_before, shares_outstanding_after,
        share_price_before, share_price_after,
        created_by
    ) VALUES (
        NEW.away_team_id, v_away_ledger_type,
        NEW.kickoff_at,  -- ✅ FIXED: Using kickoff_at instead of updated_at
        CONCAT('Match vs ', v_home_team.name),
        NEW.id, 'fixture',
        NEW.home_team_id, v_home_team.name,
        CASE 
            WHEN v_away_ledger_type = 'match_win' THEN 'win'
            WHEN v_away_ledger_type = 'match_loss' THEN 'loss'
            ELSE 'draw'
        END,
        v_match_score, false,
        v_transfer_amount, v_away_price_impact,
        v_away_current_cap, v_away_current_cap + v_away_price_impact,
        v_away_shares, v_away_shares,
        CASE WHEN v_away_shares > 0 THEN v_away_current_cap / v_away_shares ELSE 0 END,
        CASE WHEN v_away_shares > 0 THEN (v_away_current_cap + v_away_price_impact) / v_away_shares ELSE 0 END,
        'system'
    );
    
    UPDATE teams SET market_cap = v_home_current_cap + v_home_price_impact, updated_at = NOW() WHERE id = NEW.home_team_id;
    UPDATE teams SET market_cap = v_away_current_cap + v_away_price_impact, updated_at = NOW() WHERE id = NEW.away_team_id;
    
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_complete_timeline(p_team_id integer)
 RETURNS TABLE(event_order integer, event_type text, event_date timestamp with time zone, description text, market_cap_before numeric, market_cap_after numeric, shares_outstanding integer, share_price_before numeric, share_price_after numeric, price_impact numeric, shares_traded integer, trade_amount numeric, opponent_team_id integer, opponent_name text, match_result text, score text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Return timeline from total_ledger
    RETURN QUERY
    SELECT 
        ROW_NUMBER() OVER (ORDER BY tl.event_date)::INTEGER as event_order,
        CASE 
            WHEN tl.ledger_type = 'initial_state' THEN 'initial'
            WHEN tl.ledger_type LIKE 'match_%' THEN 'match'
            WHEN tl.ledger_type LIKE 'share_%' THEN 'purchase'
            ELSE 'other'
        END as event_type,
        tl.event_date,
        CASE 
            WHEN tl.ledger_type LIKE 'match_%' AND tl.opponent_team_name IS NOT NULL THEN
                CASE 
                    WHEN tl.is_home_match THEN 'vs ' || tl.opponent_team_name
                    ELSE '@ ' || tl.opponent_team_name
                END
            ELSE tl.event_description
        END as description,
        tl.market_cap_before,
        tl.market_cap_after,
        tl.shares_outstanding_after as shares_outstanding,
        tl.share_price_before,
        tl.share_price_after,
        tl.price_impact,
        tl.shares_traded,
        tl.amount_transferred as trade_amount,
        tl.opponent_team_id,
        tl.opponent_team_name,
        tl.match_result,
        tl.match_score as score
    FROM total_ledger tl
    WHERE tl.team_id = p_team_id
    ORDER BY tl.event_date ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_state_at_time(p_team_id integer, p_at_time timestamp with time zone)
 RETURNS TABLE(market_cap numeric, shares_outstanding integer, current_share_price numeric, snapshot_type text, effective_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        s.market_cap,
        s.shares_outstanding,
        s.current_share_price,
        s.snapshot_type,
        s.effective_at
    FROM team_state_snapshots s
    WHERE s.team_id = p_team_id 
        AND s.effective_at < p_at_time
    ORDER BY s.effective_at DESC
    LIMIT 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_state_history(p_team_id integer, p_from_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(effective_at timestamp with time zone, market_cap numeric, current_share_price numeric, snapshot_type text, price_impact numeric, shares_traded integer, match_result text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        s.effective_at,
        s.market_cap,
        s.current_share_price,
        s.snapshot_type,
        s.price_impact,
        s.shares_traded,
        s.match_result
    FROM team_state_snapshots s
    WHERE s.team_id = p_team_id
        AND (p_from_date IS NULL OR s.effective_at >= p_from_date)
        AND (p_to_date IS NULL OR s.effective_at <= p_to_date)
    ORDER BY s.effective_at ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_timeline(p_team_id integer)
 RETURNS TABLE(event_order integer, event_type text, event_date timestamp with time zone, description text, market_cap_before numeric, market_cap_after numeric, shares_outstanding integer, share_price_before numeric, share_price_after numeric, price_impact numeric, shares_traded integer, trade_amount numeric, opponent_team_id integer, opponent_name text, match_result text, score text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        ROW_NUMBER() OVER (ORDER BY tl.event_date)::INTEGER as event_order,
        tl.ledger_type as event_type,
        tl.event_date,
        CASE 
            WHEN tl.ledger_type LIKE 'match_%' AND tl.opponent_team_name IS NOT NULL THEN
                CASE 
                    WHEN tl.is_home_match THEN 'vs ' || tl.opponent_team_name
                    ELSE '@ ' || tl.opponent_team_name
                END
            ELSE tl.event_description
        END as description,
        tl.market_cap_before,
        tl.market_cap_after,
        tl.shares_outstanding_after as shares_outstanding,
        tl.share_price_before,
        tl.share_price_after,
        tl.price_impact,
        tl.shares_traded,
        tl.amount_transferred as trade_amount,
        tl.opponent_team_id,
        tl.opponent_team_name as opponent_name,
        tl.match_result,
        tl.match_score as score
    FROM total_ledger tl
    WHERE tl.team_id = p_team_id
    ORDER BY tl.event_date;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_portfolio(user_uuid uuid)
 RETURNS TABLE(team_id integer, team_name text, shares numeric, avg_cost numeric, current_price numeric, total_value numeric, profit_loss numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    p.team_id,
    t.name as team_name,
    p.shares,
    p.avg_cost,
    CASE 
      WHEN t.shares_outstanding > 0 THEN t.market_cap / t.shares_outstanding
      ELSE 20.00
    END as current_price,
    p.shares * (CASE 
      WHEN t.shares_outstanding > 0 THEN t.market_cap / t.shares_outstanding
      ELSE 20.00
    END) as total_value,
    p.shares * ((CASE 
      WHEN t.shares_outstanding > 0 THEN t.market_cap / t.shares_outstanding
      ELSE 20.00
    END) - p.avg_cost) as profit_loss
  FROM positions p
  JOIN teams t ON p.team_id = t.id
  WHERE p.user_id = user_uuid;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_weekly_leaderboard_current()
 RETURNS TABLE(user_id uuid, full_name text, rank bigint, weekly_return numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT 
    wl.user_id,
    COALESCE(
      CASE WHEN p.full_name IS NOT NULL AND trim(p.full_name) <> '' 
           AND p.full_name !~ '^User [0-9a-fA-F]{8}$'
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
$function$
;

CREATE OR REPLACE FUNCTION public.is_buy_window_open(p_team_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_upcoming_fixtures INTEGER;
  v_buy_close_time TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Check if there are upcoming fixtures for this team
  SELECT COUNT(*), MIN(buy_close_at)
  INTO v_upcoming_fixtures, v_buy_close_time
  FROM fixtures 
  WHERE (home_team_id = p_team_id OR away_team_id = p_team_id)
    AND kickoff_at > NOW()
    AND status = 'SCHEDULED';
  
  -- If no upcoming fixtures, trading is always open
  IF v_upcoming_fixtures = 0 THEN
    RETURN TRUE;
  END IF;
  
  -- Check if current time is before buy close time
  RETURN NOW() < v_buy_close_time;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_team_tradeable(team_id integer)
 RETURNS TABLE(tradeable boolean, reason text, next_kickoff timestamp with time zone, next_buy_close timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN f.kickoff_at IS NULL THEN true
      WHEN NOW() <= f.buy_close_at THEN true
      ELSE false
    END as tradeable,
    CASE 
      WHEN f.kickoff_at IS NULL THEN 'No upcoming matches'
      WHEN NOW() <= f.buy_close_at THEN 'Trading window open'
      ELSE 'Trading closed - buy window expired'
    END as reason,
    f.kickoff_at as next_kickoff,
    f.buy_close_at as next_buy_close
  FROM (
    SELECT 
      kickoff_at,
      buy_close_at
    FROM fixtures 
    WHERE (home_team_id = team_id OR away_team_id = team_id)
      AND kickoff_at > NOW()
      AND status = 'scheduled'
    ORDER BY kickoff_at ASC
    LIMIT 1
  ) f;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_user_admin(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = user_id
    AND profiles.is_admin = true
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_match_result_audit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.log_security_event(event_type text, user_id uuid DEFAULT NULL::uuid, details jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.audit_log (
    action,
    table_name,
    record_id,
    user_id,
    details
  ) VALUES (
    event_type,
    'security',
    gen_random_uuid(),
    COALESCE(user_id, auth.uid()),
    COALESCE(details, '{}'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  -- Don't fail if audit log insert fails
  NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_profile_field_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_is_admin BOOLEAN := false;
BEGIN
  -- Check if session variable allows wallet update (set by credit_wallet RPC)
  -- This is the fastest check, do it first
  BEGIN
    IF current_setting('app.allow_wallet_update', true) = 'true' THEN
      -- Allowed via RPC function - allow wallet_balance update
      IF OLD.wallet_balance IS DISTINCT FROM NEW.wallet_balance THEN
        RETURN NEW;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Session variable not set - continue with normal checks
    NULL;
  END;
  
  -- Allow updates from SECURITY DEFINER functions
  -- Check if auth.uid() is NULL (SECURITY DEFINER context)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if auth.role() is service_role
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  
  -- Check if we're updating a different user's profile (indicates RPC function)
  IF OLD.id != auth.uid() THEN
    RETURN NEW;
  END IF;
  
  -- Check if current_setting('role') indicates elevated privileges
  BEGIN
    IF current_setting('role', true) IN ('postgres', 'service_role', 'authenticator') THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  -- Only apply restrictions for direct user updates to their own profile
  -- Check if user is admin (only if updating own profile)
  -- Use OLD.id directly instead of EXISTS query to avoid blocking
  IF OLD.id = auth.uid() THEN
    -- Check admin status from NEW record if available, otherwise use OLD
    v_is_admin := COALESCE(NEW.is_admin, OLD.is_admin, false);
    
    IF v_is_admin THEN
      -- Admin can update anything
      RETURN NEW;
    END IF;
  END IF;
  
  -- Prevent non-admin users from updating sensitive fields directly
  IF OLD.is_admin IS DISTINCT FROM NEW.is_admin THEN
    RAISE EXCEPTION 'Cannot update is_admin field. Contact an administrator.';
  END IF;
  
  IF OLD.wallet_balance IS DISTINCT FROM NEW.wallet_balance THEN
    RAISE EXCEPTION 'Cannot directly update wallet_balance. Use credit_wallet or purchase functions.';
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_fixture_insert_for_market_cap()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only process if the new fixture already has a result (i.e., not 'pending')
  -- This handles API-synced fixtures that are inserted with final results
  IF NEW.result IS NOT NULL AND NEW.result != 'pending' THEN
    PERFORM process_match_result_atomic(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
;







CREATE OR REPLACE FUNCTION public.refresh_all_portfolio_values()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE profiles p
  SET portfolio_value = COALESCE(sub.total_value, 0)
  FROM (
    SELECT 
      pos.user_id,
      COALESCE(
        SUM(
          pos.quantity * 
          (t.market_cap::NUMERIC / NULLIF(t.shares_outstanding, 0))
        ), 
        0
      )::BIGINT AS total_value
    FROM positions pos
    JOIN teams t ON t.id = pos.team_id
    WHERE pos.quantity > 0
    GROUP BY pos.user_id
  ) sub
  WHERE p.id = sub.user_id;

  -- Set users with no positions to 0
  UPDATE profiles
  SET portfolio_value = 0
  WHERE id NOT IN (
    SELECT DISTINCT user_id 
    FROM positions 
    WHERE quantity > 0
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.require_authentication()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  user_id uuid;
BEGIN
  user_id := auth.uid();
  
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required. Please sign in.';
  END IF;
  
  RETURN user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reset_marketplace_complete()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_teams_reset INTEGER := 0;
    v_ledger_cleared INTEGER := 0;
    v_transfers_cleared INTEGER := 0;
    v_orders_cleared INTEGER := 0;
    v_positions_cleared INTEGER := 0;
    v_fixtures_reset INTEGER := 0;
BEGIN
    -- Step 1: Clear all dependent data first (to avoid foreign key issues)
    
    -- Clear total_ledger (with WHERE clause)
    DELETE FROM total_ledger WHERE id > 0;
    GET DIAGNOSTICS v_ledger_cleared = ROW_COUNT;
    
    -- Clear transfers_ledger (with WHERE clause)
    DELETE FROM transfers_ledger WHERE id > 0;
    GET DIAGNOSTICS v_transfers_cleared = ROW_COUNT;
    
    -- Clear orders (with WHERE clause)
    DELETE FROM orders WHERE id > 0;
    GET DIAGNOSTICS v_orders_cleared = ROW_COUNT;
    
    -- Clear positions (with WHERE clause)
    DELETE FROM positions WHERE id > 0;
    GET DIAGNOSTICS v_positions_cleared = ROW_COUNT;
    
    -- Step 2: Reset fixtures to pending state
    UPDATE fixtures 
    SET 
        result = 'pending',
        home_score = 0,
        away_score = 0,
        status = 'scheduled',
        updated_at = NOW()
    WHERE result != 'pending';
    GET DIAGNOSTICS v_fixtures_reset = ROW_COUNT;
    
    -- Step 3: Reset teams to initial state (with WHERE clause)
    UPDATE teams 
    SET 
        market_cap = initial_market_cap,
        shares_outstanding = 5,
        total_shares = 5,
        available_shares = 5,
        updated_at = NOW()
    WHERE id > 0;
    GET DIAGNOSTICS v_teams_reset = ROW_COUNT;
    
    -- Step 4: Create initial ledger entries for all teams
    INSERT INTO total_ledger (
        team_id,
        ledger_type,
        event_date,
        event_description,
        trigger_event_type,
        amount_transferred,
        price_impact,
        market_cap_before,
        market_cap_after,
        shares_outstanding_before,
        shares_outstanding_after,
        shares_traded,
        share_price_before,
        share_price_after,
        created_at,
        created_by,
        notes
    )
    SELECT 
        t.id,
        'initial_state',
        NOW(),
        'Initial State',
        'initial',
        0,
        0,
        t.initial_market_cap,
        t.initial_market_cap,
        5,
        5,
        0,
        t.launch_price,
        t.launch_price,
        NOW(),
        'system',
        'Marketplace reset - initial state'
    FROM teams t;
    
    -- Return summary
    RETURN FORMAT(
        'Marketplace reset complete: %s teams reset, %s ledger entries cleared, %s transfers cleared, %s orders cleared, %s positions cleared, %s fixtures reset',
        v_teams_reset,
        v_ledger_cleared,
        v_transfers_cleared,
        v_orders_cleared,
        v_positions_cleared,
        v_fixtures_reset
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reverse_credit_loan(p_transaction_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_user_id uuid; v_amount_cents bigint; v_current_balance bigint; BEGIN SELECT user_id, amount_cents INTO v_user_id, v_amount_cents FROM wallet_transactions WHERE id = p_transaction_id AND type = 'credit_loan'; IF NOT FOUND THEN RAISE EXCEPTION 'Credit loan transaction not found: %', p_transaction_id; END IF; SELECT wallet_balance INTO v_current_balance FROM profiles WHERE id = v_user_id; IF v_current_balance < v_amount_cents THEN RAISE EXCEPTION 'Insufficient balance to reverse credit loan'; END IF; INSERT INTO wallet_transactions (user_id, amount_cents, type, currency, ref) VALUES (v_user_id, -v_amount_cents, 'credit_loan_reversal', 'usd', 'reversal_' || p_transaction_id); UPDATE profiles SET wallet_balance = wallet_balance - v_amount_cents WHERE id = v_user_id; END; $function$
;

CREATE OR REPLACE FUNCTION public.set_total_ledger_event_description()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF (NEW.trigger_event_type = 'fixture' AND NEW.ledger_type IN ('match_win','match_loss','match_draw')) THEN
    -- If opponent_team_name is missing, derive it from fixtures/teams
    IF COALESCE(NEW.opponent_team_name, '') = '' THEN
      SELECT CASE WHEN NEW.team_id = f.home_team_id THEN away_team.name ELSE home_team.name END
        INTO NEW.opponent_team_name
      FROM fixtures f
      JOIN teams home_team ON f.home_team_id = home_team.id
      JOIN teams away_team ON f.away_team_id = away_team.id
      WHERE f.id = NEW.trigger_event_id;
    END IF;
    NEW.event_description := 'Match vs ' || NEW.opponent_team_name;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_all_portfolio_values()
 RETURNS TABLE(profile_id uuid, portfolio_value bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH portfolio_calculations AS (
    SELECT 
      p.id as user_id,
      COALESCE(
        SUM(
          ROUND(
            GREATEST(
              (t.market_cap::NUMERIC / 100.0) / NULLIF(t.total_shares, 0),
              20.00
            ) * pos.quantity * 100
          )
        ),
        0
      )::BIGINT as calculated_portfolio_value
    FROM profiles p
    LEFT JOIN positions pos ON pos.user_id = p.id AND pos.quantity > 0
    LEFT JOIN teams t ON t.id = pos.team_id
    GROUP BY p.id
  )
  UPDATE profiles
  SET 
    portfolio_value = pc.calculated_portfolio_value,
    updated_at = NOW()
  FROM portfolio_calculations pc
  WHERE profiles.id = pc.user_id
  RETURNING profiles.id, profiles.portfolio_value;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_portfolio_on_position_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Update portfolio value for the affected user
  IF TG_OP = 'DELETE' THEN
    PERFORM update_user_portfolio_value(OLD.user_id);
    RETURN OLD;
  ELSE
    PERFORM update_user_portfolio_value(NEW.user_id);
    RETURN NEW;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_portfolio_on_team_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  -- When a team's market cap or total_shares changes, 
  -- update portfolio value for ALL users holding that team
  FOR v_user_id IN
    SELECT DISTINCT user_id
    FROM positions
    WHERE team_id = NEW.id
      AND quantity > 0
  LOOP
    PERFORM update_user_portfolio_value(v_user_id);
  END LOOP;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.total_ledger_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_ledger_type TEXT;
    v_price_impact DECIMAL(15,2) := 0;
    v_shares_traded INTEGER := 0;
    v_recent_transfer RECORD;
    v_draw_fixture RECORD;
    v_fixture RECORD;
    v_transfer_exists BOOLEAN := FALSE;
    v_draw_exists BOOLEAN := FALSE;
BEGIN
    -- Calculate the changes
    v_price_impact := NEW.market_cap - OLD.market_cap;
    v_shares_traded := NEW.shares_outstanding - OLD.shares_outstanding;
    
    -- Only proceed if there are actual changes
    IF v_price_impact != 0 OR v_shares_traded != 0 THEN
        
        -- First, check for recent draw fixtures (no transfers for draws)
        SELECT * INTO v_draw_fixture
        FROM fixtures 
        WHERE (home_team_id = NEW.id OR away_team_id = NEW.id)
        AND result = 'draw'
        AND status = 'applied'
        AND updated_at >= NOW() - INTERVAL '1 hour'
        ORDER BY updated_at DESC
        LIMIT 1;
        
        v_draw_exists := (v_draw_fixture.id IS NOT NULL);
        
        IF v_draw_exists THEN
            -- Create match_draw entry
            PERFORM create_ledger_entry(
                NEW.id,
                'match_draw',
                0, -- No transfer amount for draws
                v_price_impact,
                v_shares_traded,
                v_draw_fixture.id,
                'fixture',
                CASE WHEN v_draw_fixture.home_team_id = NEW.id THEN v_draw_fixture.away_team_id ELSE v_draw_fixture.home_team_id END,
                NULL, -- Will be filled by function
                'draw',
                CASE 
                    WHEN v_draw_fixture.home_score IS NOT NULL AND v_draw_fixture.away_score IS NOT NULL 
                    THEN CONCAT(v_draw_fixture.home_score, '-', v_draw_fixture.away_score)
                    ELSE NULL
                END,
                (v_draw_fixture.home_team_id = NEW.id),
                CONCAT('Match vs ', CASE WHEN v_draw_fixture.home_team_id = NEW.id THEN 'away team' ELSE 'home team' END)
            );
            
        ELSE
            -- Look for the most recent transfer for this team (NO TIME WINDOW)
            SELECT * INTO v_recent_transfer
            FROM transfers_ledger 
            WHERE (winner_team_id = NEW.id OR loser_team_id = NEW.id)
            ORDER BY applied_at DESC
            LIMIT 1;
            
            -- Check if we found a transfer
            v_transfer_exists := (v_recent_transfer.id IS NOT NULL);
            
            IF v_transfer_exists THEN
                -- Get fixture details
                SELECT * INTO v_fixture
                FROM fixtures 
                WHERE id = v_recent_transfer.fixture_id;
                
                -- Determine match result and ledger type
                IF v_recent_transfer.winner_team_id = NEW.id THEN
                    v_ledger_type := 'match_win';
                ELSIF v_recent_transfer.loser_team_id = NEW.id THEN
                    v_ledger_type := 'match_loss';
                ELSE
                    v_ledger_type := 'match_draw';
                END IF;
                
                -- Create match entry
                PERFORM create_ledger_entry(
                    NEW.id,
                    v_ledger_type,
                    v_recent_transfer.transfer_amount,
                    v_price_impact,
                    v_shares_traded,
                    v_recent_transfer.id,
                    'fixture',
                    CASE WHEN v_fixture.home_team_id = NEW.id THEN v_fixture.away_team_id ELSE v_fixture.home_team_id END,
                    NULL, -- Will be filled by function
                    CASE 
                        WHEN v_ledger_type = 'match_win' THEN 'win'
                        WHEN v_ledger_type = 'match_loss' THEN 'loss'
                        ELSE 'draw'
                    END,
                    CASE 
                        WHEN v_fixture.home_score IS NOT NULL AND v_fixture.away_score IS NOT NULL 
                        THEN CONCAT(v_fixture.home_score, '-', v_fixture.away_score)
                        ELSE NULL
                    END,
                    (v_fixture.home_team_id = NEW.id),
                    CONCAT('Match vs ', CASE WHEN v_fixture.home_team_id = NEW.id THEN 'away team' ELSE 'home team' END)
                );
                
            ELSIF v_shares_traded != 0 THEN
                -- Share purchase/sale (no transfer found)
                IF v_shares_traded > 0 THEN
                    v_ledger_type := 'share_purchase';
                ELSE
                    v_ledger_type := 'share_sale';
                END IF;
                
                PERFORM create_ledger_entry(
                    NEW.id,
                    v_ledger_type,
                    ABS(v_shares_traded) * (OLD.market_cap / OLD.shares_outstanding),
                    v_price_impact,
                    v_shares_traded,
                    NULL,
                    'order',
                    NULL, NULL, NULL, NULL, NULL,
                    CONCAT(ABS(v_shares_traded), ' shares ', CASE WHEN v_shares_traded > 0 THEN 'purchased' ELSE 'sold' END)
                );
                
            ELSE
                -- Manual adjustment (market cap change without shares or transfer)
                PERFORM create_ledger_entry(
                    NEW.id,
                    'manual_adjustment',
                    0,
                    v_price_impact,
                    0,
                    NULL,
                    'manual',
                    NULL, NULL, NULL, NULL, NULL,
                    'Market cap adjustment'
                );
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_team_snapshot_on_market_cap_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Only create snapshot if market_cap actually changed
    IF OLD.market_cap IS DISTINCT FROM NEW.market_cap THEN
        PERFORM create_team_snapshot(
            NEW.id,
            'match_result',
            NULL, -- Will be set by the calling context
            'fixture',
            NULL, -- Will be set by the calling context
            NEW.market_cap - OLD.market_cap
        );
    END IF;
    
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_update_all_portfolio_values()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  -- When a team's market cap changes, update portfolio value for all users holding that team
  FOR v_user_id IN
    SELECT DISTINCT user_id
    FROM positions
    WHERE team_id = NEW.id
      AND quantity > 0
  LOOP
    PERFORM update_user_portfolio_value(v_user_id);
  END LOOP;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_update_portfolio_value()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Update portfolio value for the affected user
  IF TG_OP = 'DELETE' THEN
    PERFORM update_user_portfolio_value(OLD.user_id);
    RETURN OLD;
  ELSE
    PERFORM update_user_portfolio_value(NEW.user_id);
    RETURN NEW;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.truncate_profiles_table()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Truncate profiles table (cascades to positions and orders due to foreign keys)
    TRUNCATE TABLE profiles CASCADE;
    
    -- Log the operation
    RAISE NOTICE 'Profiles table truncated successfully - all user data deleted';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_all_positions_pnl_on_market_cap_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF OLD.market_cap IS DISTINCT FROM NEW.market_cap THEN
    UPDATE positions p
    SET total_pnl = calculate_position_total_pnl(p.user_id, p.team_id),
        updated_at = NOW()
    WHERE p.team_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_portfolio_value()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE profiles p
  SET portfolio_value = COALESCE(
    (
      SELECT SUM(pos.quantity * (t.market_cap::NUMERIC / NULLIF(t.shares_outstanding, 0)))
      FROM positions pos
      JOIN teams t ON t.id = pos.team_id
      WHERE pos.user_id = NEW.user_id
        AND pos.quantity > 0
    ),
    0
  )::BIGINT
  WHERE p.id = NEW.user_id;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_position_total_pnl(p_user_id uuid, p_team_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_total_pnl_cents BIGINT;
BEGIN
  v_total_pnl_cents := calculate_position_total_pnl(p_user_id, p_team_id);
  
  UPDATE positions
  SET total_pnl = v_total_pnl_cents,
      updated_at = NOW()
  WHERE user_id = p_user_id AND team_id = p_team_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_user_portfolio_value(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_portfolio_value BIGINT;
BEGIN
  -- Calculate portfolio value using the correct function
  v_portfolio_value := calculate_user_portfolio_value(p_user_id);
  
  -- Update profiles table
  UPDATE profiles
  SET 
    portfolio_value = v_portfolio_value,
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_positive_amount(value numeric, field_name text)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  IF value IS NULL THEN
    RAISE EXCEPTION 'Field % cannot be null', field_name;
  END IF;
  
  IF value <= 0 THEN
    RAISE EXCEPTION 'Field % must be a positive amount', field_name;
  END IF;
  
  -- Check for reasonable maximum (prevent overflow attacks)
  IF value > 100000000 THEN -- $1 million
    RAISE EXCEPTION 'Field % exceeds maximum allowed value', field_name;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_positive_integer(value numeric, field_name text)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  IF value IS NULL THEN
    RAISE EXCEPTION 'Field % cannot be null', field_name;
  END IF;
  
  IF value <= 0 THEN
    RAISE EXCEPTION 'Field % must be a positive number', field_name;
  END IF;
  
  IF value != FLOOR(value) THEN
    RAISE EXCEPTION 'Field % must be a whole number', field_name;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_uuid(value text, field_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  result uuid;
BEGIN
  IF value IS NULL THEN
    RAISE EXCEPTION 'Field % cannot be null', field_name;
  END IF;
  
  BEGIN
    result := value::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Field % must be a valid UUID', field_name;
  END;
  
  RETURN result;
END;
$function$
;


-- Drop first to avoid "already exists" when storage triggers are pre-created by Supabase
DROP TRIGGER IF EXISTS enforce_bucket_name_length_trigger ON storage.buckets;
CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();

DROP TRIGGER IF EXISTS protect_buckets_delete ON storage.buckets;
CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

DROP TRIGGER IF EXISTS protect_objects_delete ON storage.objects;
CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

DROP TRIGGER IF EXISTS update_objects_updated_at ON storage.objects;
CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


