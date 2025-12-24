-- Secure Unrestricted Tables
-- Fix tables that have RLS disabled or overly permissive policies

-- ============================================
-- 1. TOTAL_LEDGER TABLE SECURITY
-- ============================================
-- Enable RLS on total_ledger (currently disabled)
ALTER TABLE public.total_ledger ENABLE ROW LEVEL SECURITY;

-- Allow public read access for market transparency (read-only)
CREATE POLICY total_ledger_select_public ON public.total_ledger
  FOR SELECT
  USING (true);

-- Only service role can insert/update/delete
CREATE POLICY total_ledger_service_role ON public.total_ledger
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Admins can view all ledger entries
CREATE POLICY total_ledger_admin_select ON public.total_ledger
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- ============================================
-- 2. STRIPE_EVENTS TABLE SECURITY
-- ============================================
-- Enable RLS on stripe_events (currently disabled)
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- Only service role can manage stripe events (for webhook processing)
CREATE POLICY stripe_events_service_role ON public.stripe_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Admins can view stripe events
CREATE POLICY stripe_events_admin_select ON public.stripe_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- ============================================
-- 3. FIXTURES TABLE SECURITY
-- ============================================
-- Remove overly permissive policies
DROP POLICY IF EXISTS "Anyone can insert fixtures" ON public.fixtures;
DROP POLICY IF EXISTS "Anyone can update fixtures" ON public.fixtures;
DROP POLICY IF EXISTS "Anyone can view fixtures" ON public.fixtures;

-- Public can view fixtures (read-only for market data)
CREATE POLICY fixtures_select_public ON public.fixtures
  FOR SELECT
  USING (true);

-- Only service role can insert/update fixtures (for API sync)
CREATE POLICY fixtures_service_role ON public.fixtures
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Admins can update fixtures
CREATE POLICY fixtures_admin_update ON public.fixtures
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- ============================================
-- 4. TEAMS TABLE SECURITY
-- ============================================
-- Remove overly permissive policies
DROP POLICY IF EXISTS "Anyone can insert teams" ON public.teams;
DROP POLICY IF EXISTS "Anyone can update teams" ON public.teams;
DROP POLICY IF EXISTS "Anyone can view teams" ON public.teams;

-- Public can view teams (read-only for market data)
CREATE POLICY teams_select_public ON public.teams
  FOR SELECT
  USING (true);

-- Only service role can insert/update teams (for API sync)
CREATE POLICY teams_service_role ON public.teams
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Admins can update teams
CREATE POLICY teams_admin_update ON public.teams
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- ============================================
-- 5. TRANSFERS_LEDGER TABLE SECURITY
-- ============================================
-- Remove overly permissive policies
DROP POLICY IF EXISTS "Anyone can insert match transfers" ON public.transfers_ledger;
DROP POLICY IF EXISTS "Anyone can view match transfers" ON public.transfers_ledger;

-- Public can view transfers (read-only for market transparency)
CREATE POLICY transfers_ledger_select_public ON public.transfers_ledger
  FOR SELECT
  USING (true);

-- Only service role can insert transfers (for match processing)
CREATE POLICY transfers_ledger_service_role ON public.transfers_ledger
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Admins can view all transfers
CREATE POLICY transfers_ledger_admin_select ON public.transfers_ledger
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

COMMENT ON POLICY total_ledger_select_public ON public.total_ledger IS 
  'Public read access for market transparency. Only service role can modify.';

COMMENT ON POLICY stripe_events_service_role ON public.stripe_events IS 
  'Only service role can manage Stripe webhook events. Admins can view.';

COMMENT ON POLICY fixtures_select_public ON public.fixtures IS 
  'Public read access for fixtures. Only service role and admins can modify.';

COMMENT ON POLICY teams_select_public ON public.teams IS 
  'Public read access for teams. Only service role and admins can modify.';

COMMENT ON POLICY transfers_ledger_select_public ON public.transfers_ledger IS 
  'Public read access for market transfers. Only service role can insert.';




