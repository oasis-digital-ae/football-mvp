/**
 * Backfill Weekly Leaderboard
 *
 * Populates weekly_leaderboard for the current week and optionally past weeks.
 * Uses generate_weekly_leaderboard_exact_v2 RPC for each week.
 *
 * Usage:
 *   npx tsx scripts/calculate-weekly-leaderboard.ts
 *   npx tsx scripts/calculate-weekly-leaderboard.ts --weeks 4
 *
 * Options:
 *   --weeks N   Backfill last N weeks (default: 1 = current week only)
 *
 * Requirements (from .env):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import Decimal from 'decimal.js';

// Import centralized calculation utilities
import {
  calculateWeeklyReturn,
  calculateLeaderboard,
  toLeaderboardDbFormat,
  validateLeaderboardEntries,
  type UserLeaderboardData
} from '../src/shared/lib/utils/leaderboard-calculations';

// Load .env if present
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  const env = readFileSync(envPath, 'utf-8').replace(/\r/g, '');
  for (const line of env.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * UAE week boundaries: Monday 03:00 → next Monday 02:59
 * @param weeksAgo 0 = current week, 1 = last week, etc.
 */
function getUAEWeekBounds(weeksAgo = 0) {
  const nowUTC = new Date();
  const nowUAE = new Date(nowUTC.getTime() + 4 * 60 * 60 * 1000);

  const day = nowUAE.getUTCDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;

  let weekStartUAE = new Date(nowUAE);
  weekStartUAE.setUTCDate(nowUAE.getUTCDate() + diffToMonday);
  weekStartUAE.setUTCHours(3, 0, 0, 0);

  if (weeksAgo > 0) {
    weekStartUAE.setUTCDate(weekStartUAE.getUTCDate() - 7 * weeksAgo);
  }

  const weekEndUAE = new Date(weekStartUAE);
  weekEndUAE.setUTCDate(weekStartUAE.getUTCDate() + 7);
  weekEndUAE.setUTCHours(2, 59, 59, 0); // Match DB format (22:59:59 UTC)

  return {
    week_start: new Date(weekStartUAE.getTime() - 4 * 60 * 60 * 1000),
    week_end: new Date(weekEndUAE.getTime() - 4 * 60 * 60 * 1000),
  };
}

/**
 * Helper: Convert cents (bigint) to dollars with FULL PRECISION
 * CRITICAL: Do NOT round during intermediate calculations
 */
function fromCents(cents: number | null | undefined): number {
  if (cents === null || cents === undefined) return 0;
  return new Decimal(cents).dividedBy(100).toNumber();
}

/**
 * Helper: Convert Decimal to number with FULL PRECISION
 */
function toNumber(value: Decimal): number {
  return value.toNumber();
}

/**
 * Fetch user wallet and portfolio data for leaderboard calculation
 * Uses the same calculation logic as the frontend for consistency
 */
async function fetchUserLeaderboardData(
  weekStart: string,
  weekEnd: string
): Promise<UserLeaderboardData[]> {
  console.log('   📊 Fetching user data...');

  // Get all users with profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, wallet_balance');

  if (profilesError) {
    console.error('   ❌ Failed to fetch profiles:', profilesError);
    throw profilesError;
  }

  if (!profiles || profiles.length === 0) {
    console.log('   ⚠️ No users found');
    return [];
  }

  console.log(`   Found ${profiles.length} users`);

  // Process each user
  const userData: UserLeaderboardData[] = [];

  for (const profile of profiles) {
    const userId = profile.id;

    // 1. Get wallet balance at start and end of week
    const { data: startWalletData } = await supabase
      .from('wallet_transactions')
      .select('balance_after')
      .eq('user_id', userId)
      .lt('created_at', weekStart)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: endWalletData } = await supabase
      .from('wallet_transactions')
      .select('balance_after')
      .eq('user_id', userId)
      .lt('created_at', weekEnd)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const startWalletValue = fromCents(startWalletData?.balance_after ?? 0);
    const endWalletValue = fromCents(endWalletData?.balance_after ?? profile.wallet_balance ?? 0);    // 2. Get portfolio value at start and end of week
    const { data: startPositions } = await supabase
      .from('positions')
      .select('team_id, quantity, total_invested')
      .eq('user_id', userId);

    // CRITICAL: Use Decimal.js for ALL portfolio calculations to ensure precision
    let startPortfolioValue = new Decimal(0);
    let endPortfolioValue = new Decimal(0);

    if (startPositions && startPositions.length > 0) {
      for (const position of startPositions) {
        const { data: startLedger } = await supabase
          .from('total_ledger')
          .select('share_price_after')
          .eq('team_id', position.team_id)
          .lte('event_date', weekStart)
          .order('event_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: endLedger } = await supabase
          .from('total_ledger')
          .select('share_price_after')
          .eq('team_id', position.team_id)
          .lte('event_date', weekEnd)
          .order('event_date', { ascending: false })
          .limit(1)
          .maybeSingle();        const startPrice = new Decimal(startLedger?.share_price_after ?? 20.0);
        const endPrice = new Decimal(endLedger?.share_price_after ?? startLedger?.share_price_after ?? 20.0);
        
        // CRITICAL: quantity in database is stored as CENTS (BIGINT)
        // Must convert from cents to get actual quantity
        const quantity = new Decimal(fromCents(position.quantity ?? 0));

        // Use Decimal multiplication for precision
        startPortfolioValue = startPortfolioValue.plus(startPrice.times(quantity));
        endPortfolioValue = endPortfolioValue.plus(endPrice.times(quantity));
      }
    }

    // 3. Calculate deposits during the week
    const { data: deposits } = await supabase
      .from('wallet_transactions')
      .select('amount_cents')
      .eq('user_id', userId)
      .eq('type', 'deposit')
      .gte('created_at', weekStart)
      .lt('created_at', weekEnd);

    const depositsWeek = (deposits || []).reduce((sum, tx) => sum + fromCents(tx.amount_cents), 0);

    // 4. Calculate account values using Decimal.js
    const startAccountValue = new Decimal(startWalletValue).plus(startPortfolioValue).toNumber();
    const endAccountValue = new Decimal(endWalletValue).plus(endPortfolioValue).toNumber();

    // 5. Include users with any account activity
    const hasActivity = startAccountValue > 0 || endAccountValue > 0 || depositsWeek > 0;

    if (hasActivity) {
      userData.push({
        user_id: userId,
        full_name: profile.full_name,
        start_wallet_value: startWalletValue,
        start_portfolio_value: toNumber(startPortfolioValue),
        start_account_value: startAccountValue,
        end_wallet_value: endWalletValue,
        end_portfolio_value: toNumber(endPortfolioValue),
        end_account_value: endAccountValue,
        deposits_week: depositsWeek
      });
    }
  }

  console.log(`   Processed ${userData.length} users with activity`);
  return userData;
}

