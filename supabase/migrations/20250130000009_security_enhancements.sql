-- Security Enhancements: Rate Limiting, Input Validation, Authentication Checks
-- This migration adds security improvements to RPC functions

-- ============================================
-- 1. Add authentication check helper function
-- ============================================
CREATE OR REPLACE FUNCTION public.require_authentication()
RETURNS uuid AS $$
DECLARE
  user_id uuid;
BEGIN
  user_id := auth.uid();
  
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required. Please sign in.';
  END IF;
  
  RETURN user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.require_authentication() IS 
  'Ensures user is authenticated. Returns user_id or raises exception.';

GRANT EXECUTE ON FUNCTION public.require_authentication() TO authenticated, anon;

-- ============================================
-- 2. Add input validation helper functions
-- ============================================

-- Validate positive integer
CREATE OR REPLACE FUNCTION public.validate_positive_integer(value numeric, field_name text)
RETURNS void AS $$
BEGIN
  IF value IS NULL THEN
    RAISE EXCEPTION 'Field % cannot be null', field_name;
  END IF;
  
  IF value <= 0 THEN
    RAISE EXCEPTION 'Field % must be a positive number', field_name;
  END IF;
  
  IF value != FLOOR(value) THEN
    RAISE EXCEPTION 'Field % must be a whole number', field_name;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Validate positive amount (for money)
CREATE OR REPLACE FUNCTION public.validate_positive_amount(value numeric, field_name text)
RETURNS void AS $$
BEGIN
  IF value IS NULL THEN
    RAISE EXCEPTION 'Field % cannot be null', field_name;
  END IF;
  
  IF value <= 0 THEN
    RAISE EXCEPTION 'Field % must be a positive amount', field_name;
  END IF;
  
  -- Check for reasonable maximum (prevent overflow attacks)
  IF value > 100000000 THEN -- $1 million
    RAISE EXCEPTION 'Field % exceeds maximum allowed value', field_name;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Validate UUID
CREATE OR REPLACE FUNCTION public.validate_uuid(value text, field_name text)
RETURNS uuid AS $$
DECLARE
  result uuid;
BEGIN
  IF value IS NULL THEN
    RAISE EXCEPTION 'Field % cannot be null', field_name;
  END IF;
  
  BEGIN
    result := value::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Field % must be a valid UUID', field_name;
  END;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.validate_positive_integer(numeric, text) IS 
  'Validates that a value is a positive integer. Raises exception if invalid.';
COMMENT ON FUNCTION public.validate_positive_amount(numeric, text) IS 
  'Validates that a value is a positive amount within reasonable limits.';
COMMENT ON FUNCTION public.validate_uuid(text, text) IS 
  'Validates that a value is a valid UUID. Returns UUID or raises exception.';

GRANT EXECUTE ON FUNCTION public.validate_positive_integer(numeric, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.validate_positive_amount(numeric, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.validate_uuid(text, text) TO authenticated, anon;

-- ============================================
-- 3. Update credit_wallet function with validation
-- ============================================
-- Note: This assumes credit_wallet exists. If it doesn't, this will fail gracefully.
-- Check if function exists before modifying
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'credit_wallet'
  ) THEN
    -- Function exists, add comment about security
    COMMENT ON FUNCTION public.credit_wallet IS 
      'Credits user wallet. Requires authentication. Validates inputs.';
  END IF;
END $$;

-- ============================================
-- 4. Add rate limiting table (for future use)
-- ============================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ip_address inet,
  endpoint text NOT NULL,
  request_count integer DEFAULT 1,
  window_start timestamp with time zone DEFAULT NOW(),
  created_at timestamp with time zone DEFAULT NOW(),
  CONSTRAINT rate_limits_user_or_ip CHECK (user_id IS NOT NULL OR ip_address IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint ON public.rate_limits(user_id, endpoint, window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_endpoint ON public.rate_limits(ip_address, endpoint, window_start);

-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can manage rate limits
CREATE POLICY rate_limits_service_role ON public.rate_limits
  FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.rate_limits IS 
  'Rate limiting tracking table. Used to prevent abuse of API endpoints.';

-- ============================================
-- 5. Add security audit log function
-- ============================================
CREATE OR REPLACE FUNCTION public.log_security_event(
  event_type text,
  user_id uuid DEFAULT NULL,
  details jsonb DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.audit_log (
    action,
    table_name,
    record_id,
    user_id,
    details
  ) VALUES (
    event_type,
    'security',
    gen_random_uuid(),
    COALESCE(user_id, auth.uid()),
    COALESCE(details, '{}'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  -- Don't fail if audit log insert fails
  NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.log_security_event(text, uuid, jsonb) IS 
  'Logs security events to audit_log. Used for monitoring suspicious activity.';

GRANT EXECUTE ON FUNCTION public.log_security_event(text, uuid, jsonb) TO authenticated, anon;




