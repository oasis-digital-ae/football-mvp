/**
 * Backfill Weekly Leaderboard
 *
 * Populates weekly_leaderboard for the current week and optionally past weeks.
 * Uses generate_weekly_leaderboard RPC for each week.
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
    }

    // Compute via RPC
    const { data, error } = await supabase.rpc('generate_weekly_leaderboard', {
      p_week_start: week_start.toISOString(),
      p_week_end: week_end.toISOString(),
    });

    if (error) {
      console.error('   ❌ RPC error:', error.message);
      throw error;
    }

    if (!data || data.length === 0) {
      console.log('   ⚠️  No users with accounts, skipping insert');
      continue;
    }

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
    }

    // Insert (include week_number to match table structure)
    const rows = data.map((r: Record<string, unknown>) => ({
      ...r,
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
