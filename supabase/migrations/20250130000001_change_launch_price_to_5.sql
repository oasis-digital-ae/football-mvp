-- Change Launch Price from $20 to $5 and Scale All Market Caps Proportionally
-- This scales all market caps by 0.25 (5/20) to maintain relative price changes

DO $$
DECLARE
  v_scale_factor NUMERIC := 0.25; -- 5 / 20 = 0.25
BEGIN
  -- Step 1: Update launch_price and scale market_cap proportionally for all teams
  -- Scale factor: 5/20 = 0.25 (new price is 1/4 of old price)
  UPDATE teams SET
    launch_price = 5.00,
    initial_market_cap = 5000.00, -- 5 * 1000 shares
    market_cap = ROUND(market_cap * v_scale_factor, 2), -- Scale proportionally
    updated_at = NOW();

  RAISE NOTICE 'Updated all teams: launch_price = $5, scaled market_caps proportionally';

  -- Step 2: Scale all market cap values in total_ledger proportionally
  UPDATE total_ledger SET
    market_cap_before = ROUND(COALESCE(market_cap_before, 0) * v_scale_factor, 2),
    market_cap_after = ROUND(COALESCE(market_cap_after, 0) * v_scale_factor, 2),
    share_price_before = ROUND(COALESCE(share_price_before, 0) * v_scale_factor, 2),
    share_price_after = ROUND(COALESCE(share_price_after, 0) * v_scale_factor, 2),
    price_impact = ROUND(COALESCE(price_impact, 0) * v_scale_factor, 2);

  RAISE NOTICE 'Scaled all market cap values in total_ledger';

  -- Step 3: Scale market cap values in orders table
  UPDATE orders SET
    market_cap_before = ROUND(COALESCE(market_cap_before, 0) * v_scale_factor, 2),
    market_cap_after = ROUND(COALESCE(market_cap_after, 0) * v_scale_factor, 2),
    price_per_share = ROUND(COALESCE(price_per_share, 0) * v_scale_factor, 2),
    total_amount = ROUND(COALESCE(total_amount, 0) * v_scale_factor, 2);

  RAISE NOTICE 'Scaled all market cap and price values in orders';

  -- Step 4: Scale total_invested in positions (user's cost basis)
  UPDATE positions SET
    total_invested = ROUND(total_invested * v_scale_factor, 2);

  RAISE NOTICE 'Scaled all total_invested values in positions';

  -- Step 5: Scale wallet transactions (purchases and sales)
  UPDATE wallet_transactions SET
    amount_cents = ROUND(amount_cents * v_scale_factor)::bigint
  WHERE type IN ('purchase', 'sale');

  RAISE NOTICE 'Scaled all purchase/sale wallet transactions';

  -- Step 6: Scale wallet balances proportionally
  UPDATE profiles SET
    wallet_balance = ROUND(COALESCE(wallet_balance, 0) * v_scale_factor, 2)
  WHERE wallet_balance IS NOT NULL AND wallet_balance > 0;

  RAISE NOTICE 'Scaled all wallet balances';

  -- Step 7: Update fixture snapshots if they exist
  UPDATE fixtures SET
    snapshot_home_cap = ROUND(COALESCE(snapshot_home_cap, 0) * v_scale_factor, 2),
    snapshot_away_cap = ROUND(COALESCE(snapshot_away_cap, 0) * v_scale_factor, 2)
  WHERE snapshot_home_cap IS NOT NULL OR snapshot_away_cap IS NOT NULL;

  RAISE NOTICE 'Scaled all fixture snapshots';

END $$;

COMMENT ON COLUMN teams.launch_price IS 'Launch price per share: $5.00 (Fixed Shares Model: 1000 shares total)';
COMMENT ON COLUMN teams.initial_market_cap IS 'Initial market cap: $5,000 ($5/share × 1000 shares)';




