# Reset Database and Backfill to Latest Match

This guide explains how to reset the database and process all Premier League matches up to the most recent completed match.

## Overview

The reset and backfill process:
1. **Syncs fixtures** from the Football API to get the latest matches and scores
2. **Resets all trading data** (orders, positions, wallet balances) to initial state
3. **Resets all teams** to initial state ($5,000 market cap, 1000 shares @ $5/share)
4. **Processes all matches chronologically** up to the most recent completed match
5. **Verifies perfect market cap conservation** (total should remain $100,000)

## Quick Start

### Option 1: Automated Script (Recommended)

Run the automated script that syncs fixtures and applies the migration:

```bash
npm run reset-and-backfill
```

**Requirements:**
- `VITE_SUPABASE_URL` environment variable
- `SUPABASE_SERVICE_ROLE_KEY` or `VITE_SUPABASE_SERVICE_ROLE_KEY` environment variable

The script will:
1. Sync fixtures from Football API
2. Show you the latest match date
3. Execute the migration SQL (or provide instructions if direct execution isn't possible)

### Option 2: Manual Process

#### Step 1: Sync Fixtures

First, sync fixtures from the Football API to get the latest matches:

```bash
npm run sync-fixtures
```

Or manually:

```bash
npx tsx scripts/sync-and-process-matches.ts
```

#### Step 2: Apply Migration

Apply the migration using one of these methods:

**Method A: Supabase Dashboard (Easiest)**
1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Open the migration file: `supabase/migrations/20260115000000_reset_and_backfill_to_latest_match.sql`
4. Copy the entire SQL content
5. Paste into SQL Editor
6. Click "Run"

**Method B: Supabase CLI**
```bash
# If using local Supabase
supabase db reset

# Or apply specific migration
supabase migration up
```

**Method C: Direct SQL Execution**
If you have database access, you can execute the migration SQL directly via `psql` or your database client.

## What the Migration Does

The migration (`20260115000000_reset_and_backfill_to_latest_match.sql`) performs:

1. **Finds the most recent completed match** from the fixtures table
2. **Deletes all trading data:**
   - Match ledger entries (`total_ledger` with match types)
   - Transfer ledger entries (`transfers_ledger`)
   - Wallet transactions (`wallet_transactions`)
   - Orders (`orders`)
   - Positions (`positions`)

3. **Resets user wallets** to 0

4. **Resets all teams** to initial state:
   - Market cap: $5,000.00 (500000 cents)
   - Total shares: 1000
   - Available shares: 1000
   - Launch price: $5.00 (500 cents)

5. **Clears fixture snapshots** (will be recaptured during processing)

6. **Processes all matches chronologically:**
   - For each completed match (in order by kickoff time)
   - Captures market cap snapshots
   - Processes match result using `process_match_result_atomic()`
   - Updates team market caps

7. **Verifies perfect conservation:**
   - Checks that total market cap remains exactly $100,000
   - Reports any drift (should be 0 cents)

## Verification

After running the migration, verify:

1. **Total Market Cap:** Should be exactly $100,000 (10,000,000 cents)
   ```sql
   SELECT SUM(market_cap) / 100.0 as total_market_cap_dollars
   FROM teams;
   ```

2. **Match Processing:** Check that matches were processed
   ```sql
   SELECT COUNT(*) as processed_matches
   FROM total_ledger
   WHERE ledger_type IN ('match_win', 'match_loss', 'match_draw');
   ```

3. **Latest Match:** Verify the latest match was processed
   ```sql
   SELECT MAX(kickoff_at) as latest_processed_match
   FROM fixtures
   WHERE snapshot_home_cap IS NOT NULL
     AND snapshot_away_cap IS NOT NULL;
   ```

## Important Notes

- **Fixed-Point Arithmetic:** All calculations use BIGINT (cents) for perfect precision
- **Perfect Conservation:** Total market cap should remain exactly $100,000 throughout
- **Chronological Processing:** Matches are processed in order by kickoff time
- **Idempotent:** The migration can be run multiple times safely (it resets first)

## Troubleshooting

### "No completed matches found"

If you see this message, it means:
- No fixtures have scores yet
- Matches haven't been played
- Fixtures haven't been synced from the API

**Solution:** Run `npm run sync-fixtures` first to fetch the latest match data.

### "exec_sql not available"

If the script can't execute SQL directly:
- The migration file is ready in `supabase/migrations/`
- Apply it manually via Supabase Dashboard SQL Editor
- Or use Supabase CLI: `supabase migration up`

### Market Cap Drift

If you see a conservation warning:
- Check the migration logs for which match caused the issue
- Verify that `process_match_result_atomic()` function is using the latest version
- The migration should enforce perfect conservation (0 cents drift)

## Files

- **Migration:** `supabase/migrations/20260115000000_reset_and_backfill_to_latest_match.sql`
- **Script:** `scripts/reset-and-backfill.ts`
- **Sync Script:** `scripts/sync-and-process-matches.ts`

## Related Functions

- `process_match_result_atomic(fixture_id)` - Processes a single match result
- `syncPremierLeagueFixtures(season)` - Syncs fixtures from Football API
