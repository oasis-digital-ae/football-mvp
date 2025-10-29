# Pre-Deployment Checklist - Stripe Wallet Integration

## ✅ Before Pushing to Production

### 1. Database Migrations (CRITICAL)

**Must be done in Supabase Dashboard before testing:**

- [X] Run `20251029121000_wallet_balance_and_deposits.sql`
- [X] Run `20251029121500_wallet_transactions_and_credit_rpc.sql`
- [X] Run `20251029122000_add_wallet_check_to_purchase.sql`
- [X] Run `20251029114000_fix_total_ledger_descriptions.sql`

**How to verify:**

```sql
-- Run in Supabase SQL Editor
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'wallet_balance';

SELECT routine_name FROM information_schema.routines 
WHERE routine_name = 'credit_wallet';
```

### 2. Netlify Environment Variables (CRITICAL)

**Set these in Netlify Dashboard → Site Settings → Environment variables:**

- [ ] `VITE_STRIPE_PUBLISHABLE_KEY` = `pk_test_...`
- [ ] `STRIPE_SECRET_KEY` = `sk_test_...`
- [ ] `STRIPE_WEBHOOK_SECRET` = `whsec_...` (from Step 3)
- [ ] `SUPABASE_URL` = `https://your-project.supabase.co`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = `your_service_role_key`
- [ ] `SITE_URL` = `https://ace-mvp.netlify.app`
- [ ] `VITE_SUPABASE_ANON_KEY` = `your_anon_key`
- [ ] `VITE_SUPABASE_URL` = `https://your-project.supabase.co`

### 3. Stripe Production Webhook Setup (CRITICAL)

**Before testing deposits, set up webhook:**

- [ ] Go to: https://dashboard.stripe.com/test/webhooks
- [ ] Click "Add endpoint"
- [ ] Endpoint URL: `https://ace-mvp.netlify.app/.netlify/functions/stripe-webhook`
- [ ] Select events:
  - [X] `payment_intent.succeeded`
  - [X] `payment_intent.payment_failed` (optional)
  - [X] `charge.refunded` (optional)
  - [X] `charge.dispute.created` (optional)
- [ ] Click "Add endpoint"
- [ ] Copy the webhook signing secret (`whsec_...`)
- [ ] Add to Netlify: `STRIPE_WEBHOOK_SECRET` = `whsec_...`
- [ ] Trigger redeploy or wait for next Git push

### 4. Push Code to Git

```bash
git add .
git commit -m "Add Stripe wallet integration and deposit functionality"
git push origin main
```

### 5. Wait for Netlify Build

- [ ] Check Netlify Dashboard → Deploys
- [ ] Wait for build to complete successfully
- [ ] Verify no build errors

---

## 🧪 Testing on Production

### Test 1: Deposit Flow

1. Go to: https://ace-mvp.netlify.app
2. Login to your account
3. Click "Deposit" button (top navigation)
4. Enter amount ($10+)
5. Click "Continue to Payment"
6. Use test card: `4242 4242 4242 4242`
   - Expiry: `12/25`
   - CVC: `123`
   - ZIP: `12345`
7. Complete payment
8. **Check:**
   - Wallet balance updates in navigation bar
   - Redirect happens successfully
   - Check Stripe Dashboard → Payments → should show test payment

### Test 2: Purchase Flow

1. Go to Marketplace
2. Click "Buy" on any team
3. **Check:** Modal shows your wallet balance
4. Enter share quantity that exceeds balance
5. **Check:** "Insufficient Balance" warning appears
6. Enter share quantity within balance
7. Click "Confirm Purchase"
8. **Check:**
   - Purchase succeeds
   - Wallet balance decreases
   - Shares appear in portfolio

### Test 3: Webhook Verification

1. Go to Stripe Dashboard → Webhooks
2. Click on your webhook endpoint
3. Check "Events" tab
4. **Verify:**
   - `payment_intent.succeeded` events are being received
   - Status is "Succeeded" (green)
   - No red errors

---

## 🔍 Troubleshooting Production Issues

### Issue: Deposits not crediting balance

**Check:**

1. Stripe Dashboard → Webhooks → Events
   - Are events being received?
   - Are they successful (200 status)?
2. Netlify Functions logs:
   - Netlify Dashboard → Functions → View logs
   - Look for webhook errors
3. Supabase logs:
   - Dashboard → Logs → Database
   - Check for `credit_wallet` function errors
4. Environment variables:
   - Verify `STRIPE_WEBHOOK_SECRET` is set correctly
   - Verify `SUPABASE_SERVICE_ROLE_KEY` is set

### Issue: "Insufficient balance" even after deposit

**Check:**

1. Database: Query `profiles` table to see `wallet_balance`
2. Webhook delivery: Check Stripe Dashboard → Webhooks → Events
3. Function logs: Check Netlify Functions logs for webhook errors

### Issue: Function returns 500 error

**Check:**

1. Netlify Functions logs
2. Environment variables are all set
3. Stripe keys are correct (test vs live)

---

## 📝 Post-Deployment Verification

Run these SQL queries in Supabase to verify:

```sql
-- Check wallet balances exist
SELECT id, username, wallet_balance FROM profiles LIMIT 5;

-- Check wallet transactions are being created
SELECT * FROM wallet_transactions ORDER BY created_at DESC LIMIT 5;

-- Check stripe events are being logged
SELECT * FROM stripe_events ORDER BY created_at DESC LIMIT 5;
```

---

## 🚨 Important Notes

1. **Test Mode**: You're using Stripe test keys - all payments are test payments
2. **Webhook Delay**: Balance updates may take 1-2 seconds after payment
3. **Service Role Key**: Required for webhook to update balances (bypasses RLS)
4. **RLS Policies**: Wallet transactions have RLS - users can only see their own

---

## Next: When Ready for Live Payments

1. Switch Stripe Dashboard to Live mode
2. Get live API keys (pk_live_... and sk_live_...)
3. Create new webhook endpoint for live mode
4. Update Netlify environment variables
5. Test with real card (small amount)
