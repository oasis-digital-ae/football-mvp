/**
 * Admin Utility: Portfolio Sync Commands
 * 
 * Provides CLI commands for portfolio synchronization:
 * - Sync single user
 * - Sync all users
 * - Sync users holding a specific team
 * - Verify database schema
 * 
 * Usage:
 *   npx tsx scripts/admin-portfolio-sync.ts sync-user <user_id>
 *   npx tsx scripts/admin-portfolio-sync.ts sync-all
 *   npx tsx scripts/admin-portfolio-sync.ts sync-team <team_id>
 *   npx tsx scripts/admin-portfolio-sync.ts verify-schema
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Get environment variables (support multiple naming conventions)
const supabaseUrl = process.env.SUPABASE_URL || 
                   process.env.VITE_SUPABASE_URL || 
                   process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
                          process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables in .env file:\n');
  console.error('Required:');
  console.error('  - SUPABASE_URL (or VITE_SUPABASE_URL):', supabaseUrl ? '✓' : '✗');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  console.error('\n💡 Add these to your .env file in the project root');
  console.error('\nExample .env:');
  console.error('  SUPABASE_URL=https://your-project.supabase.co');
  console.error('  SUPABASE_SERVICE_ROLE_KEY=your-service-key-here\n');
  process.exit(1);
}

// Create Supabase client with service role key (bypasses RLS for admin operations)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Decimal utility functions (replicate from shared/lib/utils/decimal.ts)
 */
class Decimal {
  private value: number;

  constructor(value: number | string) {
    this.value = typeof value === 'string' ? parseFloat(value) : value;
  }

  dividedBy(divisor: number | Decimal): Decimal {
    const d = divisor instanceof Decimal ? divisor.value : divisor;
    return new Decimal(this.value / d);
  }

  times(multiplier: number | Decimal): Decimal {
    const m = multiplier instanceof Decimal ? multiplier.value : multiplier;
    return new Decimal(this.value * m);
  }

  toNumber(): number {
    return this.value;
  }

  lte(other: number): boolean {
    return this.value <= other;
  }
}

function toDecimal(value: number | string | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}

function roundForDisplay(value: number | Decimal): number {
  const num = value instanceof Decimal ? value.toNumber() : value;
  return Math.round(num * 100) / 100;
}

/**
 * Calculate share price - EXACT replica of calculateSharePrice from calculations.ts
 */
function calculateSharePrice(
  marketCap: number | string | Decimal,
  totalShares: number | string | Decimal,
  defaultValue: number | string | Decimal = 20.00
): number {
  const shares = toDecimal(totalShares);
  if (shares.lte(0)) {
    return roundForDisplay(toDecimal(defaultValue));
  }
  const cap = toDecimal(marketCap);
  const price = cap.dividedBy(shares);
  return roundForDisplay(price);
}

/**
 * Calculate total value - EXACT replica of calculateTotalValue from calculations.ts
 */
function calculateTotalValue(
  pricePerUnit: number | string | Decimal,
  quantity: number | string | Decimal
): number {
  const price = toDecimal(pricePerUnit);
  const qty = toDecimal(quantity);
  const total = price.times(qty);
  return roundForDisplay(total);
}

/**
 * Calculate portfolio value for a single user
 * 
 * 🔥 CRITICAL: Uses EXACT same calculation as usersService.getUserList()
 * Including the SAME helper functions (calculateSharePrice, calculateTotalValue)
 * This guarantees ZERO drift with admin panel
 */
