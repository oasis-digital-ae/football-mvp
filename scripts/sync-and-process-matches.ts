/**
 * Sync Fixtures from Football API and Process Matches
 * 
 * This script:
 * 1. Fetches all Premier League fixtures from Football API
 * 2. Updates fixtures with scores and results
 * 3. Processes matches to update market caps
 * 
 * Run this script to sync fixtures and process matches:
 * npx tsx scripts/sync-and-process-matches.ts
 */

import { createClient } from '@supabase/supabase-js';
import { footballIntegrationService } from '../src/shared/lib/football-api';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncAndProcessMatches() {
  try {
    console.log('🔄 Step 1: Syncing fixtures from Football API...');
    
    // Sync fixtures from Football API (this will fetch scores)
    await footballIntegrationService.syncPremierLeagueFixtures(2025);
    
    console.log('✅ Fixtures synced successfully!');
    
    // Check how many fixtures now have scores
    const { data: fixtures, error } = await supabase
      .from('fixtures')
      .select('id, home_score, away_score, result')
      .not('home_score', 'is', null)
      .not('away_score', 'is', null);
    
    if (error) {
      throw error;
    }
    
    console.log(`📊 Found ${fixtures?.length || 0} fixtures with scores`);
    
    if (!fixtures || fixtures.length === 0) {
      console.log('⚠️ No fixtures with scores found. Matches may not have been played yet.');
      return;
    }
    
    console.log('🔄 Step 2: Processing matches (this happens automatically via triggers)...');
    console.log('✅ Match processing will happen automatically when fixtures are updated.');
    console.log('✅ You can verify by checking the total_ledger table for match entries.');
    
  } catch (error) {
    console.error('❌ Error syncing fixtures:', error);
    throw error;
  }
}

// Run the script
syncAndProcessMatches()
  .then(() => {
    console.log('✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });





