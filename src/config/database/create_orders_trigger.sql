-- Create trigger on orders table to populate total_ledger for share purchases
-- This trigger will fire when an order is filled and create a total_ledger entry

-- Function to create ledger entry for share purchases
CREATE OR REPLACE FUNCTION create_share_purchase_ledger_entry()
RETURNS TRIGGER AS $$
DECLARE
    v_team_id INTEGER;
    v_current_state RECORD;
    v_ledger_id INTEGER;
    v_market_cap_before DECIMAL(15,2);
    v_shares_before INTEGER;
    v_share_price_before DECIMAL(10,2);
BEGIN
    -- Only process FILLED orders
    IF NEW.status = 'FILLED' AND (OLD.status IS NULL OR OLD.status != 'FILLED') THEN
        
        -- Get team ID from the order
        v_team_id := NEW.team_id;
        
        -- Get current team state (this is AFTER the order has been processed)
        SELECT 
            market_cap,
            shares_outstanding,
            CASE 
                WHEN shares_outstanding > 0 THEN market_cap / shares_outstanding
                ELSE 20.00
            END as current_share_price
        INTO v_current_state
        FROM teams
        WHERE id = v_team_id;
        
        -- Calculate BEFORE values (reverse the order impact)
        IF NEW.order_type = 'BUY' THEN
            -- For purchases: current state is AFTER purchase, so subtract to get BEFORE
            v_market_cap_before := v_current_state.market_cap - NEW.total_amount;
            v_shares_before := v_current_state.shares_outstanding - NEW.quantity;
        ELSE
            -- For sales: current state is AFTER sale, so add to get BEFORE
            v_market_cap_before := v_current_state.market_cap + NEW.total_amount;
            v_shares_before := v_current_state.shares_outstanding + NEW.quantity;
        END IF;
        
        -- Calculate share price before
        v_share_price_before := CASE 
            WHEN v_shares_before > 0 THEN v_market_cap_before / v_shares_before
            ELSE v_current_state.current_share_price
        END;
        
        -- Ensure market cap before is not negative
        v_market_cap_before := GREATEST(v_market_cap_before, 0.01);
        
        -- Create ledger entry for share purchase
        INSERT INTO total_ledger (
            team_id,
            ledger_type,
            event_date,
            event_description,
            trigger_event_id,
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
        ) VALUES (
            v_team_id,
            CASE WHEN NEW.order_type = 'BUY' THEN 'share_purchase' ELSE 'share_sale' END,
            NEW.updated_at,
            CONCAT(NEW.quantity, ' shares ', CASE WHEN NEW.order_type = 'BUY' THEN 'purchased' ELSE 'sold' END, ' at $', NEW.price_per_share),
            NEW.id,
            'order',
            NEW.total_amount,
            NEW.total_amount,
            v_market_cap_before,
            v_current_state.market_cap,
            v_shares_before,
            v_current_state.shares_outstanding,
            NEW.quantity,
            v_share_price_before,
            v_current_state.current_share_price,
            NOW(),
            'system',
            'Created by orders trigger'
        ) RETURNING id INTO v_ledger_id;
        
        RAISE NOTICE 'Created total_ledger entry % for order % (team %, % shares)', 
            v_ledger_id, NEW.id, v_team_id, NEW.quantity;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger on orders table
DROP TRIGGER IF EXISTS orders_total_ledger_trigger ON orders;
CREATE TRIGGER orders_total_ledger_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    WHEN (NEW.status = 'FILLED' AND (OLD.status IS NULL OR OLD.status != 'FILLED'))
    EXECUTE FUNCTION create_share_purchase_ledger_entry();

-- Test the trigger by checking current orders and creating a test entry
DO $$
DECLARE
    v_test_team_id INTEGER;
    v_test_user_id UUID;
    v_test_order_id INTEGER;
    v_ledger_count_before INTEGER;
    v_ledger_count_after INTEGER;
BEGIN
    -- Get a test team
    SELECT id INTO v_test_team_id FROM teams LIMIT 1;
    
    -- Get an existing user ID or create a test profile
    SELECT id INTO v_test_user_id FROM profiles LIMIT 1;
    
    -- If no profiles exist, create a test profile
    IF v_test_user_id IS NULL THEN
        INSERT INTO profiles (id, username, full_name, created_at, updated_at)
        VALUES (gen_random_uuid(), 'test-user', 'Test User', NOW(), NOW())
        RETURNING id INTO v_test_user_id;
    END IF;
    
    -- Count existing ledger entries
    SELECT COUNT(*) INTO v_ledger_count_before FROM total_ledger WHERE team_id = v_test_team_id;
    
    -- Create a test order
    INSERT INTO orders (
        user_id,
        team_id,
        order_type,
        quantity,
        price_per_share,
        total_amount,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_test_user_id,
        v_test_team_id,
        'BUY',
        5,
        20.00,
        100.00,
        'PENDING',
        NOW(),
        NOW()
    ) RETURNING id INTO v_test_order_id;
    
    -- Update the order to FILLED to trigger the ledger entry
    UPDATE orders 
    SET status = 'FILLED', updated_at = NOW()
    WHERE id = v_test_order_id;
    
    -- Count ledger entries after
    SELECT COUNT(*) INTO v_ledger_count_after FROM total_ledger WHERE team_id = v_test_team_id;
    
    -- Show results
    RAISE NOTICE 'Test completed:';
    RAISE NOTICE 'Team ID: %, User ID: %, Order ID: %', v_test_team_id, v_test_user_id, v_test_order_id;
    RAISE NOTICE 'Ledger entries before: %, after: %', v_ledger_count_before, v_ledger_count_after;
    RAISE NOTICE 'New ledger entry created: %', (v_ledger_count_after > v_ledger_count_before);
    
    -- Clean up test order
    DELETE FROM orders WHERE id = v_test_order_id;
    
END $$;

-- Show the trigger status
SELECT 
    'Orders Trigger Status' as check_type,
    trigger_name,
    event_object_table as table_name,
    action_timing,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'orders' AND trigger_name LIKE '%ledger%';
