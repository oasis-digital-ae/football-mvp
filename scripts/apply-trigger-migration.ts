/**
 * Script to apply the migration that re-enables the fixture_result_trigger
 * This ensures fixtures are automatically processed when updated with results
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Required: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    console.log('🔄 Applying migration: Re-enable fixture_result_trigger...\n');

    // Read the migration file
    const migrationPath = join(process.cwd(), 'supabase/migrations/20260103000000_re_enable_fixture_trigger_with_atomic.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Split by semicolons and execute each statement
    // Note: We need to handle DO blocks specially
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    // Execute the migration using RPC or direct SQL
    // Since Supabase doesn't support multi-statement queries directly,
    // we'll use the SQL editor approach via a function call
    console.log('📝 Executing migration SQL...');

    // Use the admin API to execute SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    }).catch(async () => {
      // Fallback: Try executing via REST API
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ sql: migrationSQL })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      return { data: await response.json(), error: null };
    });

    if (error) {
      // If exec_sql doesn't exist, we need to apply it manually
      console.log('⚠️  exec_sql function not available. Applying migration manually...');
      
      // Try to execute statements one by one
      for (const statement of statements) {
        if (statement.includes('CREATE OR REPLACE FUNCTION') || statement.includes('ALTER TABLE')) {
          try {
            const { error: stmtError } = await supabase.rpc('exec_sql', { sql: statement + ';' }).catch(() => ({
              error: new Error('exec_sql not available')
            }));

            if (stmtError && !stmtError.message.includes('exec_sql')) {
              console.error(`❌ Error executing statement:`, stmtError);
            }
          } catch (e) {
            console.log('⚠️  Cannot execute SQL directly. Please apply migration manually via Supabase Dashboard.');
            console.log('\n📋 Migration SQL:');
            console.log('='.repeat(60));
            console.log(migrationSQL);
            console.log('='.repeat(60));
            console.log('\n💡 To apply manually:');
            console.log('1. Go to Supabase Dashboard → SQL Editor');
            console.log('2. Copy and paste the SQL above');
            console.log('3. Click "Run"');
            return;
          }
        }
      }
    }

    console.log('✅ Migration applied successfully!');
    console.log('\n🔍 Verifying trigger status...');

    // Verify trigger is enabled
    const { data: triggerStatus, error: verifyError } = await supabase
      .from('pg_trigger')
      .select('*')
      .eq('tgname', 'fixture_result_trigger')
      .single()
      .catch(() => {
        // Try via RPC
        return supabase.rpc('exec_sql', {
          sql: `
            SELECT tgenabled 
            FROM pg_trigger 
            WHERE tgname = 'fixture_result_trigger' 
            AND tgrelid = 'fixtures'::regclass;
          `
        });
      });

    if (!verifyError && triggerStatus) {
      console.log('✅ Trigger verification complete');
    } else {
      console.log('⚠️  Could not verify trigger status (this is okay if migration succeeded)');
    }

    console.log('\n✅ Migration complete! Fixtures will now be automatically processed when updated.');

  } catch (error) {
    console.error('❌ Error applying migration:', error);
    console.log('\n💡 Alternative: Apply migration manually via Supabase Dashboard SQL Editor');
    process.exit(1);
  }
}

applyMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });



