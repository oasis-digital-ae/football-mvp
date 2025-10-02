-- Fixed retroactive ledger creation with proper constraint handling
-- This addresses the constraint violation error

DO $$
DECLARE
    v_order_record RECORD;
    v_team_state RECORD;
    v_market_cap_before NUMERIC;
    v_shares_outstanding_before INTEGER;
    v_share_price_before NUMERIC;
    v_entries_created INTEGER := 0;
BEGIN
    -- Process each existing FILLED order
    FOR v_order_record IN 
        SELECT o.* FROM orders o 
        WHERE o.status = 'FILLED' 
        AND NOT EXISTS (SELECT 1 FROM total_ledger tl WHERE tl.trigger_event_id = o.id)
        ORDER BY o.id
    LOOP
        -- Get current team state
        SELECT 
            market_cap,
            shares_outstanding,
            CASE 
                WHEN shares_outstanding > 0 THEN market_cap / shares_outstanding 
                ELSE 0 
            END as current_share_price
        INTO v_team_state
        FROM teams 
        WHERE id = v_order_record.team_id;
        
        -- Calculate before state (reverse the order's impact)
        IF v_order_record.order_type = 'BUY' THEN
            -- For purchases: subtract the order impact to get before state
            v_market_cap_before := GREATEST(v_team_state.market_cap - v_order_record.total_amount, 0.01);
            v_shares_outstanding_before := GREATEST(v_team_state.shares_outstanding - v_order_record.quantity, 0);
        ELSE
            -- For sales: add the order impact to get before state  
            v_market_cap_before := v_team_state.market_cap + v_order_record.total_amount;
            v_shares_outstanding_before := v_team_state.shares_outstanding + v_order_record.quantity;
        END IF;
        
        -- Calculate share price before (with safety check for division by zero)
        v_share_price_before := CASE 
            WHEN v_shares_outstanding_before > 0 
            THEN v_market_cap_before / v_shares_outstanding_before
            ELSE GREATEST(v_team_state.current_share_price, 0.01)
        END;
        
        RAISE NOTICE 'Processing order %: team %, % % shares at $%, market_cap % -> %, shares % -> %', 
            v_order_record.id, v_order_record.team_id, v_order_record.order_type, 
            v_order_record.quantity, v_order_record.price_per_share,
            v_market_cap_before, v_team_state.market_cap,
            v_shares_outstanding_before, v_team_state.shares_outstanding;
        
        -- Create ledger entry with validated values
        BEGIN
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
                v_order_record.team_id,
                CASE WHEN v_order_record.order_type = 'BUY' THEN 'share_purchase' ELSE 'share_sale' END,
                v_order_record.updated_at,
                CONCAT(v_order_record.quantity, ' shares ', CASE WHEN v_order_record.order_type = 'BUY' THEN 'purchased' ELSE 'sold' END, ' at $', v_order_record.price_per_share),
                v_order_record.id,
                'order',
                v_order_record.total_amount,
                v_order_record.total_amount,
                v_market_cap_before,
                v_team_state.market_cap,
                v_shares_outstanding_before,
                v_team_state.shares_outstanding,
                v_order_record.quantity,
                v_share_price_before,
                v_team_state.current_share_price,
                NOW(),
                'retroactive',
                'Created retroactively for existing FILLED orders'
            );
            
            v_entries_created := v_entries_created + 1;
            
        EXCEPTION
            WHEN check_violation THEN
                RAISE NOTICE 'Constraint violation for order %, skipping: %', v_order_record.id, SQLERRM;
                CONTINUE;
        END;
        
    END LOOP;
    
    RAISE NOTICE 'Created % ledger entries for existing FILLED orders', v_entries_created;
    
END $$;

-- Show what was created
SELECT 
    'Created Ledger Entries' as check_type,
    COUNT(*) as count,
    ledger_type,
    MIN(created_at) as first_created,
    MAX(created_at) as last_created
FROM total_ledger 
WHERE trigger_event_type = 'order'
GROUP BY ledger_type
ORDER BY ledger_type;

-- Show sample entries
SELECT 
    'Sample Entries' as check_type,
    id,
    team_id,
    ledger_type,
    event_description,
    market_cap_before,
    market_cap_after,
    shares_outstanding_before,
    shares_outstanding_after,
    shares_traded,
    share_price_before,
    share_price_after
FROM total_ledger 
WHERE trigger_event_type = 'order'
ORDER BY created_at DESC
LIMIT 3;