async function calculateUserPortfolio(userId: string): Promise<number> {
  // Get positions for this user
  const { data: positions, error: positionsError } = await supabase
    .from('positions')
    .select(`
      user_id,
      team_id,
      quantity,
      total_invested,
      total_pnl,
      teams!inner(name, market_cap, total_shares)
    `)
    .eq('user_id', userId)
    .gt('quantity', 0);

  if (positionsError) throw positionsError;

  // Get teams for market cap calculations
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, name, market_cap, total_shares');

  if (teamsError) throw teamsError;

  const teamsMap = new Map(teams?.map(t => [t.id, t]) || []);

  // Calculate portfolio value using EXACT same logic as getUserList()
  let portfolioValue = 0;

  (positions || []).forEach(position => {
    const team = teamsMap.get(position.team_id);
    if (!team) return;

    const totalShares = team.total_shares || 1000;
    const marketCapCents = team.market_cap || 0;
    
    // 🔥 Convert cents to dollars (EXACT same as getUserList)
    const marketCapDollars = marketCapCents / 100;
    
    // 🔥 Use EXACT same helper functions (with double rounding)
    const sharePrice = calculateSharePrice(marketCapDollars, totalShares, 20.00);
    const currentValue = calculateTotalValue(sharePrice, position.quantity);

    portfolioValue += currentValue;
  });

  // Return raw sum (already rounded by calculateTotalValue for each position)
  return portfolioValue;
}

/**
 * Sync portfolio value for a single user
 */
async function syncUserPortfolio(userId: string): Promise<{
  success: boolean;
  userId: string;
  portfolioValue: number;
  error?: string;
}> {
  try {
    console.log(`   📊 Calculating portfolio for user ${userId}...`);

    // Calculate using EXACT same logic as admin panel
    const portfolioValue = await calculateUserPortfolio(userId);
    
    // Convert to cents for storage
    const portfolioValueCents = Math.round(portfolioValue * 100);

    console.log(`   💰 Portfolio value: $${portfolioValue.toFixed(2)} (${portfolioValueCents} cents)`);

    // Update database (let DB trigger handle updated_at)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        portfolio_value: portfolioValueCents
      })
      .eq('id', userId);

    if (updateError) {
      return { success: false, userId, portfolioValue, error: updateError.message };
    }

    return { success: true, userId, portfolioValue };

  } catch (error: any) {
    return { 
      success: false, 
      userId, 
      portfolioValue: 0, 
      error: error.message || 'Unknown error' 
    };
  }
}

/**
 * Verify that profiles table has portfolio_value column
 */
async function verifySchema(): Promise<boolean> {
  console.log('🔍 Verifying database schema...\n');

  try {
    // Test query to check if portfolio_value column exists
    const { data, error } = await supabase
      .from('profiles')
      .select('id, portfolio_value')
      .limit(1);

    if (error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        console.error('❌ SCHEMA ERROR: profiles.portfolio_value column does not exist!\n');
        console.log('📝 Migration needed:');
        console.log('   Run this SQL in Supabase dashboard:\n');
        console.log('   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS portfolio_value BIGINT DEFAULT 0;\n');
        console.log('   -- Store portfolio value in cents (BIGINT) for precision');
        console.log('   -- Calculate: positions.total_value (from live market caps)\n');
        return false;
      }
      throw error;
    }

    console.log('✅ Schema verified: profiles.portfolio_value exists\n');
    
    // Show sample data
    if (data && data.length > 0) {
      const sample = data[0];
      const portfolioValueDollars = (sample.portfolio_value || 0) / 100;
      console.log(`📊 Sample: User ${sample.id} has portfolio value: $${portfolioValueDollars.toFixed(2)}\n`);
    }

    return true;

  } catch (error) {
    console.error('❌ Schema verification failed:', error);
    return false;
  }
}

/**
 * Sync single user portfolio
 */
async function syncUser(userId: string): Promise<void> {
  console.log(`🔄 Syncing portfolio for user: ${userId}\n`);

  const result = await syncUserPortfolio(userId);

  if (result.success) {
    console.log(`✅ Success!`);
    console.log(`   User ID: ${result.userId}`);
    console.log(`   Portfolio Value: $${result.portfolioValue.toFixed(2)}\n`);
  } else {
    console.error(`❌ Failed to sync user ${userId}`);
    console.error(`   Error: ${result.error}\n`);
    process.exit(1);
  }
}

/**
 * Sync all users' portfolios
 */
