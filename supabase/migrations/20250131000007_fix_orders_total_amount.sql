-- Fix Orders Table Total Amount
-- Recalculate total_amount as ROUND(price_per_share, 2) * quantity
-- This ensures orders table matches the correct calculation

UPDATE orders
SET total_amount = ROUND(ROUND(price_per_share, 2) * quantity, 2)
WHERE ABS(total_amount - (ROUND(ROUND(price_per_share, 2) * quantity, 2))) > 0.01;

COMMENT ON TABLE orders IS 'total_amount is calculated as ROUND(price_per_share, 2) * quantity to ensure exact matching with positions.total_invested';


