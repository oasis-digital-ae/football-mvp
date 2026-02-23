# Netlify Environment Variables Setup

## ⚠️ Critical Issue Fixed

The weekly leaderboard cron was failing with:
```
Error: supabaseUrl is required.
```

This was because the environment variables weren't properly configured in Netlify.

---

## ✅ Changes Made

### 1. Updated `update-weeklyleaderboard.ts`
- Added helper function to support multiple environment variable naming conventions
- Now checks for: `VITE_SUPABASE_URL`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`
- Now checks for: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`
- Added proper error handling if variables are missing

### 2. Updated `netlify.toml`
- Changed Node.js version from 18 to 20
- This fixes the Node.js deprecation warning

---

## 🔧 Required: Set Up Environment Variables in Netlify

You MUST configure these environment variables in your Netlify dashboard:

### Step 1: Go to Netlify Dashboard

1. Go to your site: https://app.netlify.com/sites/[your-site-name]
2. Navigate to: **Site configuration** → **Environment variables**

### Step 2: Add Required Variables

Add these environment variables (use ANY of these naming conventions):

#### Option 1: Standard Naming (Recommended)
```
SUPABASE_URL = your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY = your_service_role_key_here
```

#### Option 2: Vite Naming
```
VITE_SUPABASE_URL = your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY = your_service_role_key_here
```

#### Option 3: Next.js Naming
```
NEXT_PUBLIC_SUPABASE_URL = your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY = your_service_role_key_here
```

### Step 3: Get Your Values

#### Get Supabase URL:
1. Go to your Supabase Dashboard
2. Click on your project
3. Go to **Settings** → **API**
4. Copy the **Project URL**
5. Example: `https://abcdefghijklmnop.supabase.co`

#### Get Service Role Key:
1. Same page (**Settings** → **API**)
2. Scroll to **Project API keys**
3. Copy the **service_role** key (NOT the anon key!)
4. ⚠️ **IMPORTANT**: This is a SECRET key - never expose it publicly

### Step 4: Configure in Netlify

For each variable:
1. Click **Add a variable** or **Add a single variable**
2. **Key**: Enter the variable name (e.g., `SUPABASE_URL`)
3. **Value**: Paste your value
4. **Scopes**: Select **All** (or at minimum: **Functions**)
5. Click **Create variable**

---

## 🧪 Testing After Setup

### Test 1: Manual Trigger

After setting up the environment variables and deploying:

```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/update-weeklyleaderboard \
  -H "x-manual-run: true"
```

Expected response: `200 OK` with message about leaderboard generation

### Test 2: Check Function Logs

1. Go to Netlify Dashboard → **Functions**
2. Click on `update-weeklyleaderboard`
3. Check recent invocations
4. Should see: "✅ Weekly leaderboard generated" (not errors)

### Test 3: Verify Cron Schedule

1. In Netlify Dashboard → **Functions**
2. Look for **Scheduled functions** section
3. Verify `update-weeklyleaderboard` shows schedule: `0 23 * * 0`
4. Next run time should be: Sunday 23:00 UTC (Monday 3:00 AM UAE)

---

## 🚨 Common Issues & Solutions

### Issue: Cron never runs / doesn't trigger
**Solution**: Netlify scheduled functions **only run on PRODUCTION (published) deploys**.
- They do NOT run on branch deploys (e.g. staging-test, develop)
- They do NOT run on Deploy Previews
- **Fix**: Merge to `main` and ensure your production site is the published deploy
- Use the **"Run now"** button in Netlify Dashboard → Functions → update-weeklyleaderboard to test on branch deploys

### Issue: "supabaseUrl is required"
**Solution**: Environment variables not set in Netlify
- Go to Netlify Dashboard → Environment variables
- Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Redeploy

### Issue: "Forbidden" response
**Solution**: Function requires either cron trigger or manual header
- For manual testing, include header: `-H "x-manual-run: true"`
- Or wait for scheduled cron to run

### Issue: Node.js 18 deprecation warning
**Solution**: Already fixed!
- Updated `netlify.toml` to use Node.js 20
- Will take effect on next deployment

### Issue: Function times out
**Solution**: 
- Check Supabase function is properly deployed
- Check for large dataset issues
- Review function logs for specific errors

---

## 📋 Deployment Checklist

Before deploying, ensure:

- [ ] Environment variables are set in Netlify dashboard
- [ ] Both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured
- [ ] Variables are scoped to at least "Functions"
- [ ] SQL function has been deployed to Supabase (from previous steps)
- [ ] Code changes have been committed and pushed

After deploying:

- [ ] Check Netlify build logs for success
- [ ] Test function manually with curl
- [ ] Verify cron schedule is updated to `0 23 * * 0`
- [ ] Check function logs for any errors
- [ ] Wait for next scheduled run (Monday 3:00 AM UAE)

---

## 🎯 Expected Behavior

After everything is set up correctly:

1. **Every Monday 3:00 AM UAE** (Sunday 23:00 UTC):
   - Cron triggers the function automatically
   - Function calculates previous week (Monday 03:00 to Monday 02:59)
   - Inserts new leaderboard entries with `is_latest = true`
   - Marks previous entries as `is_latest = false`

2. **Function logs should show**:
   ```
   🚀 Weekly Leaderboard Job Started
   📅 Processing week:
     Week start (UTC): 2026-02-03T23:00:00.000Z
     Week end   (UTC): 2026-02-10T22:59:00.000Z
   ✅ Weekly leaderboard generated (X users)
   ```

3. **Database records**:
   - New entries in `weekly_leaderboard` table
   - `week_start` at Monday 03:00 UAE time
   - `week_end` at next Monday 02:59 UAE time
   - Only current week has `is_latest = true`

---

## 🔐 Security Notes

- **NEVER** commit the service role key to git
- **NEVER** expose it in client-side code
- Only use it in server-side functions
- Keep it in Netlify environment variables only
- Rotate the key if it's ever exposed

---

## 📞 Still Having Issues?

If the cron still fails after following this guide:

1. **Check Netlify Function Logs**:
   - Go to Functions → update-weeklyleaderboard
   - Look for specific error messages

2. **Check Supabase Logs**:
   - Go to Supabase Dashboard → Logs
   - Filter for errors during the cron run time

3. **Verify Environment Variables**:
   - Go to Netlify → Environment variables
   - Click "Reveal values" to verify they're correct
   - Make sure there are no extra spaces or quotes

4. **Manual Test**:
   - Use the curl command above
   - Check the response for specific error details

5. **Check SQL Function**:
   - Run the query from the previous migration
   - Test it manually in Supabase SQL editor
