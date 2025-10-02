-- Create trigger to populate total_ledger for share purchases/sales
-- This trigger fires when an order status changes to 'FILLED'

-- First, create the trigger function
CREATE OR REPLACE FUNCTION create_share_purchase_ledger_entry()
RETURNS TRIGGER AS $$
DECLARE
    v_team_id INTEGER;
    v_current_state RECORD;
    v_market_cap_before NUMERIC;
    v_shares_outstanding_before INTEGER;
    v_share_price_before NUMERIC;
BEGIN
    -- Only process when status changes to FILLED
    IF NEW.status = 'FILLED' AND (OLD.status IS NULL OR OLD.status != 'FILLED') THEN
        
        v_team_id := NEW.team_id;
        
        -- Get current team state
        SELECT 
            market_cap,
            shares_outstanding,
            CASE 
                WHEN shares_outstanding > 0 THEN market_cap / shares_outstanding 
                ELSE 0 
            END as current_share_price
        INTO v_current_state
        FROM teams 
        WHERE id = v_team_id;
        
        -- Calculate before state by reversing the order's impact
        IF NEW.order_type = 'BUY' THEN
            -- For purchases: current state is AFTER the purchase
            v_market_cap_before := v_current_state.market_cap - NEW.total_amount;
            v_shares_outstanding_before := v_current_state.shares_outstanding - NEW.quantity;
        ELSE
            -- For sales: current state is AFTER the sale
            v_market_cap_before := v_current_state.market_cap + NEW.total_amount;
            v_shares_outstanding_before := v_current_state.shares_outstanding + NEW.quantity;
        END IF;
        
        -- Ensure market cap doesn't go negative
        v_market_cap_before := GREATEST(v_market_cap_before, 0.01);
        
        -- Calculate share price before
        v_share_price_before := CASE 
            WHEN v_shares_outstanding_before > 0 
            THEN v_market_cap_before / v_shares_outstanding_before
            ELSE v_current_state.current_share_price
        END;
        
        -- Insert into total_ledger
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
            v_shares_outstanding_before,
            v_current_state.shares_outstanding,
            NEW.quantity,
            v_share_price_before,
            v_current_state.current_share_price,
            NOW(),
            'system',
            'Created by orders trigger'
        );
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS orders_total_ledger_trigger ON orders;
CREATE TRIGGER orders_total_ledger_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION create_share_purchase_ledger_entry();

-- Test the trigger with a sample order
DO $$
DECLARE
    v_test_team_id INTEGER;
    v_test_user_id UUID;
    v_test_order_id INTEGER;
    v_ledger_count INTEGER;
BEGIN
    -- Get a test team and user
    SELECT id INTO v_test_team_id FROM teams LIMIT 1;
    SELECT id INTO v_test_user_id FROM profiles LIMIT 1;
    
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
    
    -- Update to FILLED to trigger the ledger entry
    UPDATE orders 
    SET status = 'FILLED', updated_at = NOW()
    WHERE id = v_test_order_id;
    
    -- Check if ledger entry was created
    SELECT COUNT(*) INTO v_ledger_count
    FROM total_ledger 
    WHERE trigger_event_id = v_test_order_id;
    
    -- Clean up test data
    DELETE FROM total_ledger WHERE trigger_event_id = v_test_order_id;
    DELETE FROM orders WHERE id = v_test_order_id;
    
    -- Output result
    RAISE NOTICE 'Test completed. Ledger entries created: %', v_ledger_count;
    
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
