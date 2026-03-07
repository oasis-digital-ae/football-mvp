

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."acquire_user_lock"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Use PostgreSQL advisory locks for user-level locking
  -- This prevents concurrent operations on the same user
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));
END;
$$;


ALTER FUNCTION "public"."acquire_user_lock"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."acquire_user_lock"("p_user_id" "uuid") IS 'Acquires an advisory lock for a user to prevent concurrent operations. Lock is automatically released at transaction end.';



CREATE OR REPLACE FUNCTION "public"."add_position_with_history"("p_user_id" "uuid", "p_team_id" integer, "p_quantity" integer, "p_total_invested" numeric) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."add_position_with_history"("p_user_id" "uuid", "p_team_id" integer, "p_quantity" integer, "p_total_invested" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_position_total_pnl"("p_user_id" "uuid", "p_team_id" integer) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."calculate_position_total_pnl"("p_user_id" "uuid", "p_team_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_user_portfolio_value"("p_user_id" "uuid") RETURNS bigint
    LANGUAGE "plpgsql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."calculate_user_portfolio_value"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_season_data"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."clear_season_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_ledger_entry"("p_team_id" integer, "p_ledger_type" "text", "p_amount_transferred" numeric DEFAULT 0, "p_price_impact" numeric DEFAULT 0, "p_shares_traded" integer DEFAULT 0, "p_trigger_event_id" integer DEFAULT NULL::integer, "p_trigger_event_type" "text" DEFAULT NULL::"text", "p_opponent_team_id" integer DEFAULT NULL::integer, "p_opponent_team_name" "text" DEFAULT NULL::"text", "p_match_result" "text" DEFAULT NULL::"text", "p_match_score" "text" DEFAULT NULL::"text", "p_is_home_match" boolean DEFAULT NULL::boolean, "p_event_description" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."create_ledger_entry"("p_team_id" integer, "p_ledger_type" "text", "p_amount_transferred" numeric, "p_price_impact" numeric, "p_shares_traded" integer, "p_trigger_event_id" integer, "p_trigger_event_type" "text", "p_opponent_team_id" integer, "p_opponent_team_name" "text", "p_match_result" "text", "p_match_score" "text", "p_is_home_match" boolean, "p_event_description" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_team_snapshot"("p_team_id" integer, "p_snapshot_type" "text", "p_trigger_event_id" integer DEFAULT NULL::integer, "p_trigger_event_type" "text" DEFAULT NULL::"text", "p_match_result" "text" DEFAULT NULL::"text", "p_price_impact" numeric DEFAULT 0, "p_shares_traded" integer DEFAULT 0, "p_trade_amount" numeric DEFAULT 0) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."create_team_snapshot"("p_team_id" integer, "p_snapshot_type" "text", "p_trigger_event_id" integer, "p_trigger_event_type" "text", "p_match_result" "text", "p_price_impact" numeric, "p_shares_traded" integer, "p_trade_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_team_snapshot"("p_team_id" integer, "p_snapshot_type" "text", "p_trigger_event_id" integer DEFAULT NULL::integer, "p_trigger_event_type" "text" DEFAULT NULL::"text", "p_match_result" "text" DEFAULT NULL::"text", "p_price_impact" numeric DEFAULT 0, "p_shares_traded" integer DEFAULT 0, "p_trade_amount" numeric DEFAULT 0, "p_effective_at" timestamp with time zone DEFAULT "now"()) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."create_team_snapshot"("p_team_id" integer, "p_snapshot_type" "text", "p_trigger_event_id" integer, "p_trigger_event_type" "text", "p_match_result" "text", "p_price_impact" numeric, "p_shares_traded" integer, "p_trade_amount" numeric, "p_effective_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."credit_wallet"("p_user_id" "uuid", "p_amount_cents" bigint, "p_ref" "text" DEFAULT NULL::"text", "p_currency" "text" DEFAULT 'usd'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."credit_wallet"("p_user_id" "uuid", "p_amount_cents" bigint, "p_ref" "text", "p_currency" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."credit_wallet"("p_user_id" "uuid", "p_amount_cents" bigint, "p_ref" "text", "p_currency" "text") IS 'Credits user wallet atomically with row locking. Fixed-point arithmetic: wallet_balance is BIGINT (cents). p_amount_cents should be in cents (e.g., 100000 for $1000). Idempotent if ref is provided.';



CREATE OR REPLACE FUNCTION "public"."credit_wallet_loan"("p_user_id" "uuid", "p_amount_cents" bigint, "p_ref" "text" DEFAULT NULL::"text", "p_currency" "text" DEFAULT 'usd'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."credit_wallet_loan"("p_user_id" "uuid", "p_amount_cents" bigint, "p_ref" "text", "p_currency" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_fixture_matchday"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$BEGIN

  -- Force matchday = 27 for fixture id 690
  IF NEW.id = 690 THEN
    NEW.matchday := 31;
  END IF;

  RETURN NEW;

END;$$;


ALTER FUNCTION "public"."enforce_fixture_matchday"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fixture_result_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."fixture_result_trigger"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fixture_result_trigger"() IS 'Trigger function that processes match results using process_match_result_atomic. Runs as SECURITY DEFINER to bypass RLS. Automatically processes fixtures when result changes from pending to final.';



CREATE OR REPLACE FUNCTION "public"."fixture_result_trigger_func"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."fixture_result_trigger_func"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_weekly_leaderboard_exact_v2"("p_week_start" timestamp with time zone, "p_week_end" timestamp with time zone) RETURNS TABLE("user_id" "uuid", "start_wallet_value" bigint, "start_portfolio_value" bigint, "start_account_value" bigint, "end_wallet_value" bigint, "end_portfolio_value" bigint, "end_account_value" bigint, "deposits_week" bigint, "weekly_return" numeric, "rank" bigint, "week_number" integer)
    LANGUAGE "sql" STABLE
    AS $$
WITH

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

current_wallet AS (
  SELECT
    p.id AS user_id,
    p.wallet_balance AS current_wallet_value
  FROM profiles p
),

current_portfolio AS (
  SELECT
    p.id AS user_id,
    COALESCE(p.portfolio_value, 0)::BIGINT AS current_portfolio_value
  FROM profiles p
),

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
$$;


ALTER FUNCTION "public"."generate_weekly_leaderboard_exact_v2"("p_week_start" timestamp with time zone, "p_week_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_complete_timeline"("p_team_id" integer) RETURNS TABLE("event_order" integer, "event_type" "text", "event_date" timestamp with time zone, "description" "text", "market_cap_before" numeric, "market_cap_after" numeric, "shares_outstanding" integer, "share_price_before" numeric, "share_price_after" numeric, "price_impact" numeric, "shares_traded" integer, "trade_amount" numeric, "opponent_team_id" integer, "opponent_name" "text", "match_result" "text", "score" "text")
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."get_team_complete_timeline"("p_team_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_state_at_time"("p_team_id" integer, "p_at_time" timestamp with time zone) RETURNS TABLE("market_cap" numeric, "shares_outstanding" integer, "current_share_price" numeric, "snapshot_type" "text", "effective_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."get_team_state_at_time"("p_team_id" integer, "p_at_time" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_state_history"("p_team_id" integer, "p_from_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_to_date" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("effective_at" timestamp with time zone, "market_cap" numeric, "current_share_price" numeric, "snapshot_type" "text", "price_impact" numeric, "shares_traded" integer, "match_result" "text")
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."get_team_state_history"("p_team_id" integer, "p_from_date" timestamp with time zone, "p_to_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_timeline"("p_team_id" integer) RETURNS TABLE("event_order" integer, "event_type" "text", "event_date" timestamp with time zone, "description" "text", "market_cap_before" numeric, "market_cap_after" numeric, "shares_outstanding" integer, "share_price_before" numeric, "share_price_after" numeric, "price_impact" numeric, "shares_traded" integer, "trade_amount" numeric, "opponent_team_id" integer, "opponent_name" "text", "match_result" "text", "score" "text")
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."get_team_timeline"("p_team_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_portfolio"("user_uuid" "uuid") RETURNS TABLE("team_id" integer, "team_name" "text", "shares" numeric, "avg_cost" numeric, "current_price" numeric, "total_value" numeric, "profit_loss" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."get_user_portfolio"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_weekly_leaderboard_current"() RETURNS TABLE("user_id" "uuid", "full_name" "text", "rank" bigint, "weekly_return" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $_$
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
$_$;


ALTER FUNCTION "public"."get_weekly_leaderboard_current"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_buy_window_open"("p_team_id" integer) RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."is_buy_window_open"("p_team_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_team_tradeable"("team_id" integer) RETURNS TABLE("tradeable" boolean, "reason" "text", "next_kickoff" timestamp with time zone, "next_buy_close" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."is_team_tradeable"("team_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_admin"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = user_id
    AND profiles.is_admin = true
  );
END;
$$;


ALTER FUNCTION "public"."is_user_admin"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_match_result_audit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."log_match_result_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_security_event"("event_type" "text", "user_id" "uuid" DEFAULT NULL::"uuid", "details" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."log_security_event"("event_type" "text", "user_id" "uuid", "details" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_security_event"("event_type" "text", "user_id" "uuid", "details" "jsonb") IS 'Logs security events to audit_log. Used for monitoring suspicious activity.';



CREATE OR REPLACE FUNCTION "public"."prevent_profile_field_updates"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."prevent_profile_field_updates"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."prevent_profile_field_updates"() IS 'Prevents non-admin users from updating sensitive profile fields. Optimized to avoid slow EXISTS queries.';



CREATE OR REPLACE FUNCTION "public"."process_fixture_insert_for_market_cap"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only process if the new fixture already has a result (i.e., not 'pending')
  -- This handles API-synced fixtures that are inserted with final results
  IF NEW.result IS NOT NULL AND NEW.result != 'pending' THEN
    PERFORM process_match_result_atomic(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."process_fixture_insert_for_market_cap"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_all_portfolio_values"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."refresh_all_portfolio_values"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."require_authentication"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  user_id uuid;
BEGIN
  user_id := auth.uid();
  
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required. Please sign in.';
  END IF;
  
  RETURN user_id;
END;
$$;


ALTER FUNCTION "public"."require_authentication"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."require_authentication"() IS 'Ensures user is authenticated. Returns user_id or raises exception.';



CREATE OR REPLACE FUNCTION "public"."reset_marketplace_complete"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."reset_marketplace_complete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reverse_credit_loan"("p_transaction_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ DECLARE v_user_id uuid; v_amount_cents bigint; v_current_balance bigint; BEGIN SELECT user_id, amount_cents INTO v_user_id, v_amount_cents FROM wallet_transactions WHERE id = p_transaction_id AND type = 'credit_loan'; IF NOT FOUND THEN RAISE EXCEPTION 'Credit loan transaction not found: %', p_transaction_id; END IF; SELECT wallet_balance INTO v_current_balance FROM profiles WHERE id = v_user_id; IF v_current_balance < v_amount_cents THEN RAISE EXCEPTION 'Insufficient balance to reverse credit loan'; END IF; INSERT INTO wallet_transactions (user_id, amount_cents, type, currency, ref) VALUES (v_user_id, -v_amount_cents, 'credit_loan_reversal', 'usd', 'reversal_' || p_transaction_id); UPDATE profiles SET wallet_balance = wallet_balance - v_amount_cents WHERE id = v_user_id; END; $$;


ALTER FUNCTION "public"."reverse_credit_loan"("p_transaction_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_total_ledger_event_description"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."set_total_ledger_event_description"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_all_portfolio_values"() RETURNS TABLE("profile_id" "uuid", "portfolio_value" bigint)
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."sync_all_portfolio_values"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_portfolio_on_position_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."sync_portfolio_on_position_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_portfolio_on_team_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."sync_portfolio_on_team_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."total_ledger_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."total_ledger_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_team_snapshot_on_market_cap_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."trigger_team_snapshot_on_market_cap_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_all_portfolio_values"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."trigger_update_all_portfolio_values"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_portfolio_value"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."trigger_update_portfolio_value"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."truncate_profiles_table"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Truncate profiles table (cascades to positions and orders due to foreign keys)
    TRUNCATE TABLE profiles CASCADE;
    
    -- Log the operation
    RAISE NOTICE 'Profiles table truncated successfully - all user data deleted';
END;
$$;


ALTER FUNCTION "public"."truncate_profiles_table"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_all_positions_pnl_on_market_cap_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF OLD.market_cap IS DISTINCT FROM NEW.market_cap THEN
    UPDATE positions p
    SET total_pnl = calculate_position_total_pnl(p.user_id, p.team_id),
        updated_at = NOW()
    WHERE p.team_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_all_positions_pnl_on_market_cap_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_portfolio_value"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."update_portfolio_value"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_position_total_pnl"("p_user_id" "uuid", "p_team_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_total_pnl_cents BIGINT;
BEGIN
  v_total_pnl_cents := calculate_position_total_pnl(p_user_id, p_team_id);
  
  UPDATE positions
  SET total_pnl = v_total_pnl_cents,
      updated_at = NOW()
  WHERE user_id = p_user_id AND team_id = p_team_id;
END;
$$;


ALTER FUNCTION "public"."update_position_total_pnl"("p_user_id" "uuid", "p_team_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_portfolio_value"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."update_user_portfolio_value"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_positive_amount"("value" numeric, "field_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
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
$_$;


ALTER FUNCTION "public"."validate_positive_amount"("value" numeric, "field_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_positive_amount"("value" numeric, "field_name" "text") IS 'Validates that a value is a positive amount within reasonable limits.';



CREATE OR REPLACE FUNCTION "public"."validate_positive_integer"("value" numeric, "field_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."validate_positive_integer"("value" numeric, "field_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_positive_integer"("value" numeric, "field_name" "text") IS 'Validates that a value is a positive integer. Raises exception if invalid.';



CREATE OR REPLACE FUNCTION "public"."validate_uuid"("value" "text", "field_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."validate_uuid"("value" "text", "field_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_uuid"("value" "text", "field_name" "text") IS 'Validates that a value is a valid UUID. Returns UUID or raises exception.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" integer NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" integer,
    "old_values" "jsonb",
    "new_values" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."audit_log_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."audit_log_id_seq" OWNED BY "public"."audit_log"."id";



CREATE TABLE IF NOT EXISTS "public"."total_ledger" (
    "id" integer NOT NULL,
    "team_id" integer NOT NULL,
    "ledger_type" "text" NOT NULL,
    "event_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_description" "text",
    "trigger_event_id" integer,
    "trigger_event_type" "text",
    "opponent_team_id" integer,
    "opponent_team_name" "text",
    "match_result" "text",
    "match_score" "text",
    "is_home_match" boolean,
    "amount_transferred" bigint DEFAULT 0 NOT NULL,
    "price_impact" bigint DEFAULT 0 NOT NULL,
    "market_cap_before" bigint NOT NULL,
    "market_cap_after" bigint NOT NULL,
    "shares_outstanding_before" integer NOT NULL,
    "shares_outstanding_after" integer NOT NULL,
    "shares_traded" integer DEFAULT 0 NOT NULL,
    "share_price_before" bigint NOT NULL,
    "share_price_after" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text" DEFAULT 'system'::"text",
    "notes" "text",
    CONSTRAINT "total_ledger_ledger_type_check" CHECK (("ledger_type" = ANY (ARRAY['share_purchase'::"text", 'share_sale'::"text", 'match_win'::"text", 'match_loss'::"text", 'match_draw'::"text", 'initial_state'::"text", 'manual_adjustment'::"text"]))),
    CONSTRAINT "total_ledger_match_result_check" CHECK (("match_result" = ANY (ARRAY['win'::"text", 'loss'::"text", 'draw'::"text"]))),
    CONSTRAINT "total_ledger_trigger_event_type_check" CHECK (("trigger_event_type" = ANY (ARRAY['order'::"text", 'fixture'::"text", 'manual'::"text", 'initial'::"text"]))),
    CONSTRAINT "valid_market_caps" CHECK (((("market_cap_before")::numeric >= (0)::numeric) AND (("market_cap_after")::numeric >= (0)::numeric))),
    CONSTRAINT "valid_share_counts" CHECK ((("shares_outstanding_before" >= 0) AND ("shares_outstanding_after" >= 0))),
    CONSTRAINT "valid_share_prices" CHECK (((("share_price_before")::numeric >= (0)::numeric) AND (("share_price_after")::numeric >= (0)::numeric)))
);


ALTER TABLE "public"."total_ledger" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."current_team_states" AS
 SELECT DISTINCT ON ("team_id") "team_id",
    ((("market_cap_after")::numeric / 100.0))::numeric(15,2) AS "current_market_cap",
    "shares_outstanding_after" AS "current_shares_outstanding",
    ((("share_price_after")::numeric / 100.0))::numeric(10,2) AS "current_share_price",
    "event_date" AS "last_updated"
   FROM "public"."total_ledger"
  ORDER BY "team_id", "event_date" DESC;


ALTER VIEW "public"."current_team_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deposits" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(15,2) NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "stripe_session_id" "text",
    "stripe_payment_intent" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "deposits_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."deposits" OWNER TO "postgres";


ALTER TABLE "public"."deposits" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."deposits_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."fixtures" (
    "id" integer NOT NULL,
    "external_id" integer NOT NULL,
    "home_team_id" integer,
    "away_team_id" integer,
    "matchday" integer NOT NULL,
    "status" "text" DEFAULT 'SCHEDULED'::"text" NOT NULL,
    "home_score" integer DEFAULT 0,
    "away_score" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "kickoff_at" timestamp with time zone NOT NULL,
    "buy_close_at" timestamp with time zone NOT NULL,
    "snapshot_home_cap" bigint,
    "snapshot_away_cap" bigint,
    "result" "text" DEFAULT 'pending'::"text",
    "season" integer,
    CONSTRAINT "fixtures_result_check" CHECK (("result" = ANY (ARRAY['home_win'::"text", 'away_win'::"text", 'draw'::"text", 'pending'::"text"])))
);


ALTER TABLE "public"."fixtures" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."fixtures_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."fixtures_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."fixtures_id_seq" OWNED BY "public"."fixtures"."id";



CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" integer NOT NULL,
    "user_id" "uuid",
    "team_id" integer,
    "order_type" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "price_per_share" bigint NOT NULL,
    "total_amount" bigint NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "executed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "market_cap_before" bigint,
    "market_cap_after" bigint,
    "shares_outstanding_before" integer,
    "shares_outstanding_after" integer,
    CONSTRAINT "orders_market_cap_after_check" CHECK (("market_cap_after" >= "market_cap_before")),
    CONSTRAINT "orders_market_cap_before_check" CHECK ((("market_cap_before")::numeric >= (0)::numeric)),
    CONSTRAINT "orders_order_type_check" CHECK (("order_type" = ANY (ARRAY['BUY'::"text", 'SELL'::"text"]))),
    CONSTRAINT "orders_price_per_share_check" CHECK ((("price_per_share")::numeric > (0)::numeric)),
    CONSTRAINT "orders_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "orders_shares_outstanding_check" CHECK (((("order_type" = 'BUY'::"text") AND ("shares_outstanding_after" <= "shares_outstanding_before")) OR (("order_type" = 'SELL'::"text") AND ("shares_outstanding_after" >= "shares_outstanding_before")) OR (("shares_outstanding_after" IS NULL) OR ("shares_outstanding_before" IS NULL)))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'FILLED'::"text", 'CANCELLED'::"text"]))),
    CONSTRAINT "orders_total_amount_check" CHECK ((("total_amount")::numeric > (0)::numeric))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON TABLE "public"."orders" IS 'total_amount is calculated as ROUND(price_per_share, 2) * quantity to ensure exact matching with positions.total_invested';



COMMENT ON CONSTRAINT "orders_shares_outstanding_check" ON "public"."orders" IS 'Validates shares_outstanding changes: BUY decreases (after <= before), SELL increases (after >= before)';



CREATE SEQUENCE IF NOT EXISTS "public"."orders_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."orders_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."orders_id_seq" OWNED BY "public"."orders"."id";



CREATE TABLE IF NOT EXISTS "public"."positions" (
    "user_id" "uuid",
    "team_id" integer,
    "quantity" numeric,
    "total_invested" bigint,
    "id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "total_pnl" bigint DEFAULT 0,
    CONSTRAINT "valid_investments" CHECK ((("total_invested")::numeric >= (0)::numeric)),
    CONSTRAINT "valid_quantities" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."positions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."positions"."total_pnl" IS 'Total profit/loss in cents: unrealized P&L (current_value - total_invested) + realized P&L (from SELL orders)';



CREATE SEQUENCE IF NOT EXISTS "public"."positions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."positions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."positions_id_seq" OWNED BY "public"."positions"."id";



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_admin" boolean DEFAULT false,
    "wallet_balance" bigint DEFAULT 0 NOT NULL,
    "email" "text",
    "birthday" "date",
    "country" "text",
    "phone" "text",
    "first_name" "text",
    "last_name" "text",
    "portfolio_value" bigint DEFAULT 0 NOT NULL,
    "reffered_by" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."email" IS 'User email address (synced from auth.users)';



COMMENT ON COLUMN "public"."profiles"."birthday" IS 'User date of birth';



COMMENT ON COLUMN "public"."profiles"."country" IS 'User country of residence';



COMMENT ON COLUMN "public"."profiles"."phone" IS 'User telephone number';



COMMENT ON COLUMN "public"."profiles"."first_name" IS 'User first name';



COMMENT ON COLUMN "public"."profiles"."last_name" IS 'User last name';



CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "ip_address" "inet",
    "endpoint" "text" NOT NULL,
    "request_count" integer DEFAULT 1,
    "window_start" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "rate_limits_user_or_ip" CHECK ((("user_id" IS NOT NULL) OR ("ip_address" IS NOT NULL)))
);


ALTER TABLE "public"."rate_limits" OWNER TO "postgres";


COMMENT ON TABLE "public"."rate_limits" IS 'Rate limiting tracking table. Used to prevent abuse of API endpoints.';



CREATE TABLE IF NOT EXISTS "public"."stripe_events" (
    "id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stripe_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" integer NOT NULL,
    "external_id" integer NOT NULL,
    "name" "text" NOT NULL,
    "short_name" "text" NOT NULL,
    "logo_url" "text",
    "initial_market_cap" bigint DEFAULT 100.00,
    "market_cap" bigint DEFAULT 100.00,
    "total_shares" integer DEFAULT 1000 NOT NULL,
    "available_shares" integer DEFAULT 1000 NOT NULL,
    "shares_outstanding" integer DEFAULT 5,
    "is_tradeable" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "launch_price" bigint DEFAULT 20.00,
    CONSTRAINT "teams_available_shares_bounds" CHECK ((("available_shares" >= 0) AND ("available_shares" <= "total_shares"))),
    CONSTRAINT "teams_market_cap_minimum" CHECK ((("market_cap")::numeric >= 10.00)),
    CONSTRAINT "teams_total_shares_fixed" CHECK (("total_shares" = 1000))
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


COMMENT ON COLUMN "public"."teams"."initial_market_cap" IS 'Initial market cap: $5,000 ($5/share × 1000 shares)';



COMMENT ON COLUMN "public"."teams"."total_shares" IS 'Fixed total supply of shares (always 1000)';



COMMENT ON COLUMN "public"."teams"."available_shares" IS 'Platform inventory - shares available for purchase (decreases on purchase)';



COMMENT ON COLUMN "public"."teams"."launch_price" IS 'Launch price per share: $5.00 (Fixed Shares Model: 1000 shares total)';



CREATE OR REPLACE VIEW "public"."team_market_data" AS
 SELECT "id",
    "name",
    "short_name",
    "external_id",
    "logo_url",
    ((("launch_price")::numeric / 100.0))::numeric(10,2) AS "launch_price",
    ((("initial_market_cap")::numeric / 100.0))::numeric(15,2) AS "initial_market_cap",
    ((("market_cap")::numeric / 100.0))::numeric(15,2) AS "market_cap",
    "shares_outstanding",
        CASE
            WHEN ("shares_outstanding" > 0) THEN (((("market_cap" / "shares_outstanding"))::numeric / 100.0))::numeric(10,2)
            ELSE 20.00
        END AS "current_price",
    "is_tradeable",
    "created_at",
    "updated_at"
   FROM "public"."teams" "t";


ALTER VIEW "public"."team_market_data" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."team_performance_summary" AS
 SELECT "t"."id" AS "team_id",
    "t"."name" AS "team_name",
    ((("t"."initial_market_cap")::numeric / 100.0))::numeric(15,2) AS "initial_market_cap",
    "cls"."current_market_cap",
    "cls"."current_shares_outstanding",
    "cls"."current_share_price",
    "cls"."last_updated",
    ((("cls"."current_market_cap" * (100)::numeric) - ("t"."initial_market_cap")::numeric) / 100.0) AS "total_market_cap_change",
    "round"((((("cls"."current_market_cap" * (100)::numeric) - ("t"."initial_market_cap")::numeric) / ("t"."initial_market_cap")::numeric) * (100)::numeric), 2) AS "market_cap_change_percent",
    ( SELECT "count"(*) AS "count"
           FROM "public"."total_ledger"
          WHERE (("total_ledger"."team_id" = "t"."id") AND ("total_ledger"."ledger_type" = 'match_win'::"text"))) AS "wins",
    ( SELECT "count"(*) AS "count"
           FROM "public"."total_ledger"
          WHERE (("total_ledger"."team_id" = "t"."id") AND ("total_ledger"."ledger_type" = 'match_loss'::"text"))) AS "losses",
    ( SELECT "count"(*) AS "count"
           FROM "public"."total_ledger"
          WHERE (("total_ledger"."team_id" = "t"."id") AND ("total_ledger"."ledger_type" = 'match_draw'::"text"))) AS "draws",
    ( SELECT "count"(*) AS "count"
           FROM "public"."total_ledger"
          WHERE (("total_ledger"."team_id" = "t"."id") AND ("total_ledger"."ledger_type" = 'share_purchase'::"text"))) AS "share_purchases",
    ( SELECT "count"(*) AS "count"
           FROM "public"."total_ledger"
          WHERE (("total_ledger"."team_id" = "t"."id") AND ("total_ledger"."ledger_type" = 'share_sale'::"text"))) AS "share_sales",
    ( SELECT COALESCE("sum"("total_ledger"."shares_traded"), (0)::bigint) AS "coalesce"
           FROM "public"."total_ledger"
          WHERE (("total_ledger"."team_id" = "t"."id") AND ("total_ledger"."ledger_type" = ANY (ARRAY['share_purchase'::"text", 'share_sale'::"text"])))) AS "total_shares_traded",
    ( SELECT (COALESCE("sum"("total_ledger"."amount_transferred"), (0)::numeric) / 100.0)
           FROM "public"."total_ledger"
          WHERE (("total_ledger"."team_id" = "t"."id") AND ("total_ledger"."ledger_type" = ANY (ARRAY['share_purchase'::"text", 'share_sale'::"text"])))) AS "total_trade_volume"
   FROM ("public"."teams" "t"
     LEFT JOIN "public"."current_team_states" "cls" ON (("t"."id" = "cls"."team_id")))
  ORDER BY "cls"."current_market_cap" DESC;


ALTER VIEW "public"."team_performance_summary" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."teams_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."teams_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."teams_id_seq" OWNED BY "public"."teams"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."total_ledger_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."total_ledger_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."total_ledger_id_seq" OWNED BY "public"."total_ledger"."id";



CREATE TABLE IF NOT EXISTS "public"."transfers_ledger" (
    "id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "fixture_id" integer NOT NULL,
    "winner_team_id" integer NOT NULL,
    "loser_team_id" integer NOT NULL,
    "transfer_amount" bigint NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"(),
    "is_latest" boolean DEFAULT true
);


ALTER TABLE "public"."transfers_ledger" OWNER TO "postgres";


COMMENT ON TABLE "public"."transfers_ledger" IS 'Records market cap transfers between teams based on match results only';



COMMENT ON COLUMN "public"."transfers_ledger"."fixture_id" IS 'Reference to the fixture that caused this transfer';



COMMENT ON COLUMN "public"."transfers_ledger"."winner_team_id" IS 'Team that won the match and gained market cap';



COMMENT ON COLUMN "public"."transfers_ledger"."loser_team_id" IS 'Team that lost the match and lost market cap';



COMMENT ON COLUMN "public"."transfers_ledger"."transfer_amount" IS 'Amount of market cap transferred from loser to winner';



COMMENT ON COLUMN "public"."transfers_ledger"."applied_at" IS 'When this transfer was applied to the market';



COMMENT ON COLUMN "public"."transfers_ledger"."is_latest" IS 'Whether this is the latest transfer record (for historical tracking)';



CREATE SEQUENCE IF NOT EXISTS "public"."transfers_ledger_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."transfers_ledger_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."transfers_ledger_id_seq" OWNED BY "public"."transfers_ledger"."id";



CREATE TABLE IF NOT EXISTS "public"."wallet_transactions" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text" NOT NULL,
    "type" "text" NOT NULL,
    "ref" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "wallet_transactions_type_check" CHECK (("type" = ANY (ARRAY['deposit'::"text", 'purchase'::"text", 'sale'::"text", 'refund'::"text", 'adjustment'::"text", 'credit_loan'::"text", 'credit_loan_reversal'::"text"])))
);


ALTER TABLE "public"."wallet_transactions" OWNER TO "postgres";


ALTER TABLE "public"."wallet_transactions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."wallet_transactions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."weekly_leaderboard" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_start" timestamp with time zone NOT NULL,
    "week_end" timestamp with time zone NOT NULL,
    "start_wallet_value" bigint NOT NULL,
    "start_portfolio_value" bigint NOT NULL,
    "start_account_value" bigint NOT NULL,
    "end_wallet_value" bigint NOT NULL,
    "end_portfolio_value" bigint NOT NULL,
    "end_account_value" bigint NOT NULL,
    "deposits_week" bigint DEFAULT 0 NOT NULL,
    "weekly_return" numeric(10,6) NOT NULL,
    "rank" integer NOT NULL,
    "is_latest" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "week_number" integer
);


ALTER TABLE "public"."weekly_leaderboard" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_leaderboard_backup" (
    "id" bigint,
    "user_id" "uuid",
    "week_start" timestamp with time zone,
    "week_end" timestamp with time zone,
    "start_wallet_value" bigint,
    "start_portfolio_value" bigint,
    "start_account_value" bigint,
    "end_wallet_value" bigint,
    "end_portfolio_value" bigint,
    "end_account_value" bigint,
    "deposits_week" bigint,
    "weekly_return" numeric(10,6),
    "rank" integer,
    "is_latest" boolean,
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."weekly_leaderboard_backup" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."weekly_leaderboard_current" AS
 SELECT "id",
    "user_id",
    "week_start",
    "week_end",
    "start_wallet_value",
    "start_portfolio_value",
    "start_account_value",
    "end_wallet_value",
    "end_portfolio_value",
    "end_account_value",
    "deposits_week",
    "weekly_return",
    "rank",
    "is_latest",
    "created_at"
   FROM "public"."weekly_leaderboard"
  WHERE ("is_latest" = true)
  ORDER BY "rank";


ALTER VIEW "public"."weekly_leaderboard_current" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."weekly_leaderboard_current_positive" AS
 SELECT "id",
    "user_id",
    "week_start",
    "week_end",
    "start_wallet_value",
    "start_portfolio_value",
    "start_account_value",
    "end_wallet_value",
    "end_portfolio_value",
    "end_account_value",
    "deposits_week",
    "weekly_return",
    "rank",
    "is_latest",
    "created_at"
   FROM "public"."weekly_leaderboard"
  WHERE (("is_latest" = true) AND ("weekly_return" > (0)::numeric))
  ORDER BY "weekly_return" DESC;


ALTER VIEW "public"."weekly_leaderboard_current_positive" OWNER TO "postgres";


ALTER TABLE "public"."weekly_leaderboard" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."weekly_leaderboard_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."fixtures" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fixtures_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."orders" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."orders_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."positions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."positions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."teams" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."teams_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."total_ledger" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."total_ledger_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."transfers_ledger" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transfers_ledger_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deposits"
    ADD CONSTRAINT "deposits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fixtures"
    ADD CONSTRAINT "fixtures_external_id_key" UNIQUE ("external_id");



ALTER TABLE ONLY "public"."fixtures"
    ADD CONSTRAINT "fixtures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_user_team_unique" UNIQUE ("user_id", "team_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_events"
    ADD CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_external_id_key" UNIQUE ("external_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."total_ledger"
    ADD CONSTRAINT "total_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transfers_ledger"
    ADD CONSTRAINT "transfers_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_leaderboard"
    ADD CONSTRAINT "weekly_leaderboard_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_audit_log_action" ON "public"."audit_log" USING "btree" ("action");



CREATE INDEX "idx_audit_log_user_id" ON "public"."audit_log" USING "btree" ("user_id");



CREATE INDEX "idx_fixtures_applied" ON "public"."fixtures" USING "btree" ("kickoff_at") WHERE ("status" = 'applied'::"text");



CREATE INDEX "idx_fixtures_external_id" ON "public"."fixtures" USING "btree" ("external_id");



CREATE INDEX "idx_fixtures_kickoff_status" ON "public"."fixtures" USING "btree" ("kickoff_at", "status");



CREATE INDEX "idx_fixtures_matchday" ON "public"."fixtures" USING "btree" ("matchday");



CREATE INDEX "idx_fixtures_scheduled" ON "public"."fixtures" USING "btree" ("kickoff_at") WHERE ("status" = 'scheduled'::"text");



CREATE INDEX "idx_fixtures_status" ON "public"."fixtures" USING "btree" ("status");



CREATE INDEX "idx_fixtures_team_results" ON "public"."fixtures" USING "btree" ("home_team_id", "away_team_id", "result", "status", "kickoff_at");



CREATE INDEX "idx_fixtures_team_status" ON "public"."fixtures" USING "btree" ("home_team_id", "away_team_id", "status");



CREATE INDEX "idx_orders_executed_at" ON "public"."orders" USING "btree" ("executed_at");



CREATE INDEX "idx_orders_market_cap_after" ON "public"."orders" USING "btree" ("market_cap_after");



CREATE INDEX "idx_orders_market_cap_before" ON "public"."orders" USING "btree" ("market_cap_before");



CREATE INDEX "idx_orders_pending" ON "public"."orders" USING "btree" ("created_at") WHERE ("status" = 'PENDING'::"text");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_orders_team_id" ON "public"."orders" USING "btree" ("team_id");



CREATE INDEX "idx_orders_team_status" ON "public"."orders" USING "btree" ("team_id", "status", "created_at");



CREATE INDEX "idx_orders_user_id" ON "public"."orders" USING "btree" ("user_id");



CREATE INDEX "idx_orders_user_status" ON "public"."orders" USING "btree" ("user_id", "status", "created_at");



CREATE INDEX "idx_profiles_is_admin" ON "public"."profiles" USING "btree" ("is_admin") WHERE ("is_admin" = true);



CREATE INDEX "idx_profiles_portfolio_value" ON "public"."profiles" USING "btree" ("portfolio_value" DESC);



CREATE INDEX "idx_profiles_username" ON "public"."profiles" USING "btree" ("username");



CREATE INDEX "idx_rate_limits_ip_endpoint" ON "public"."rate_limits" USING "btree" ("ip_address", "endpoint", "window_start");



CREATE INDEX "idx_rate_limits_user_endpoint" ON "public"."rate_limits" USING "btree" ("user_id", "endpoint", "window_start");



CREATE INDEX "idx_teams_external_id" ON "public"."teams" USING "btree" ("external_id");



CREATE INDEX "idx_teams_market_cap_calc" ON "public"."teams" USING "btree" (((("market_cap")::numeric / (NULLIF("shares_outstanding", 0))::numeric)));



CREATE INDEX "idx_teams_market_data" ON "public"."teams" USING "btree" ("id", "name", "market_cap", "shares_outstanding");



CREATE INDEX "idx_teams_name" ON "public"."teams" USING "btree" ("name");



CREATE INDEX "idx_teams_name_lower" ON "public"."teams" USING "btree" ("lower"("name"));



CREATE INDEX "idx_total_ledger_event_date" ON "public"."total_ledger" USING "btree" ("event_date");



CREATE INDEX "idx_total_ledger_ledger_type" ON "public"."total_ledger" USING "btree" ("ledger_type");



CREATE INDEX "idx_total_ledger_team_date" ON "public"."total_ledger" USING "btree" ("team_id", "event_date");



CREATE INDEX "idx_total_ledger_team_id" ON "public"."total_ledger" USING "btree" ("team_id");



CREATE INDEX "idx_total_ledger_trigger_event" ON "public"."total_ledger" USING "btree" ("trigger_event_type", "trigger_event_id");



CREATE UNIQUE INDEX "idx_total_ledger_unique_match_entry" ON "public"."total_ledger" USING "btree" ("team_id", "trigger_event_id", "ledger_type") WHERE (("ledger_type" = ANY (ARRAY['match_win'::"text", 'match_loss'::"text", 'match_draw'::"text"])) AND ("trigger_event_id" IS NOT NULL));



CREATE INDEX "idx_transfers_applied_at" ON "public"."transfers_ledger" USING "btree" ("applied_at");



CREATE INDEX "idx_transfers_fixture_id" ON "public"."transfers_ledger" USING "btree" ("fixture_id");



CREATE INDEX "idx_transfers_loser_team_id" ON "public"."transfers_ledger" USING "btree" ("loser_team_id");



CREATE INDEX "idx_transfers_team_applied" ON "public"."transfers_ledger" USING "btree" ("winner_team_id", "loser_team_id", "applied_at");



CREATE INDEX "idx_transfers_winner_team_id" ON "public"."transfers_ledger" USING "btree" ("winner_team_id");



CREATE UNIQUE INDEX "wallet_transactions_user_ref_unique" ON "public"."wallet_transactions" USING "btree" ("user_id", "ref") WHERE ("ref" IS NOT NULL);



COMMENT ON INDEX "public"."wallet_transactions_user_ref_unique" IS 'Ensures idempotency: prevents duplicate wallet transactions with the same ref';



CREATE INDEX "weekly_leaderboard_latest_rank" ON "public"."weekly_leaderboard" USING "btree" ("is_latest", "rank");



CREATE UNIQUE INDEX "weekly_leaderboard_user_week" ON "public"."weekly_leaderboard" USING "btree" ("user_id", "week_start");



CREATE OR REPLACE TRIGGER "check_profile_field_updates" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_profile_field_updates"();



CREATE OR REPLACE TRIGGER "deposits_set_updated_at" BEFORE UPDATE ON "public"."deposits" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "fixture_insert_market_cap_trigger" AFTER INSERT ON "public"."fixtures" FOR EACH ROW EXECUTE FUNCTION "public"."process_fixture_insert_for_market_cap"();



CREATE OR REPLACE TRIGGER "fixture_result_trigger" AFTER UPDATE ON "public"."fixtures" FOR EACH ROW WHEN ((("old"."result" = 'pending'::"text") AND ("new"."result" <> 'pending'::"text"))) EXECUTE FUNCTION "public"."fixture_result_trigger"();



CREATE OR REPLACE TRIGGER "match_result_audit_trigger" AFTER UPDATE ON "public"."fixtures" FOR EACH ROW EXECUTE FUNCTION "public"."log_match_result_audit"();



CREATE OR REPLACE TRIGGER "positions_update_portfolio_value" AFTER INSERT OR DELETE OR UPDATE ON "public"."positions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_portfolio_value"();



CREATE OR REPLACE TRIGGER "sync_portfolio_on_position_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."positions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_portfolio_on_position_change"();



COMMENT ON TRIGGER "sync_portfolio_on_position_change" ON "public"."positions" IS 'Auto-updates user portfolio_value when positions change';



CREATE OR REPLACE TRIGGER "sync_portfolio_on_team_update" AFTER UPDATE OF "market_cap", "total_shares" ON "public"."teams" FOR EACH ROW WHEN ((("old"."market_cap" IS DISTINCT FROM "new"."market_cap") OR ("old"."total_shares" IS DISTINCT FROM "new"."total_shares"))) EXECUTE FUNCTION "public"."sync_portfolio_on_team_change"();



CREATE OR REPLACE TRIGGER "teams_update_portfolio_values" AFTER UPDATE OF "market_cap" ON "public"."teams" FOR EACH ROW WHEN (("old"."market_cap" IS DISTINCT FROM "new"."market_cap")) EXECUTE FUNCTION "public"."trigger_update_all_portfolio_values"();



CREATE OR REPLACE TRIGGER "trg_enforce_fixture_matchday" BEFORE INSERT OR UPDATE ON "public"."fixtures" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_fixture_matchday"();



CREATE OR REPLACE TRIGGER "trg_set_total_ledger_description" BEFORE INSERT OR UPDATE OF "opponent_team_name", "trigger_event_id", "trigger_event_type", "ledger_type", "team_id" ON "public"."total_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."set_total_ledger_event_description"();



CREATE OR REPLACE TRIGGER "trigger_update_portfolio" AFTER INSERT OR DELETE OR UPDATE ON "public"."positions" FOR EACH ROW EXECUTE FUNCTION "public"."update_portfolio_value"();



CREATE OR REPLACE TRIGGER "trigger_update_positions_pnl_on_market_cap_change" AFTER UPDATE OF "market_cap" ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."update_all_positions_pnl_on_market_cap_change"();



CREATE OR REPLACE TRIGGER "update_fixtures_updated_at" BEFORE UPDATE ON "public"."fixtures" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fixtures"
    ADD CONSTRAINT "fixtures_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fixtures"
    ADD CONSTRAINT "fixtures_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."total_ledger"
    ADD CONSTRAINT "total_ledger_opponent_team_id_fkey" FOREIGN KEY ("opponent_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."total_ledger"
    ADD CONSTRAINT "total_ledger_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transfers_ledger"
    ADD CONSTRAINT "transfers_ledger_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id");



ALTER TABLE ONLY "public"."transfers_ledger"
    ADD CONSTRAINT "transfers_ledger_loser_team_id_fkey" FOREIGN KEY ("loser_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."transfers_ledger"
    ADD CONSTRAINT "transfers_ledger_winner_team_id_fkey" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."weekly_leaderboard"
    ADD CONSTRAINT "weekly_leaderboard_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Allow authenticated read access" ON "public"."weekly_leaderboard" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated read profiles for leaderboard" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Service role can manage all audit logs" ON "public"."audit_log" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all orders" ON "public"."orders" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all transfers" ON "public"."transfers_ledger" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage fixtures" ON "public"."fixtures" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage teams" ON "public"."teams" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "System can insert audit logs" ON "public"."audit_log" FOR INSERT WITH CHECK (("user_id" IS NULL));



CREATE POLICY "Users can insert own audit logs" ON "public"."audit_log" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own orders" ON "public"."orders" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own orders" ON "public"."orders" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own audit logs" ON "public"."audit_log" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own orders" ON "public"."orders" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deposits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deposits_admin_select" ON "public"."deposits" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "deposits_insert_self" ON "public"."deposits" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "deposits_select_own" ON "public"."deposits" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "deposits_service_role" ON "public"."deposits" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."fixtures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fixtures_admin_insert" ON "public"."fixtures" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



COMMENT ON POLICY "fixtures_admin_insert" ON "public"."fixtures" IS 'Admins can insert fixtures (needed for sync operations that use UPSERT)';



CREATE POLICY "fixtures_admin_update" ON "public"."fixtures" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "fixtures_select_public" ON "public"."fixtures" FOR SELECT USING (true);



CREATE POLICY "fixtures_service_role" ON "public"."fixtures" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_admin_select" ON "public"."orders" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



COMMENT ON POLICY "orders_admin_select" ON "public"."orders" IS 'Allows admins to view all orders for admin dashboard and trading activity monitoring';



ALTER TABLE "public"."positions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "positions_admin_select" ON "public"."positions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



COMMENT ON POLICY "positions_admin_select" ON "public"."positions" IS 'Allows admins to view all positions for admin dashboard and user portfolio monitoring';



CREATE POLICY "positions_delete_policy" ON "public"."positions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "positions_insert_policy" ON "public"."positions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "positions_select_policy" ON "public"."positions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "positions_service_role" ON "public"."positions" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "positions_update_policy" ON "public"."positions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_admin_select" ON "public"."profiles" FOR SELECT USING ("public"."is_user_admin"("auth"."uid"()));



CREATE POLICY "profiles_admin_update" ON "public"."profiles" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "profiles_1"
  WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "profiles_1"
  WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."is_admin" = true)))));



CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_service_role" ON "public"."profiles" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rate_limits_service_role" ON "public"."rate_limits" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."stripe_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stripe_events_admin_select" ON "public"."stripe_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "stripe_events_service_role" ON "public"."stripe_events" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teams_admin_update" ON "public"."teams" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "teams_select_public" ON "public"."teams" FOR SELECT USING (true);



CREATE POLICY "teams_service_role" ON "public"."teams" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."total_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "total_ledger_admin_select" ON "public"."total_ledger" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "total_ledger_select_public" ON "public"."total_ledger" FOR SELECT USING (true);



CREATE POLICY "total_ledger_service_role" ON "public"."total_ledger" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."transfers_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transfers_ledger_admin_select" ON "public"."transfers_ledger" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "transfers_ledger_select_public" ON "public"."transfers_ledger" FOR SELECT USING (true);



CREATE POLICY "transfers_ledger_service_role" ON "public"."transfers_ledger" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."wallet_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_tx_admin_select" ON "public"."wallet_transactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "wallet_tx_insert_own" ON "public"."wallet_transactions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "wallet_tx_select_own" ON "public"."wallet_transactions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "wallet_tx_service_role" ON "public"."wallet_transactions" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."weekly_leaderboard" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."acquire_user_lock"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."acquire_user_lock"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."acquire_user_lock"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_position_with_history"("p_user_id" "uuid", "p_team_id" integer, "p_quantity" integer, "p_total_invested" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."add_position_with_history"("p_user_id" "uuid", "p_team_id" integer, "p_quantity" integer, "p_total_invested" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_position_with_history"("p_user_id" "uuid", "p_team_id" integer, "p_quantity" integer, "p_total_invested" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_position_total_pnl"("p_user_id" "uuid", "p_team_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_position_total_pnl"("p_user_id" "uuid", "p_team_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_position_total_pnl"("p_user_id" "uuid", "p_team_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_user_portfolio_value"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_user_portfolio_value"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_user_portfolio_value"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_season_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."clear_season_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_season_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_ledger_entry"("p_team_id" integer, "p_ledger_type" "text", "p_amount_transferred" numeric, "p_price_impact" numeric, "p_shares_traded" integer, "p_trigger_event_id" integer, "p_trigger_event_type" "text", "p_opponent_team_id" integer, "p_opponent_team_name" "text", "p_match_result" "text", "p_match_score" "text", "p_is_home_match" boolean, "p_event_description" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_ledger_entry"("p_team_id" integer, "p_ledger_type" "text", "p_amount_transferred" numeric, "p_price_impact" numeric, "p_shares_traded" integer, "p_trigger_event_id" integer, "p_trigger_event_type" "text", "p_opponent_team_id" integer, "p_opponent_team_name" "text", "p_match_result" "text", "p_match_score" "text", "p_is_home_match" boolean, "p_event_description" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_ledger_entry"("p_team_id" integer, "p_ledger_type" "text", "p_amount_transferred" numeric, "p_price_impact" numeric, "p_shares_traded" integer, "p_trigger_event_id" integer, "p_trigger_event_type" "text", "p_opponent_team_id" integer, "p_opponent_team_name" "text", "p_match_result" "text", "p_match_score" "text", "p_is_home_match" boolean, "p_event_description" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_team_snapshot"("p_team_id" integer, "p_snapshot_type" "text", "p_trigger_event_id" integer, "p_trigger_event_type" "text", "p_match_result" "text", "p_price_impact" numeric, "p_shares_traded" integer, "p_trade_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."create_team_snapshot"("p_team_id" integer, "p_snapshot_type" "text", "p_trigger_event_id" integer, "p_trigger_event_type" "text", "p_match_result" "text", "p_price_impact" numeric, "p_shares_traded" integer, "p_trade_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_team_snapshot"("p_team_id" integer, "p_snapshot_type" "text", "p_trigger_event_id" integer, "p_trigger_event_type" "text", "p_match_result" "text", "p_price_impact" numeric, "p_shares_traded" integer, "p_trade_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_team_snapshot"("p_team_id" integer, "p_snapshot_type" "text", "p_trigger_event_id" integer, "p_trigger_event_type" "text", "p_match_result" "text", "p_price_impact" numeric, "p_shares_traded" integer, "p_trade_amount" numeric, "p_effective_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."create_team_snapshot"("p_team_id" integer, "p_snapshot_type" "text", "p_trigger_event_id" integer, "p_trigger_event_type" "text", "p_match_result" "text", "p_price_impact" numeric, "p_shares_traded" integer, "p_trade_amount" numeric, "p_effective_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_team_snapshot"("p_team_id" integer, "p_snapshot_type" "text", "p_trigger_event_id" integer, "p_trigger_event_type" "text", "p_match_result" "text", "p_price_impact" numeric, "p_shares_traded" integer, "p_trade_amount" numeric, "p_effective_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."credit_wallet"("p_user_id" "uuid", "p_amount_cents" bigint, "p_ref" "text", "p_currency" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."credit_wallet"("p_user_id" "uuid", "p_amount_cents" bigint, "p_ref" "text", "p_currency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."credit_wallet"("p_user_id" "uuid", "p_amount_cents" bigint, "p_ref" "text", "p_currency" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."credit_wallet_loan"("p_user_id" "uuid", "p_amount_cents" bigint, "p_ref" "text", "p_currency" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."credit_wallet_loan"("p_user_id" "uuid", "p_amount_cents" bigint, "p_ref" "text", "p_currency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."credit_wallet_loan"("p_user_id" "uuid", "p_amount_cents" bigint, "p_ref" "text", "p_currency" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_fixture_matchday"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_fixture_matchday"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_fixture_matchday"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fixture_result_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."fixture_result_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fixture_result_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fixture_result_trigger_func"() TO "anon";
GRANT ALL ON FUNCTION "public"."fixture_result_trigger_func"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fixture_result_trigger_func"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_weekly_leaderboard_exact_v2"("p_week_start" timestamp with time zone, "p_week_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_weekly_leaderboard_exact_v2"("p_week_start" timestamp with time zone, "p_week_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_weekly_leaderboard_exact_v2"("p_week_start" timestamp with time zone, "p_week_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_team_complete_timeline"("p_team_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_team_complete_timeline"("p_team_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_team_complete_timeline"("p_team_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_team_state_at_time"("p_team_id" integer, "p_at_time" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_team_state_at_time"("p_team_id" integer, "p_at_time" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_team_state_at_time"("p_team_id" integer, "p_at_time" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_team_state_history"("p_team_id" integer, "p_from_date" timestamp with time zone, "p_to_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_team_state_history"("p_team_id" integer, "p_from_date" timestamp with time zone, "p_to_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_team_state_history"("p_team_id" integer, "p_from_date" timestamp with time zone, "p_to_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_team_timeline"("p_team_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_team_timeline"("p_team_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_team_timeline"("p_team_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_portfolio"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_portfolio"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_portfolio"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_weekly_leaderboard_current"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_weekly_leaderboard_current"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_weekly_leaderboard_current"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_buy_window_open"("p_team_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."is_buy_window_open"("p_team_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_buy_window_open"("p_team_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_team_tradeable"("team_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."is_team_tradeable"("team_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_team_tradeable"("team_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_user_admin"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_admin"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_admin"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_match_result_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_match_result_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_match_result_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_security_event"("event_type" "text", "user_id" "uuid", "details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_security_event"("event_type" "text", "user_id" "uuid", "details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_security_event"("event_type" "text", "user_id" "uuid", "details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_profile_field_updates"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_profile_field_updates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_profile_field_updates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_fixture_insert_for_market_cap"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_fixture_insert_for_market_cap"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_fixture_insert_for_market_cap"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_all_portfolio_values"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_all_portfolio_values"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_all_portfolio_values"() TO "service_role";



GRANT ALL ON FUNCTION "public"."require_authentication"() TO "anon";
GRANT ALL ON FUNCTION "public"."require_authentication"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."require_authentication"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_marketplace_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_marketplace_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_marketplace_complete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reverse_credit_loan"("p_transaction_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."reverse_credit_loan"("p_transaction_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reverse_credit_loan"("p_transaction_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_total_ledger_event_description"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_total_ledger_event_description"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_total_ledger_event_description"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_all_portfolio_values"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_all_portfolio_values"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_all_portfolio_values"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_portfolio_on_position_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_portfolio_on_position_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_portfolio_on_position_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_portfolio_on_team_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_portfolio_on_team_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_portfolio_on_team_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."total_ledger_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."total_ledger_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."total_ledger_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_team_snapshot_on_market_cap_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_team_snapshot_on_market_cap_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_team_snapshot_on_market_cap_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_all_portfolio_values"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_all_portfolio_values"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_all_portfolio_values"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_portfolio_value"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_portfolio_value"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_portfolio_value"() TO "service_role";



GRANT ALL ON FUNCTION "public"."truncate_profiles_table"() TO "anon";
GRANT ALL ON FUNCTION "public"."truncate_profiles_table"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."truncate_profiles_table"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_all_positions_pnl_on_market_cap_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_all_positions_pnl_on_market_cap_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_all_positions_pnl_on_market_cap_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_portfolio_value"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_portfolio_value"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_portfolio_value"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_position_total_pnl"("p_user_id" "uuid", "p_team_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_position_total_pnl"("p_user_id" "uuid", "p_team_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_position_total_pnl"("p_user_id" "uuid", "p_team_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_portfolio_value"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_portfolio_value"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_portfolio_value"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_positive_amount"("value" numeric, "field_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_positive_amount"("value" numeric, "field_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_positive_amount"("value" numeric, "field_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_positive_integer"("value" numeric, "field_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_positive_integer"("value" numeric, "field_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_positive_integer"("value" numeric, "field_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_uuid"("value" "text", "field_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_uuid"("value" "text", "field_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_uuid"("value" "text", "field_name" "text") TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."total_ledger" TO "anon";
GRANT ALL ON TABLE "public"."total_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."total_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."current_team_states" TO "anon";
GRANT ALL ON TABLE "public"."current_team_states" TO "authenticated";
GRANT ALL ON TABLE "public"."current_team_states" TO "service_role";



GRANT ALL ON TABLE "public"."deposits" TO "anon";
GRANT ALL ON TABLE "public"."deposits" TO "authenticated";
GRANT ALL ON TABLE "public"."deposits" TO "service_role";



GRANT ALL ON SEQUENCE "public"."deposits_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."deposits_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."deposits_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fixtures" TO "anon";
GRANT ALL ON TABLE "public"."fixtures" TO "authenticated";
GRANT ALL ON TABLE "public"."fixtures" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fixtures_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fixtures_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fixtures_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON SEQUENCE "public"."orders_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."orders_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."orders_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."positions" TO "anon";
GRANT ALL ON TABLE "public"."positions" TO "authenticated";
GRANT ALL ON TABLE "public"."positions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."positions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."positions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."positions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_events" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."team_market_data" TO "anon";
GRANT ALL ON TABLE "public"."team_market_data" TO "authenticated";
GRANT ALL ON TABLE "public"."team_market_data" TO "service_role";



GRANT ALL ON TABLE "public"."team_performance_summary" TO "anon";
GRANT ALL ON TABLE "public"."team_performance_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."team_performance_summary" TO "service_role";



GRANT ALL ON SEQUENCE "public"."teams_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."teams_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."teams_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."total_ledger_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."total_ledger_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."total_ledger_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."transfers_ledger" TO "anon";
GRANT ALL ON TABLE "public"."transfers_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."transfers_ledger" TO "service_role";



GRANT ALL ON SEQUENCE "public"."transfers_ledger_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."transfers_ledger_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transfers_ledger_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_transactions" TO "anon";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."wallet_transactions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."wallet_transactions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."wallet_transactions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_leaderboard" TO "anon";
GRANT ALL ON TABLE "public"."weekly_leaderboard" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_leaderboard" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_leaderboard_backup" TO "anon";
GRANT ALL ON TABLE "public"."weekly_leaderboard_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_leaderboard_backup" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_leaderboard_current" TO "anon";
GRANT ALL ON TABLE "public"."weekly_leaderboard_current" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_leaderboard_current" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_leaderboard_current_positive" TO "anon";
GRANT ALL ON TABLE "public"."weekly_leaderboard_current_positive" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_leaderboard_current_positive" TO "service_role";



GRANT ALL ON SEQUENCE "public"."weekly_leaderboard_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."weekly_leaderboard_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."weekly_leaderboard_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






RESET ALL;
