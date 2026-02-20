/**
 * Update Buy Close Times Migration
 * 
 * This script updates all existing fixtures to use the new 15-minute buy window
 * instead of the old 30-minute window.
 * 
 * Run this script once to migrate existing data:
 * npx tsx scripts/update-buy-close-times.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
// Use service role key for admin operations (updating existing data)
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file');
  process.exit(1);
}

console.log('🔑 Using Supabase URL:', supabaseUrl);
console.log('🔑 Using Service Role Key:', supabaseKey.substring(0, 20) + '...\n');

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateBuyCloseTimes() {
  console.log('🔄 Updating buy_close_at times for all fixtures...\n');

  try {    // Get all fixtures
    const { data: fixtures, error: fetchError } = await supabase
      .from('fixtures')
      .select('id, kickoff_at, buy_close_at')
      .order('kickoff_at', { ascending: true });

    if (fetchError) {
      throw new Error(`Error fetching fixtures: ${fetchError.message}`);
    }

    if (!fixtures || fixtures.length === 0) {
      console.log('⚠️  No fixtures found in database');
      return;
    }

    console.log(`📊 Found ${fixtures.length} fixtures to update\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const fixture of fixtures) {
      try {
        const kickoffTime = new Date(fixture.kickoff_at);
        
        // Calculate new buy_close_at (15 minutes before kickoff)
        const newBuyCloseTime = new Date(kickoffTime.getTime() - 15 * 60 * 1000);
        
        // Get old buy_close_at for comparison
        const oldBuyCloseTime = new Date(fixture.buy_close_at);
        
        // Check if update is needed
        const timeDiff = Math.abs(newBuyCloseTime.getTime() - oldBuyCloseTime.getTime());
        
        if (timeDiff < 1000) {
          // Times are already the same (within 1 second tolerance)
          skippedCount++;
          continue;
        }

        // Update the fixture
        const { error: updateError } = await supabase
          .from('fixtures')
          .update({ buy_close_at: newBuyCloseTime.toISOString() })
          .eq('id', fixture.id);

        if (updateError) {
          console.error(`❌ Error updating fixture ${fixture.id}:`, updateError.message);
          errorCount++;
          continue;
        }        updatedCount++;
        
        // Log the update
        console.log(`✅ Updated fixture ${fixture.id}`);
        console.log(`   Kickoff: ${kickoffTime.toLocaleString('en-US', { timeZone: 'Asia/Dubai' })}`);
        console.log(`   Old close: ${oldBuyCloseTime.toLocaleString('en-US', { timeZone: 'Asia/Dubai' })}`);
        console.log(`   New close: ${newBuyCloseTime.toLocaleString('en-US', { timeZone: 'Asia/Dubai' })}`);
        console.log('');

      } catch (error) {
        console.error(`❌ Error processing fixture ${fixture.id}:`, error);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 Migration Summary:');
    console.log('='.repeat(60));
    console.log(`✅ Updated: ${updatedCount} fixtures`);
    console.log(`⏭️  Skipped: ${skippedCount} fixtures (already correct)`);
    console.log(`❌ Errors: ${errorCount} fixtures`);
    console.log('='.repeat(60));

    if (updatedCount > 0) {
      console.log('\n✨ Buy close times successfully updated to 15 minutes before kickoff!');
      console.log('🔄 Please refresh your application to see the changes.');
    }

  } catch (error) {
    console.error('❌ Fatal error during migration:', error);
    process.exit(1);
  }
}

// Run the migration
updateBuyCloseTimes()
  .then(() => {
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
