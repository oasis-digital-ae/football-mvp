# Weekly Leaderboard Timing Update - Implementation Guide

## Summary of Changes

The weekly leaderboard schedule has been updated from:
- **OLD:** Monday 00:00 UAE to next Monday 00:00 UAE
- **NEW:** Monday 03:00 UAE to next Monday 02:59 UAE

This document outlines all changes made to support this new timing.

---

## 1. Cron Schedule Update

### File: `netlify.toml`

**Changed from:**
```toml
[functions."update-weeklyleaderboard"]
  schedule = "0 20 * * 0" # Sunday at 20:00 UTC = Monday 00:00 UAE
```

**Changed to:**
```toml
[functions."update-weeklyleaderboard"]
  schedule = "0 23 * * 0" # Sunday at 23:00 UTC = Monday 03:00 UAE
```

**Explanation:**
- The cron now runs at 23:00 UTC on Sunday nights
- This corresponds to Monday 03:00 AM in UAE (UTC+4)
- The job will process the COMPLETED week (previous Monday 03:00 to current Monday 02:59)

---

## 2. Netlify Function Update

### File: `netlify/functions/update-weeklyleaderboard.ts`

**Key changes:**

1. **Updated comments** to reflect new timing:
   - Job runs at Monday 03:00 UAE
   - Week definition: Monday 03:00 → next Monday 02:59

2. **Updated `getCompletedUAEWeekBounds()` function:**
   ```typescript
   // Monday 03:00 UAE
   weekStartUAE.setUTCHours(3, 0, 0, 0);
   
   // Next Monday 02:59 UAE (exactly 7 days minus 1 minute)
   weekEndUAE.setUTCHours(2, 59, 0, 0);
   ```

**What this does:**
- Calculates the previous completed week boundaries
- Converts UAE time to UTC before storing in the database
- Week start: Monday 03:00 UAE (stored as UTC in DB)
- Week end: Next Monday 02:59 UAE (stored as UTC in DB)

---

## 3. Backfill Script Update

### File: `scripts/calculate-weekly-leaderboard.ts`

**Updated `getUAEWeekBounds()` function:**
```typescript
// Monday 03:00 UAE
weekStartUAE.setUTCHours(3, 0, 0, 0);

// Next Monday 02:59 UAE
weekEndUAE.setUTCHours(2, 59, 0, 0);
```

**Usage:**
```bash
# Backfill current week only
npx tsx scripts/calculate-weekly-leaderboard.ts

# Backfill last 4 weeks
npx tsx scripts/calculate-weekly-leaderboard.ts --weeks 4
```

---

## 4. Database Function Update

### File: `supabase/migrations/update_weekly_leaderboard_function.sql`

The SQL function `new_generate_weekly_leaderboard` has been updated with:

1. **Updated comments** to reflect the new timing
2. **Time boundary logic** that correctly filters:
   - Orders before Monday 03:00 UAE (start of week)
   - Deposits between Monday 03:00 and next Monday 02:59 UAE
   - Wallet transactions before Monday 03:00 UAE

**To apply this migration:**
```sql
-- Run this in your Supabase SQL editor or via migration
-- This will update the function to use the correct time boundaries
```

---

## 5. Frontend Display (Already Correct)

### File: `src/features/admin/components/WeeklyLeaderboardPanel.tsx`

The frontend already displays the correct timing in the badge:
```tsx
// Force UAE display cycle
start.setHours(3, 0, 0, 0);
end.setHours(2, 59, 0, 0);
```

This shows: "Monday 3:00 AM to next Monday 2:59 AM (UAE)"

---

## Implementation Checklist

### ✅ Step 0: Fix Netlify Environment Variables (CRITICAL!)
**The cron was failing because of missing environment variables!**

- [x] Updated function to support multiple env variable naming conventions
- [x] Updated Node.js version from 18 to 20
- [ ] **ACTION REQUIRED**: Set environment variables in Netlify Dashboard
  - Go to: Site configuration → Environment variables
  - Add: `SUPABASE_URL` (from Supabase Settings → API → Project URL)
  - Add: `SUPABASE_SERVICE_ROLE_KEY` (from Supabase Settings → API → service_role key)
  - See `NETLIFY_ENV_SETUP.md` for detailed instructions

### ✅ Step 1: Update Netlify Configuration
- [x] Updated `netlify.toml` cron schedule to `0 23 * * 0`

### ✅ Step 2: Update Netlify Function
- [x] Modified `update-weeklyleaderboard.ts` to use 03:00-02:59 timing

### ✅ Step 3: Update Backfill Script
- [x] Modified `calculate-weekly-leaderboard.ts` to match new timing

### ✅ Step 4: Update Database Function
- [x] Created SQL migration file with updated function

### ⚠️ Step 5: Deploy to Supabase (ACTION REQUIRED)
You need to run the SQL migration in Supabase:

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Open the file: `supabase/migrations/update_weekly_leaderboard_function.sql`
4. Execute the SQL to update the function

### ⚠️ Step 6: Deploy to Netlify (ACTION REQUIRED)
After committing these changes:

1. Push to your repository
2. Netlify will automatically deploy the updated function
3. The new cron schedule will take effect immediately

---

## Testing the Changes

### Test the Function Manually

You can trigger the function manually to test it:

```bash
# Call the Netlify function with a manual trigger
curl -X POST https://your-netlify-site.netlify.app/.netlify/functions/update-weeklyleaderboard \
  -H "x-manual-run: true"
```

### Verify the Cron Schedule

After deployment, check Netlify dashboard:
1. Go to Functions → Scheduled functions
2. Verify `update-weeklyleaderboard` shows: `0 23 * * 0`
3. Next run should be: Sunday 23:00 UTC (Monday 03:00 UAE)

### Check Database Records

After the next scheduled run:
```sql
-- Check latest leaderboard entries
SELECT 
  week_start AT TIME ZONE 'Asia/Dubai' as week_start_uae,
  week_end AT TIME ZONE 'Asia/Dubai' as week_end_uae,
  is_latest,
  COUNT(*) as user_count
FROM weekly_leaderboard
WHERE is_latest = true
GROUP BY week_start, week_end, is_latest;
```

Expected result:
- `week_start_uae`: Monday at 03:00:00
- `week_end_uae`: Next Monday at 02:59:00
- `is_latest`: true for current week entries

---

## Important Notes

### Time Zone Handling
- All timestamps are stored in UTC in the database
- Conversion to UAE time (UTC+4) happens in the application layer
- The cron runs on Sunday 23:00 UTC = Monday 03:00 UAE

### is_latest Flag
- Only the current week's entries have `is_latest = true`
- When a new week is processed, previous entries are marked `is_latest = false`
- This happens automatically in the Netlify function

### Data Consistency
- The function checks for existing entries before inserting
- Prevents duplicate leaderboard entries for the same week
- Uses `week_start` and `week_end` ranges for duplicate detection

---

## Rollback Plan

If you need to revert to the old timing:

1. Change `netlify.toml` back to `schedule = "0 20 * * 0"`
2. Update time hours back to `0, 0, 0, 0` in both TypeScript files
3. Restore the original SQL function
4. Redeploy

---

## Contact & Support

If you encounter any issues:
1. Check Netlify function logs
2. Check Supabase logs for SQL errors
3. Verify timezone conversions are correct
4. Ensure the SQL function has been deployed
