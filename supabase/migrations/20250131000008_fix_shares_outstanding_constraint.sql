-- Fix Orders Shares Outstanding Constraint
-- The constraint was designed for variable shares model where shares_outstanding increases on purchase
-- In fixed shares model: BUY decreases available_shares, SELL increases available_shares
-- We need to update the constraint to handle both order types correctly

-- Step 1: Drop the old constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_shares_outstanding_check;

-- Step 2: Add new constraint that validates based on order_type
-- BUY: shares_outstanding_after < shares_outstanding_before (decreases)
-- SELL: shares_outstanding_after > shares_outstanding_before (increases)
ALTER TABLE orders ADD CONSTRAINT orders_shares_outstanding_check 
  CHECK (
    (order_type = 'BUY' AND shares_outstanding_after <= shares_outstanding_before) OR
    (order_type = 'SELL' AND shares_outstanding_after >= shares_outstanding_before) OR
    (shares_outstanding_after IS NULL OR shares_outstanding_before IS NULL)
  );

COMMENT ON CONSTRAINT orders_shares_outstanding_check ON orders IS 
  'Validates shares_outstanding changes: BUY decreases (after <= before), SELL increases (after >= before)';


