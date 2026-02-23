# Quick Start Guide - Weekly Leaderboard Timing Update

## 🎯 What Changed?

Weekly leaderboard now runs:
- **Monday 3:00 AM UAE** (start of week)
- **Next Monday 2:59 AM UAE** (end of week)
- **Cron trigger**: Sunday 11:00 PM UTC = Monday 3:00 AM UAE

---

## 🚀 Immediate Actions Required

### 0. Set Up Netlify Environment Variables (CRITICAL - DO THIS FIRST!)

**The cron failed because environment variables weren't set!**

Go to Netlify Dashboard → Your Site → Site configuration → Environment variables

Add these variables:
```
SUPABASE_URL = your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY = your_service_role_key
```

**Where to find these values:**
- Supabase Dashboard → Settings → API
- Project URL: Copy the "Project URL"
- Service Role Key: Copy the "service_role" key (NOT anon key!)

**Important**: Set scope to "All" or at minimum "Functions"

📖 **Detailed guide**: See `NETLIFY_ENV_SETUP.md`

### 1. Deploy SQL Function to Supabase (CRITICAL)

Open your Supabase SQL Editor and run:

```sql
-- Copy the contents from:
-- supabase/migrations/update_weekly_leaderboard_function.sql
-- and execute it in Supabase SQL Editor
```

Or use Supabase CLI:
```bash
supabase db push
```

### 2. Deploy to Netlify

```bash
# Commit and push changes
git add .
git commit -m "Update weekly leaderboard timing to Monday 3:00 AM UAE"
git push origin main
```

Netlify will automatically:
- ✅ Deploy the updated function
- ✅ Update the cron schedule to `0 23 * * 0`
- ✅ Next run: Sunday 23:00 UTC (Monday 3:00 AM UAE)

---

## 📋 Files Modified

1. ✅ `netlify.toml` - Cron schedule updated to `0 23 * * 0`
2. ✅ `netlify/functions/update-weeklyleaderboard.ts` - Week boundaries updated to 03:00-02:59
3. ✅ `scripts/calculate-weekly-leaderboard.ts` - Backfill script updated
4. ✅ `supabase/migrations/update_weekly_leaderboard_function.sql` - New SQL function created

---

## 🧪 Testing

### Manual Test (After Deployment)

Trigger the function manually:
```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/update-weeklyleaderboard \
  -H "x-manual-run: true"
```

### Check Netlify Logs

1. Go to Netlify Dashboard → Functions
2. Click on `update-weeklyleaderboard`
3. Check execution logs for any errors

### Verify Database

```sql
-- Check the latest leaderboard entries
SELECT 
  week_start AT TIME ZONE 'Asia/Dubai' as uae_start,
  week_end AT TIME ZONE 'Asia/Dubai' as uae_end,
  is_latest,
  COUNT(*) as users
FROM weekly_leaderboard
WHERE is_latest = true
GROUP BY week_start, week_end, is_latest;
```

Expected: `uae_start` shows Monday 03:00:00, `uae_end` shows Monday 02:59:00

---

## ⚠️ Important Notes

### Current Week Handling
- When the cron runs Monday 3:00 AM, it processes the PREVIOUS week
- The week that just ended (Monday 03:00 to Monday 02:59)
- Previous `is_latest` entries are automatically marked false

### If Current Data Needs Updating
If you have entries marked as `is_latest` with the old timing, you need to:

1. Mark them as not latest:
```sql
UPDATE weekly_leaderboard 
SET is_latest = false 
WHERE is_latest = true;
```

2. Run the backfill script for the current week:
```bash
npx tsx scripts/calculate-weekly-leaderboard.ts
```

This will create new entries with the correct timing.

---

## 📞 Troubleshooting

### Issue: Cron not running at new time
- Check Netlify dashboard shows `0 23 * * 0`
- Redeploy if needed
- May take up to next scheduled run to take effect

### Issue: Duplicate entries
- Function has duplicate check built-in
- Won't create entries if week already exists

### Issue: Wrong time boundaries in database
- Verify SQL function was deployed to Supabase
- Run the migration file again if needed

### Issue: is_latest flag not updating
- Check Netlify function logs
- Ensure the update query runs after insert

---

## ✅ Success Criteria

After deployment and first run, you should see:
1. ✅ Cron schedule shows `0 23 * * 0` in Netlify
2. ✅ Database has entries with `week_start` at Monday 03:00 UAE time
3. ✅ Only current week entries have `is_latest = true`
4. ✅ Frontend displays "Monday 3:00 AM to Monday 2:59 AM (UAE)"
5. ✅ No duplicate leaderboard entries

---

For detailed information, see: `WEEKLY_LEADERBOARD_TIMING_UPDATE.md`
