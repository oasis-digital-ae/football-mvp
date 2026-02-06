-- Ensures profiles table exists for Supabase Preview branches.
-- The main project has profiles from remote_schema; preview branches run only
-- migrations from the repo, so we need this for weekly_leaderboard FK to succeed.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_admin BOOLEAN DEFAULT false,
  wallet_balance BIGINT NOT NULL DEFAULT 0,
  email TEXT,
  birthday DATE,
  country TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT
);
