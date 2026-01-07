/**
 * Diagnostic script to identify unprocessed match results
 * 
 * This script identifies fixtures that:
 * 1. Have status='applied' and result != 'pending' (counted in games played)
 * 2. But don't have entries in total_ledger (not shown in dropdown)
 * 
 * Root Cause: The fixture_result_trigger was disabled in migration 20250131000019,
 * so fixtures updated with results don't automatically get processed into total_ledger.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnoseUnprocessedMatches() {
  try {
    console.log('🔍 Diagnosing unprocessed match results...\n');

    // Step 1: Check if trigger is enabled
    console.log('Step 1: Checking fixture_result_trigger status...');
    const { data: triggerStatus, error: triggerError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT 
          tgname as trigger_name,
          tgenabled as enabled
        FROM pg_trigger
        WHERE tgname = 'fixture_result_trigger'
        AND tgrelid = 'fixtures'::regclass;
      `
    }).catch(() => ({ data: null, error: null }));

    if (triggerError) {
      console.log('⚠️  Could not check trigger status (may need admin access)');
    } else {
      console.log('   Trigger status:', triggerStatus || 'Could not determine');
    }

    // Step 2: Find completed fixtures
    console.log('\nStep 2: Finding completed fixtures...');
    const { data: completedFixtures, error: completedError } = await supabase
      .from('fixtures')
      .select('id, kickoff_at, home_team_id, away_team_id, result, status, snapshot_home_cap, snapshot_away_cap, matchday')
      .eq('status', 'applied')
      .neq('result', 'pending')
      .order('kickoff_at', { ascending: true });

    if (completedError) {
      throw new Error(`Error fetching completed fixtures: ${completedError.message}`);
    }

    console.log(`   Found ${completedFixtures?.length || 0} completed fixtures`);

    // Step 3: Find fixtures with entries in total_ledger
    console.log('\nStep 3: Finding fixtures with entries in total_ledger...');
    const { data: ledgerEntries, error: ledgerError } = await supabase
      .from('total_ledger')
      .select('trigger_event_id')
      .eq('trigger_event_type', 'fixture')
      .in('ledger_type', ['match_win', 'match_loss', 'match_draw']);

    if (ledgerError) {
      throw new Error(`Error fetching ledger entries: ${ledgerError.message}`);
    }

    const processedFixtureIds = new Set(ledgerEntries?.map(e => e.trigger_event_id) || []);
    console.log(`   Found ${processedFixtureIds.size} processed fixtures`);

    // Step 4: Identify unprocessed fixtures
    console.log('\nStep 4: Identifying unprocessed fixtures...');
    const unprocessedFixtures = (completedFixtures || []).filter(
      f => !processedFixtureIds.has(f.id)
    );

    console.log(`   Found ${unprocessedFixtures.length} unprocessed fixtures\n`);

    if (unprocessedFixtures.length === 0) {
      console.log('✅ All completed fixtures have been processed!');
      return;
    }

    // Group by matchday
    const byMatchday = new Map<number, typeof unprocessedFixtures>();
    unprocessedFixtures.forEach(f => {
      const matchday = f.matchday || 0;
      if (!byMatchday.has(matchday)) {
        byMatchday.set(matchday, []);
      }
      byMatchday.get(matchday)!.push(f);
    });

    console.log('📊 Unprocessed fixtures by matchday:');
    Array.from(byMatchday.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([matchday, fixtures]) => {
        console.log(`\n   Matchday ${matchday}: ${fixtures.length} fixtures`);
        fixtures.forEach(f => {
          const hasSnapshots = f.snapshot_home_cap !== null && f.snapshot_away_cap !== null;
          console.log(`     - Fixture ${f.id} (${new Date(f.kickoff_at).toLocaleDateString()}): ${f.result} ${hasSnapshots ? '✓ snapshots' : '✗ missing snapshots'}`);
        });
      });

    // Step 5: Check for missing snapshots
    console.log('\nStep 5: Checking for missing snapshots...');
    const missingSnapshots = unprocessedFixtures.filter(
      f => f.snapshot_home_cap === null || f.snapshot_away_cap === null
    );

    if (missingSnapshots.length > 0) {
      console.log(`   ⚠️  ${missingSnapshots.length} fixtures are missing snapshots:`);
      missingSnapshots.forEach(f => {
        console.log(`     - Fixture ${f.id} (Matchday ${f.matchday || '?'})`);
      });
    } else {
      console.log('   ✅ All unprocessed fixtures have snapshots');
    }

    // Summary
    console.log('\n📋 Summary:');
    console.log(`   Total completed fixtures: ${completedFixtures?.length || 0}`);
    console.log(`   Processed fixtures: ${processedFixtureIds.size}`);
    console.log(`   Unprocessed fixtures: ${unprocessedFixtures.length}`);
    console.log(`   Missing snapshots: ${missingSnapshots.length}`);

    // Root cause explanation
    console.log('\n🔍 Root Cause Analysis:');
    console.log('   The issue is that fixtures have status="applied" and result != "pending"');
    console.log('   (so they are counted in games played), but they don\'t have entries in');
    console.log('   total_ledger (so they don\'t show in the dropdown).');
    console.log('\n   This likely happened because:');
    console.log('   1. The fixture_result_trigger was disabled in migration 20250131000019');
    console.log('   2. Fixtures were synced from API with results but never processed');
    console.log('   3. The trigger may not have fired when fixtures were updated');

    console.log('\n💡 Solution:');
    console.log('   Run the processAllCompletedFixturesForMarketCap function to process');
    console.log('   all unprocessed fixtures. This can be done from the admin panel or');
    console.log('   by calling matchProcessingService.processAllCompletedFixturesForMarketCap()');

  } catch (error) {
    console.error('❌ Error during diagnosis:', error);
    throw error;
  }
}

// Run the diagnostic
diagnoseUnprocessedMatches()
  .then(() => {
    console.log('\n✅ Diagnosis complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Diagnosis failed:', error);
    process.exit(1);
  });



