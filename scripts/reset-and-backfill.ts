/**
 * Reset Database and Backfill to Most Recent Premier League Match
 * 
 * This script:
 * 1. Syncs fixtures from Football API to get latest matches
 * 2. Resets the database to initial state
 * 3. Processes all matches chronologically up to the most recent completed match
 * 
 * Usage:
 *   npx tsx scripts/reset-and-backfill.ts
 * 
 * Requirements:
 *   - VITE_SUPABASE_URL environment variable
 *   - SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_SERVICE_ROLE_KEY environment variable
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { footballIntegrationService } from '../src/shared/lib/football-api';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Required: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  console.error('');
  console.error('You can set these in your .env file or as environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function resetAndBackfill() {
  try {
    console.log('🔄 Step 1: Syncing fixtures from Football API...');
    console.log('   This will fetch the latest Premier League matches and scores...');
    console.log('');
    
    // Sync fixtures from Football API (this will fetch scores)
    await footballIntegrationService.syncPremierLeagueFixtures(2025);
    
    console.log('✅ Fixtures synced successfully!');
    console.log('');
    
    // Check how many fixtures now have scores
    const { data: fixtures, error: fixturesError } = await supabase
      .from('fixtures')
      .select('id, home_score, away_score, result, kickoff_at')
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)
      .neq('result', 'pending')
      .order('kickoff_at', { ascending: false })
      .limit(1);
    
    if (fixturesError) {
      throw fixturesError;
    }
    
    if (!fixtures || fixtures.length === 0) {
      console.log('⚠️ No completed fixtures found. Matches may not have been played yet.');
      console.log('⚠️ Skipping database reset. Please run this script again after matches are played.');
      return;
    }
    
    const latestMatch = fixtures[0];
    console.log(`📊 Latest completed match: ${latestMatch.kickoff_at}`);
    
    const { count } = await supabase
      .from('fixtures')
      .select('*', { count: 'exact', head: true })
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)
      .neq('result', 'pending');
    
    console.log(`📊 Found ${count || 0} completed fixtures to process`);
    console.log('');
    
    console.log('🔄 Step 2: Running database reset and backfill migration...');
    console.log('   This will:');
    console.log('   - Reset all trading data (orders, positions, wallet balances)');
    console.log('   - Reset all teams to initial state ($5,000 market cap)');
    console.log('   - Process all matches chronologically up to the latest match');
    console.log('');
    
    // Read the migration file
    const migrationPath = join(process.cwd(), 'supabase/migrations/20260115000000_reset_and_backfill_to_latest_match.sql');
    let migrationSQL: string;
    
    try {
      migrationSQL = readFileSync(migrationPath, 'utf-8');
    } catch (error) {
      console.error('❌ Error reading migration file:', migrationPath);
      console.error('   Make sure the migration file exists.');
      throw error;
    }
    
    // Execute the migration SQL using Supabase's PostgREST
    // Since we have a DO block, we need to execute it as a single statement
    console.log('📝 Executing migration SQL...');
    console.log('   (This may take a few minutes depending on the number of matches...)');
    console.log('');
    
    // Use the REST API to execute SQL via a function call
    // We'll create a temporary function to execute the DO block
    const { data, error: execError } = await supabase.rpc('exec_sql', { 
      sql: migrationSQL 
    }).catch(async () => {
      // If exec_sql doesn't exist, try to execute via direct SQL
      // We need to use the PostgREST admin API or execute via psql
      console.log('⚠️  Cannot execute SQL directly via RPC.');
      console.log('⚠️  Please apply the migration manually via Supabase Dashboard.');
      console.log('');
      console.log('📋 To apply manually:');
      console.log('1. Go to Supabase Dashboard → SQL Editor');
      console.log('2. Copy and paste the SQL from:');
      console.log(`   ${migrationPath}`);
      console.log('3. Click "Run"');
      console.log('');
      return { data: null, error: new Error('exec_sql not available') };
    });
    
    if (execError && !execError.message.includes('exec_sql')) {
      throw execError;
    }
    
    if (execError && execError.message.includes('exec_sql')) {
      // Migration file is ready, user needs to apply it manually
      console.log('✅ Migration file is ready!');
      console.log('');
      console.log('📋 Next steps:');
      console.log(`1. Open: ${migrationPath}`);
      console.log('2. Copy the SQL content');
      console.log('3. Go to Supabase Dashboard → SQL Editor');
      console.log('4. Paste and run the SQL');
      console.log('');
      return;
    }
    
    console.log('✅ Migration executed successfully!');
    console.log('');
    console.log('✅ Database reset and backfill completed!');
    console.log('');
    console.log('🔍 Verification:');
    console.log('   - Check the total_ledger table for match entries');
    console.log('   - Verify team market caps have been updated');
    console.log('   - Check that total market cap is still $100,000 (perfect conservation)');
    
  } catch (error) {
    console.error('❌ Error in reset and backfill:', error);
    throw error;
  }
}

// Run the script
if (require.main === module) {
  resetAndBackfill()
    .then(() => {
      console.log('');
      console.log('✅ Reset and backfill script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('');
      console.error('❌ Reset and backfill script failed:', error);
      process.exit(1);
    });
}

export { resetAndBackfill };
