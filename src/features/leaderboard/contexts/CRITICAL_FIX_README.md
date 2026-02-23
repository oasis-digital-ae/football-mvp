# 🚨 CRITICAL FIX: Weekly Leaderboard Cron Failure

## Problem Summary

Your weekly leaderboard cron job failed on **Sunday, Feb 9, 2026** with this error:
```
Error: supabaseUrl is required.
```

**Root Cause**: Environment variables were not configured in Netlify.

---

## ✅ What Was Fixed

### 1. Updated Netlify Function (`update-weeklyleaderboard.ts`)
- Added environment variable fallback logic
- Now supports multiple naming conventions (VITE_, NEXT_PUBLIC_, standard)
- Added proper error handling
- Same pattern as your working `update-matches.ts` function

### 2. Updated Node.js Version (`netlify.toml`)
- Changed from Node.js 18 → Node.js 20
- Fixes deprecation warnings

### 3. Updated Timing (as per your original request)
- Week now runs: Monday 3:00 AM → Monday 2:59 AM UAE
- Cron schedule: `0 23 * * 0` (Sunday 11:00 PM UTC)

---

## 🚀 IMMEDIATE ACTION REQUIRED

### Step 1: Set Environment Variables in Netlify (DO THIS NOW!)

This is the MOST IMPORTANT step - the cron won't work without this!

1. **Go to Netlify Dashboard**
   - Navigate to: https://app.netlify.com/sites/[your-site-name]
   - Click: **Site configuration** → **Environment variables**

2. **Add Two Variables**:

   **Variable 1: SUPABASE_URL**
   - Click "Add a variable"
   - Key: `SUPABASE_URL`
   - Value: Your Supabase project URL
     - Get it from: Supabase Dashboard → Settings → API → Project URL
     - Format: `https://xxxxx.supabase.co`
   - Scopes: Select **All** (or minimum: **Functions**)
   - Click "Create variable"

   **Variable 2: SUPABASE_SERVICE_ROLE_KEY**
   - Click "Add a variable"
   - Key: `SUPABASE_SERVICE_ROLE_KEY`
   - Value: Your Supabase service role key
     - Get it from: Supabase Dashboard → Settings → API → **service_role** key
     - ⚠️ **NOT** the anon key - use the service_role key!
   - Scopes: Select **All** (or minimum: **Functions**)
   - Click "Create variable"

3. **Verify Variables**
   - You should now see both variables listed
   - Click "Reveal values" to double-check they're correct

### Step 2: Deploy SQL Function to Supabase

1. Open Supabase SQL Editor
2. Copy the contents of: `supabase/migrations/update_weekly_leaderboard_function.sql`
3. Run it in the SQL Editor

### Step 3: Deploy to Netlify

```bash
git add .
git commit -m "Fix: Update weekly leaderboard timing and environment variables"
git push origin main
```

Netlify will automatically:
- ✅ Rebuild with Node.js 20
- ✅ Deploy updated function
- ✅ Apply new cron schedule

---

## 🧪 Test the Fix

### Test 1: Local Environment Check (Optional)

```bash
node scripts/test-netlify-env.js
```

This will verify your local environment variables are set correctly.

### Test 2: Manual Trigger (After Deployment)

```bash
curl -X POST https://staging-ace.netlify.app/.netlify/functions/update-weeklyleaderboard \
  -H "x-manual-run: true"
```

**Expected**: `200 OK` with success message

**If you get an error**: Check the Netlify function logs

### Test 3: Check Netlify Function Logs

1. Go to: Netlify Dashboard → **Functions**
2. Click: `update-weeklyleaderboard`
3. Check the most recent invocation
4. Should see: "✅ Weekly leaderboard generated"

---

## 📅 Next Scheduled Run

After deployment:
- **Next run**: Sunday, Feb 16, 2026 at 11:00 PM UTC
- **That's**: Monday, Feb 17, 2026 at 3:00 AM UAE
- **Will process**: Week of Feb 10, 3:00 AM → Feb 17, 2:59 AM

---

## ✅ Success Checklist

- [ ] Environment variables added to Netlify (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
- [ ] Variables scoped to "Functions" or "All"
- [ ] SQL function deployed to Supabase
- [ ] Code committed and pushed to repository
- [ ] Netlify build completed successfully
- [ ] Manual test returned 200 OK
- [ ] Function logs show no errors
- [ ] Cron schedule shows `0 23 * * 0` in Netlify

---

## 📖 Detailed Guides

- **Environment Setup**: `NETLIFY_ENV_SETUP.md`
- **Timing Changes**: `WEEKLY_LEADERBOARD_TIMING_UPDATE.md`
- **Quick Reference**: `QUICKSTART_TIMING_UPDATE.md`

---

## 🔍 Troubleshooting

### Still getting "supabaseUrl is required"?
- ✅ Verify environment variables are set in **Netlify** (not just local .env)
- ✅ Check variable names are exactly: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- ✅ Verify scope is set to "Functions" or "All"
- ✅ Redeploy after adding variables

### Getting "Forbidden" error?
- ✅ For manual testing, include header: `-H "x-manual-run: true"`
- ✅ Or just wait for the scheduled cron

### Function times out?
- ✅ Check SQL function is deployed in Supabase
- ✅ Check Supabase logs for errors
- ✅ Verify database has data to process

---

## 🎯 Why This Happened

**The Issue**: 
- Netlify Functions run in an isolated environment
- They don't have access to your local `.env` file
- Environment variables MUST be configured in the Netlify Dashboard
- Your `update-matches.ts` function had the fallback logic, but `update-weeklyleaderboard.ts` didn't

**The Fix**:
- Added the same fallback logic to `update-weeklyleaderboard.ts`
- Updated to Node.js 20 (recommended by Supabase)
- Created clear documentation for setup

---

## 📞 Need Help?

If you still have issues after following these steps:

1. **Check Netlify Logs**: Functions → update-weeklyleaderboard → Recent invocations
2. **Check Supabase Logs**: Dashboard → Logs → Filter by time of cron run
3. **Run Local Test**: `node scripts/test-netlify-env.js`
4. **Verify Variables**: Netlify Dashboard → Environment variables → Reveal values

The most common issue is forgetting to set the variables in Netlify itself!

---

## ⏰ Timeline

- **Feb 9, 2026 12:01 AM**: Cron failed (missing env vars)
- **Now**: Fixed the code
- **Next**: You need to set the env vars in Netlify
- **Feb 16, 2026 3:00 AM UAE**: Next scheduled run (will succeed!)
