# Troubleshooting Stripe Integration

## Common Errors

### Error: "Server error: 500"

This usually means one of the following:

#### 1. Netlify Functions Not Running

**Problem**: When running `npm run dev`, Netlify functions don't start automatically.

**Solution**: Run Netlify dev instead:
```bash
netlify dev
```

This will:
- Start Vite dev server on port 5173
- Start Netlify functions on port 8888
- Proxy function requests automatically

#### 2. Missing Environment Variables

**Problem**: Netlify functions can't access environment variables from `.env` file.

**Solution**: 

**For Local Development:**
- Create a `.env` file in the project root
- Netlify dev automatically loads `.env` file
- Make sure variables are named correctly (without `VITE_` prefix for functions)

**For Production:**
- Set environment variables in Netlify Dashboard
- Go to: Site Settings → Environment Variables
- Add all required variables

#### 3. Missing Stripe Keys

**Problem**: The function can't find the Stripe secret key.

**Check:**
- `.env` file has `STRIPE_SECRET_KEY` (for development)
- Netlify Dashboard has `STRIPE_SECRET_KEY_LIVE` (for production)
- Keys are not prefixed with `VITE_` (functions can't access `VITE_` prefixed vars)

#### 4. Wrong Environment Detection

**Problem**: Code thinks it's production when it's development (or vice versa).

**Check logs**: The function logs which environment it detected:
```
Environment detection: { NETLIFY_ENV: undefined, CONTEXT: undefined, NODE_ENV: 'development', isProduction: false }
Using TEST Stripe keys
```

## How to Debug

### Step 1: Check Function Logs

When running `netlify dev`, check the terminal output for:
- Environment detection logs
- Stripe key availability
- Error messages

### Step 2: Test Function Directly

```bash
# Start Netlify dev
netlify dev

# In another terminal, test the function
curl -X POST http://localhost:8888/.netlify/functions/create-payment-intent \
  -H "Content-Type: application/json" \
  -d '{"deposit_amount_cents": 10000, "user_id": "test-user-id", "currency": "usd"}'
```

### Step 3: Check Environment Variables

The function logs which variables are available:
```
Available env vars: { hasTestKey: true, hasLiveKey: true }
```

## Required Environment Variables

### For Development (`.env` file):
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### For Production (Netlify Dashboard):
```
STRIPE_SECRET_KEY_LIVE=sk_live_...
STRIPE_WEBHOOK_SECRET_LIVE=whsec_...
VITE_STRIPE_PUBLISHABLE_KEY_LIVE=pk_live_...
```

## Quick Fixes

### Fix 1: Use Netlify Dev
```bash
# Stop current dev server (Ctrl+C)
# Start Netlify dev
netlify dev
```

### Fix 2: Check .env File Location
- `.env` file must be in project root (same level as `package.json`)
- Not in `netlify/` or `src/` directories

### Fix 3: Verify Variable Names
- Functions use: `STRIPE_SECRET_KEY` (no `VITE_` prefix)
- Frontend uses: `VITE_STRIPE_PUBLISHABLE_KEY` (with `VITE_` prefix)

### Fix 4: Restart Dev Server
After changing `.env` file:
1. Stop the dev server (Ctrl+C)
2. Start again: `netlify dev`

## Still Not Working?

1. **Check Netlify CLI is installed**: `netlify --version`
2. **Check function exists**: `ls netlify/functions/create-payment-intent.ts`
3. **Check logs**: Look for error messages in terminal
4. **Test with curl**: Use the curl command above to test directly
