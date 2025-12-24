-- Split full_name into first_name and last_name columns
-- This migration adds first_name and last_name columns and migrates existing data

DO $$
BEGIN
  -- Add first_name column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'first_name'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN first_name text;
  END IF;

  -- Add last_name column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_name'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN last_name text;
  END IF;
END $$;

-- Migrate existing full_name data to first_name and last_name
-- Split on first space: everything before first space = first_name, rest = last_name
UPDATE public.profiles
SET 
  first_name = CASE 
    WHEN full_name IS NULL OR full_name = '' THEN NULL
    WHEN position(' ' in full_name) = 0 THEN full_name  -- No space, use entire name as first_name
    ELSE substring(full_name from 1 for position(' ' in full_name) - 1)  -- Everything before first space
  END,
  last_name = CASE 
    WHEN full_name IS NULL OR full_name = '' THEN NULL
    WHEN position(' ' in full_name) = 0 THEN NULL  -- No space, no last_name
    ELSE substring(full_name from position(' ' in full_name) + 1)  -- Everything after first space
  END
WHERE full_name IS NOT NULL AND (first_name IS NULL OR last_name IS NULL);

COMMENT ON COLUMN public.profiles.first_name IS 'User first name';
COMMENT ON COLUMN public.profiles.last_name IS 'User last name';