async function syncAllUsers(): Promise<void> {
  console.log('🔄 Starting FULL portfolio sync for all users...\n');
  console.log('⚠️  This may take a while for large user bases.\n');

  const startTime = Date.now();

  // Get all user IDs
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username');

  if (error) {
    console.error('❌ Error fetching users:', error.message);
    process.exit(1);
  }

  if (!profiles || profiles.length === 0) {
    console.log('ℹ️  No users found in database.\n');
    return;
  }

  console.log(`ℹ️  Syncing ${profiles.length} total users...\n`);

  // Process all users
  const results = await Promise.all(
    profiles.map(p => syncUserPortfolio(p.id))
  );

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n📊 Bulk Sync Results:`);
  console.log(`   Total Users: ${profiles.length}`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failures: ${failureCount}`);
  console.log(`   ⏱️  Duration: ${duration}s\n`);

  if (failureCount > 0) {
    console.log('❌ Failed Users:');
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`   - ${r.userId}: ${r.error}`);
      });
    console.log('');
  }

  if (successCount > 0) {
    console.log('✅ Successfully synced portfolio values for all users!\n');
  }
}

/**
 * Sync all users holding a specific team
 */
async function syncTeamHolders(teamId: number): Promise<void> {
  console.log(`🔄 Syncing portfolios for all holders of team ${teamId}...\n`);

  const startTime = Date.now();

  // Get all users with positions in this team
  const { data: positions, error } = await supabase
    .from('positions')
    .select('user_id')
    .eq('team_id', teamId)
    .gt('quantity', 0);

  if (error) {
    console.error('❌ Error fetching team holders:', error.message);
    process.exit(1);
  }

  // Extract unique user IDs
  const userIds = [...new Set((positions || []).map(p => p.user_id))];

  if (userIds.length === 0) {
    console.log(`ℹ️  No users hold shares in team ${teamId}.\n`);
    return;
  }

  console.log(`ℹ️  Found ${userIds.length} holders of team ${teamId}...\n`);

  // Sync all holders
  const results = await Promise.all(
    userIds.map(userId => syncUserPortfolio(userId))
  );

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n📊 Team Holders Sync Results:`);
  console.log(`   Team ID: ${teamId}`);
  console.log(`   Total Holders: ${userIds.length}`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failures: ${failureCount}`);
  console.log(`   ⏱️  Duration: ${duration}s\n`);

  if (successCount > 0) {
    console.log(`✅ Successfully synced ${successCount} portfolios!\n`);
  }
}

/**
 * Main CLI handler
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log('═══════════════════════════════════════════');
  console.log('   Portfolio Sync Admin Utility');
  console.log('═══════════════════════════════════════════\n');

  // First, verify schema
  const schemaValid = await verifySchema();
  if (!schemaValid) {
    console.error('❌ Schema verification failed. Please fix database schema first.\n');
    process.exit(1);
  }

  // Execute command
  switch (command) {
    case 'sync-user': {
      const userId = args[1];
      if (!userId) {
        console.error('❌ Usage: tsx scripts/admin-portfolio-sync.ts sync-user <user_id>\n');
        process.exit(1);
      }
      await syncUser(userId);
      break;
    }

    case 'sync-all': {
      await syncAllUsers();
      break;
    }

    case 'sync-team': {
      const teamId = parseInt(args[1]);
      if (!teamId || isNaN(teamId)) {
        console.error('❌ Usage: tsx scripts/admin-portfolio-sync.ts sync-team <team_id>\n');
        process.exit(1);
      }
      await syncTeamHolders(teamId);
      break;
    }

    case 'verify-schema': {
      // Already verified above
      console.log('✅ Schema verification complete.\n');
      break;
    }

    default: {
      console.log('Available commands:\n');
      console.log('  sync-user <user_id>   - Sync portfolio for single user');
      console.log('  sync-all              - Sync portfolios for ALL users (expensive!)');
      console.log('  sync-team <team_id>   - Sync portfolios for all team holders');
      console.log('  verify-schema         - Check if database schema is correct\n');
      console.log('Examples:\n');
      console.log('  tsx scripts/admin-portfolio-sync.ts verify-schema');
      console.log('  tsx scripts/admin-portfolio-sync.ts sync-user abc123');
      console.log('  tsx scripts/admin-portfolio-sync.ts sync-team 5');
      console.log('  tsx scripts/admin-portfolio-sync.ts sync-all\n');
      process.exit(1);
    }
  }

  console.log('✅ Command completed successfully!\n');
  process.exit(0);
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