async function backfillWeeklyLeaderboard(weeksToBackfill: number) {
  console.log(`🚀 Weekly Leaderboard Backfill (last ${weeksToBackfill} week(s))`);
  console.log('');

  let totalInserted = 0;

  for (let i = weeksToBackfill - 1; i >= 0; i--) {
    const { week_start, week_end } = getUAEWeekBounds(i);
    const isLatest = i === 0;

    console.log(
      `📅 Week ${weeksToBackfill - i}: ${week_start.toISOString().slice(0, 10)} → ${week_end.toISOString().slice(0, 10)} ${isLatest ? '(current)' : ''}`
    );

    // Skip if already processed
    const { count } = await supabase
      .from('weekly_leaderboard')
      .select('id', { count: 'exact', head: true })
      .eq('week_start', week_start.toISOString());

    if (count && count > 0) {
      console.log('   ⏭️  Already processed, skipping');
      continue;
    }    // Fetch user data and compute leaderboard using TypeScript
    const userData = await fetchUserLeaderboardData(
      week_start.toISOString(),
      week_end.toISOString()
    );

    if (userData.length === 0) {
      console.log('   ⚠️  No users with accounts, skipping insert');
      continue;
    }

    // Calculate leaderboard using centralized calculation logic
    const leaderboardEntries = calculateLeaderboard(userData);

    // Validate calculations
    const validationErrors = validateLeaderboardEntries(leaderboardEntries);
    if (validationErrors.length > 0) {
      console.error('   ❌ Validation errors:', validationErrors);
      throw new Error('Validation failed');
    }

    console.log(`   ✅ Calculated leaderboard for ${leaderboardEntries.length} users`);

    // Get week_number: for backfill, use max - i so oldest week gets lowest number
    const { data: maxWeek } = await supabase
      .from('weekly_leaderboard')
      .select('week_number')
      .order('week_number', { ascending: false })
      .limit(1)
      .single();

    const maxNum = maxWeek?.week_number ?? 0;
    const weekNumber = maxNum - i; // i=0 (current) -> max, i=3 (oldest) -> max-3

    // Reset is_latest if this is the current week
    if (isLatest) {
      await supabase
        .from('weekly_leaderboard')
        .update({ is_latest: false })
        .eq('is_latest', true);
    }    // Insert (include week_number to match table structure)
    const rows = leaderboardEntries.map((entry) => ({
      ...toLeaderboardDbFormat(entry),
      week_start: week_start.toISOString(),
      week_end: week_end.toISOString(),
      week_number: weekNumber,
      is_latest: isLatest,
    }));

    const { error: insertError } = await supabase
      .from('weekly_leaderboard')
      .insert(rows);

    if (insertError) {
      console.error('   ❌ Insert error:', insertError.message);
      throw insertError;
    }

    totalInserted += rows.length;
    console.log(`   ✅ Inserted ${rows.length} rows`);
  }

  console.log('');
  console.log(`✅ Backfill complete. Total rows inserted: ${totalInserted}`);
}

// Parse --weeks N from args (supports --weeks 4 or --weeks=4)
const weeksIdx = process.argv.indexOf('--weeks');
const weeksToBackfill =
  weeksIdx >= 0
    ? parseInt(process.argv[weeksIdx + 1] || process.argv[weeksIdx]?.split('=')[1] || '1', 10)
    : 1;

if (weeksToBackfill < 1 || weeksToBackfill > 52) {
  console.error('❌ --weeks must be between 1 and 52');
  process.exit(1);
}

backfillWeeklyLeaderboard(weeksToBackfill)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
