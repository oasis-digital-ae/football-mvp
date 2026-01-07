-- Add missing profile fields for user registration
-- These fields are required by the signup form but were missing from the profiles table

DO $$
BEGIN
  -- Add email column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN email text;
  END IF;

  -- Add birthday column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'birthday'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN birthday date;
  END IF;

  -- Add country column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'country'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN country text;
  END IF;

  -- Add phone column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN phone text;
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.email IS 'User email address (synced from auth.users)';
COMMENT ON COLUMN public.profiles.birthday IS 'User date of birth';
COMMENT ON COLUMN public.profiles.country IS 'User country of residence';
COMMENT ON COLUMN public.profiles.phone IS 'User telephone number';








