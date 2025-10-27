import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from './env';

// Initialize Supabase client using validated environment variables
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    flowType: 'pkce'
  }
});

export { supabase };