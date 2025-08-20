import { createClient } from '@supabase/supabase-js';


// Initialize Supabase client
// Using direct values from project configuration
const supabaseUrl = 'https://qukjslflpqiblwxszruh.supabase.co';
const supabaseKey = 'sb_publishable_2o9qQ4_y6aj79IHqh9O1LA_f04zSd50';
const supabase = createClient(supabaseUrl, supabaseKey);


export { supabase };