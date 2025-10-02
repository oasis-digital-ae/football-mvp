-- Debug script to check orders table structure and data
-- Run this to see what's in your orders table

-- Check table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'orders' 
ORDER BY ordinal_position;

-- Check sample data
SELECT 
  id,
  user_id,
  team_id,
  order_type,
  quantity,
  price_per_share,
  total_amount,
  status,
  created_at
FROM orders 
ORDER BY created_at DESC 
LIMIT 10;

-- Check orders by team (replace 1 with actual team_id)
SELECT 
  id,
  user_id,
  team_id,
  order_type,
  quantity,
  price_per_share,
  total_amount,
  status,
  created_at
FROM orders 
WHERE team_id = 1  -- Replace with actual team_id
ORDER BY created_at DESC;

-- Check if there are any BUY orders with FILLED status
SELECT 
  COUNT(*) as total_orders,
  COUNT(CASE WHEN order_type = 'BUY' THEN 1 END) as buy_orders,
  COUNT(CASE WHEN status = 'FILLED' THEN 1 END) as filled_orders,
  COUNT(CASE WHEN order_type = 'BUY' AND status = 'FILLED' THEN 1 END) as buy_filled_orders
FROM orders;


