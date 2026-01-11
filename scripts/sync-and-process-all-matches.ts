/**
 * Sync Fixtures from Football API and Process All Matches
 * 
 * This script:
 * 1. Fetches all Premier League fixtures from Football API
 * 2. Updates fixtures with latest scores and results
 * 3. Processes all unprocessed matches to update market caps
 * 
 * Run this script:
 * npx tsx scripts/sync-and-process-all-matches.ts
 */

import { createClient } from '@supabase/supabase-js';
import { footballIntegrationService } from '../src/shared/lib/football-api';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncAndProcessAllMatches() {
  try {
    console.log('🔄 Step 1: Syncing fixtures from Football API...');
    console.log('   Fetching latest Premier League matches and scores...');
    console.log('');
    
    // Sync fixtures from Football API (this will fetch scores)
    await footballIntegrationService.syncPremierLeagueFixtures(2025);
    
    console.log('✅ Fixtures synced successfully!');
    console.log('');
    
    // Check how many fixtures now have scores
    const { data: fixtures, error: fixturesError } = await supabase
      .from('fixtures')
      .select('id, home_score, away_score, result, kickoff_at, snapshot_home_cap, snapshot_away_cap')
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)
      .neq('result', 'pending');
    
    if (fixturesError) {
      throw fixturesError;
    }
    
    console.log(`📊 Found ${fixtures?.length || 0} completed fixtures`);
    
    if (!fixtures || fixtures.length === 0) {
      console.log('⚠️ No completed fixtures found. Matches may not have been played yet.');
      return;
    }
    
    // Find unprocessed fixtures (those with scores but no snapshots)
    const unprocessedFixtures = fixtures.filter(f => 
      !f.snapshot_home_cap || !f.snapshot_away_cap
    );
    
    console.log(`📊 Found ${unprocessedFixtures.length} unprocessed fixtures`);
    console.log('');
    
    if (unprocessedFixtures.length === 0) {
      console.log('✅ All fixtures are already processed!');
      return;
    }
    
    console.log('🔄 Step 2: Processing unprocessed matches...');
    console.log(`   Processing ${unprocessedFixtures.length} matches...`);
    console.log('');
    
    let processedCount = 0;
    let errorCount = 0;
    
    // Process each unprocessed fixture
    for (const fixture of unprocessedFixtures) {
      try {
        // Capture current market caps as snapshots
        const { data: homeTeam } = await supabase
          .from('teams')
          .select('market_cap')
          .eq('id', fixture.home_team_id || 0)
          .single();
        
        const { data: awayTeam } = await supabase
          .from('teams')
          .select('market_cap')
          .eq('id', fixture.away_team_id || 0)
          .single();
        
        if (!homeTeam || !awayTeam) {
          console.warn(`⚠️ Skipping fixture ${fixture.id}: teams not found`);
          errorCount++;
          continue;
        }
        
        // Update fixture with snapshots
        const { error: updateError } = await supabase
          .from('fixtures')
          .update({
            snapshot_home_cap: homeTeam.market_cap,
            snapshot_away_cap: awayTeam.market_cap,
            status: 'applied',
            updated_at: new Date().toISOString()
          })
          .eq('id', fixture.id);
        
        if (updateError) {
          throw updateError;
        }
        
        // Process match result
        const { data: result, error: processError } = await supabase.rpc(
          'process_match_result_atomic',
          { p_fixture_id: fixture.id }
        );
        
        if (processError) {
          throw processError;
        }
        
        if (result && (result as any).success) {
          processedCount++;
          if (processedCount % 10 === 0) {
            console.log(`   Processed ${processedCount} matches...`);
          }
        } else {
          errorCount++;
          console.warn(`⚠️ Failed to process fixture ${fixture.id}: ${JSON.stringify(result)}`);
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error processing fixture ${fixture.id}:`, error);
      }
    }
    
    console.log('');
    console.log('✅ Match processing completed!');
    console.log(`   Processed: ${processedCount} matches`);
    console.log(`   Errors: ${errorCount} matches`);
    console.log('');
    
    // Final verification
    const { data: finalStats } = await supabase
      .from('fixtures')
      .select('*', { count: 'exact', head: true })
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)
      .neq('result', 'pending')
      .is('snapshot_home_cap', null);
    
    const remainingUnprocessed = finalStats?.length || 0;
    
    if (remainingUnprocessed === 0) {
      console.log('✅ All matches have been processed!');
    } else {
      console.log(`⚠️ ${remainingUnprocessed} matches still need processing`);
    }
    
    // Check total market cap
    const { data: teams } = await supabase
      .from('teams')
      .select('market_cap');
    
    if (teams) {
      const totalMarketCap = teams.reduce((sum, team) => sum + (team.market_cap || 0), 0);
      const totalMarketCapDollars = totalMarketCap / 100.0;
      console.log(`💰 Total market cap: $${totalMarketCapDollars.toFixed(2)}`);
      
      if (Math.abs(totalMarketCapDollars - 100000) < 0.01) {
        console.log('✅ Perfect market cap conservation verified!');
      } else {
        console.warn(`⚠️ Market cap drift: Expected $100,000.00, got $${totalMarketCapDollars.toFixed(2)}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error syncing and processing matches:', error);
    throw error;
  }
}

// Run the script
if (require.main === module) {
  syncAndProcessAllMatches()
    .then(() => {
      console.log('');
      console.log('✅ Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('');
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

export { syncAndProcessAllMatches };
