-- Comprehensive Security Audit and RLS Policy Updates
-- Ensure all tables have proper security policies

-- ============================================
-- 1. DEPOSITS TABLE SECURITY
-- ============================================
-- Ensure deposits RLS is properly configured
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS deposits_select_own ON public.deposits;
DROP POLICY IF EXISTS deposits_insert_self ON public.deposits;
DROP POLICY IF EXISTS deposits_admin_select ON public.deposits;

-- Users can only view their own deposits
CREATE POLICY deposits_select_own ON public.deposits
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own deposits (for Stripe webhook processing)
CREATE POLICY deposits_insert_self ON public.deposits
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all deposits
CREATE POLICY deposits_admin_select ON public.deposits
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Service role can manage all deposits
CREATE POLICY deposits_service_role ON public.deposits
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- 2. WALLET_TRANSACTIONS TABLE SECURITY
-- ============================================
-- Ensure wallet_transactions RLS is properly configured
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies
DROP POLICY IF EXISTS wallet_tx_select_own ON public.wallet_transactions;
DROP POLICY IF EXISTS wallet_tx_insert_own ON public.wallet_transactions;
DROP POLICY IF EXISTS wallet_tx_admin_select ON public.wallet_transactions;

-- Users can only view their own transactions
CREATE POLICY wallet_tx_select_own ON public.wallet_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own transactions (though typically done via RPC functions)
CREATE POLICY wallet_tx_insert_own ON public.wallet_transactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all transactions
CREATE POLICY wallet_tx_admin_select ON public.wallet_transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Service role can manage all transactions
CREATE POLICY wallet_tx_service_role ON public.wallet_transactions
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- 3. ORDERS TABLE SECURITY REVIEW
-- ============================================
-- Ensure orders policies are secure
-- Users should only see their own orders, not all orders
DROP POLICY IF EXISTS "All users can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can view filled orders" ON public.orders;

-- Users can view their own orders (already exists, but ensure it's the only SELECT policy)
-- Keep existing: "Users can view own orders"

-- ============================================
-- 4. POSITIONS TABLE SECURITY REVIEW
-- ============================================
-- Remove duplicate policies if they exist
DROP POLICY IF EXISTS "Users can view their own positions" ON public.positions;
DROP POLICY IF EXISTS "All users can view all positions" ON public.positions;

-- Keep only: "Users can view own positions" (singular)

-- ============================================
-- 5. TOTAL_LEDGER SECURITY (Optional - currently public read)
-- ============================================
-- Note: total_ledger is currently public read for transparency
-- If you want to restrict it, uncomment below:
-- ALTER TABLE public.total_ledger ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY total_ledger_select ON public.total_ledger
--   FOR SELECT USING (true); -- Keep public read for market transparency

-- ============================================
-- 6. ADDITIONAL SECURITY: Prevent email enumeration
-- ============================================
-- Note: The profiles SELECT policy already restricts users to their own profile
-- This prevents email enumeration attacks

COMMENT ON POLICY deposits_select_own ON public.deposits IS 
  'Users can only view their own deposit records.';

COMMENT ON POLICY wallet_tx_select_own ON public.wallet_transactions IS 
  'Users can only view their own wallet transaction history.';

COMMENT ON POLICY profiles_select_own ON public.profiles IS 
  'Users can view their own profile. Admins can view all profiles. Prevents email enumeration.';





