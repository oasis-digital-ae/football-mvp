/**
 * Fix incorrect market_cap values in match_draw ledger entries.
 *
 * Root cause: When backfilling fixtures with missing snapshots, if later matches
 * (e.g. Chelsea Feb 21) were processed before earlier matches (e.g. Crystal Palace Feb 11),
 * the "current" team market cap used as snapshot was wrong (pre-Palace value).
 *
 * This script recomputes the correct pre-match cap for each draw from the team's
 * most recent match before that fixture, then updates the ledger.
 *
 * Run: npx tsx scripts/fix-draw-ledger-entries.ts
 * Dry run (no updates): DRY_RUN=1 npx tsx scripts/fix-draw-ledger-entries.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load .env from project root if present
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

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
const isDryRun = process.env.DRY_RUN === '1';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Set in .env: NEXT_PUBLIC_SUPABASE_URL (or VITE_SUPABASE_URL or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const FIXED_SHARES = 1000;

async function fixDrawLedgerEntries() {
  console.log(isDryRun ? '🔍 DRY RUN - no updates will be made\n' : '🔧 Fixing draw ledger entries...\n');

  const { data: drawEntries, error: drawError } = await supabase
    .from('total_ledger')
    .select('id, team_id, trigger_event_id, event_date, market_cap_before, market_cap_after, share_price_before, share_price_after')
    .eq('ledger_type', 'match_draw')
    .eq('trigger_event_type', 'fixture');

  if (drawError) {
    console.error('❌ Failed to fetch draw entries:', drawError);
    process.exit(1);
  }

  if (!drawEntries?.length) {
    console.log('✅ No match_draw entries found.');
    return;
  }

  console.log(`Found ${drawEntries.length} draw entries to check.\n`);

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, kickoff_at, home_team_id, away_team_id')
    .in('id', drawEntries.map((e) => e.trigger_event_id).filter(Boolean));
  const fixturesMap = new Map((fixtures || []).map((f) => [f.id, f]));

  let fixed = 0;
  for (const entry of drawEntries) {
    const fixture = entry.trigger_event_id ? fixturesMap.get(entry.trigger_event_id) : null;
    if (!fixture) continue;

    const eventDate = new Date(entry.event_date).getTime();

    // Get team's most recent match BEFORE this fixture
    const { data: teamMatches } = await supabase
      .from('total_ledger')
      .select('market_cap_after, event_date')
      .eq('team_id', entry.team_id)
      .in('ledger_type', ['match_win', 'match_loss', 'match_draw'])
      .lt('event_date', entry.event_date)
      .order('event_date', { ascending: false })
      .limit(1);

    let correctCapCents = teamMatches?.[0]?.market_cap_after;
    if (correctCapCents == null) {
      // No previous match - try initial_state
      const { data: initial } = await supabase
        .from('total_ledger')
        .select('market_cap_after')
        .eq('team_id', entry.team_id)
        .eq('ledger_type', 'initial_state')
        .order('event_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      correctCapCents = initial?.market_cap_after;
    }

    if (correctCapCents == null) {
      console.log(`  ⏭️  Entry ${entry.id} (team ${entry.team_id}, fixture ${entry.trigger_event_id}): no prior cap, skipping`);
      continue;
    }

    const currentBefore = Number(entry.market_cap_before);
    const currentAfter = Number(entry.market_cap_after);
    const correctCap = Math.round(Number(correctCapCents));

    if (currentBefore === correctCap && currentAfter === correctCap) {
      continue;
    }

    const sharePriceCents = Math.round(correctCap / FIXED_SHARES);
    console.log(`  📝 Entry ${entry.id}: team ${entry.team_id}, fixture ${entry.trigger_event_id}`);
    console.log(`     Before: ${currentBefore} → ${correctCap} (cents)`);
    console.log(`     After:  ${currentAfter} → ${correctCap} (cents)`);

    if (!isDryRun) {
      const { error: updateError } = await supabase
        .from('total_ledger')
        .update({
          market_cap_before: correctCap,
          market_cap_after: correctCap,
          share_price_before: sharePriceCents,
          share_price_after: sharePriceCents,
          price_impact: 0,
          amount_transferred: 0,
        })
        .eq('id', entry.id);

      if (updateError) {
        console.error(`     ❌ Update failed:`, updateError);
      } else {
        fixed++;
        console.log(`     ✅ Updated`);
      }
    } else {
      fixed++;
    }
  }

  console.log(`\n${isDryRun ? 'Would fix' : 'Fixed'} ${fixed} draw entries.`);
}

fixDrawLedgerEntries()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
