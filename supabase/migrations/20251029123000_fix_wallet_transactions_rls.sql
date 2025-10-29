-- Fix RLS policies for wallet_transactions to allow inserts from functions

-- Drop existing policies if they exist
DROP POLICY IF EXISTS wallet_tx_select_own ON public.wallet_transactions;
DROP POLICY IF EXISTS wallet_tx_insert_own ON public.wallet_transactions;

-- Allow users to select their own transactions
CREATE POLICY wallet_tx_select_own ON public.wallet_transactions 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Allow inserts for the current authenticated user OR if user_id matches
-- This allows the process_share_purchase_atomic function (which uses SECURITY DEFINER)
-- to insert wallet transactions. SECURITY DEFINER functions bypass RLS, but we keep
-- this policy for when inserts happen outside of functions.
CREATE POLICY wallet_tx_insert_own ON public.wallet_transactions 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Note: Functions with SECURITY DEFINER bypass RLS policies entirely
-- The process_share_purchase_atomic function has SECURITY DEFINER, so it can insert
-- without being subject to RLS. This policy is for direct inserts from client code.

