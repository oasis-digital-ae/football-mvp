# Stripe Webhook Setup Guide

## Problem
Payments are succeeding in Stripe but wallets aren't being credited automatically. This means the webhook isn't being called or isn't processing correctly.

## Solution: Configure Stripe Webhook Endpoint

### Step 1: Get Your Webhook URL

**For Production (Netlify):**
```
https://your-site.netlify.app/.netlify/functions/stripe-webhook
```

**For Local Development:**
```
https://your-ngrok-url.ngrok.io/.netlify/functions/stripe-webhook
```
(Use `ngrok` or similar tool to expose your local Netlify dev server)

### Step 2: Configure Webhook in Stripe Dashboard

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → **Developers** → **Webhooks**
2. Click **"Add endpoint"**
3. Enter your webhook URL (from Step 1)
4. Select events to listen for:
   - ✅ `payment_intent.succeeded`
5. Click **"Add endpoint"**

### Step 3: Get Webhook Signing Secret

1. After creating the endpoint, click on it
2. Click **"Reveal"** next to "Signing secret"
3. Copy the secret (starts with `whsec_`)
4. Add it to your environment variables:
   - For production: `STRIPE_WEBHOOK_SECRET_LIVE=whsec_...`
   - For development: `STRIPE_WEBHOOK_SECRET=whsec_...`

### Step 4: Verify Webhook is Working

1. In Stripe Dashboard → Webhooks → Your endpoint
2. Click **"Send test webhook"**
3. Select `payment_intent.succeeded`
4. Check your Netlify function logs to see if it was received

## Troubleshooting

### Webhook Not Receiving Events

**Check:**
1. ✅ Webhook URL is correct and accessible
2. ✅ Webhook endpoint is enabled in Stripe
3. ✅ Correct events are selected (`payment_intent.succeeded`)
4. ✅ Webhook secret matches in environment variables

**Test:**
- Use Stripe CLI: `stripe listen --forward-to http://localhost:8888/.netlify/functions/stripe-webhook`
- Check Netlify function logs for errors

### Webhook Receiving Events But Failing

**Common Issues:**
1. **Missing metadata**: Payment intent must have `user_id` and `deposit_amount_cents` in metadata
2. **Wrong environment keys**: Webhook using test keys but payment used live keys (or vice versa)
3. **Database errors**: Check Supabase logs for `credit_wallet` function errors

**Check Logs:**
- Netlify function logs: `netlify functions:log stripe-webhook`
- Supabase logs: Check for `credit_wallet` errors

### Manual Credit (Fallback)

If webhook fails, you can manually credit using the `manual-credit-wallet` function:

```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/manual-credit-wallet \
  -H "Content-Type: application/json" \
  -d '{
    "payment_intent_id": "pi_xxx",
    "user_id": "user-uuid"
  }'
```

Or use the automatic fallback in `DepositModal.tsx` which will try manual credit if webhook doesn't process within 3 seconds.

## Environment Variables Required

```bash
# Stripe Keys
STRIPE_SECRET_KEY=sk_test_...          # Test mode
STRIPE_SECRET_KEY_LIVE=sk_live_...      # Live mode
STRIPE_WEBHOOK_SECRET=whsec_...         # Test webhook secret
STRIPE_WEBHOOK_SECRET_LIVE=whsec_...    # Live webhook secret

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Next Steps

1. ✅ Configure webhook endpoint in Stripe Dashboard
2. ✅ Add webhook secret to environment variables
3. ✅ Test with a small deposit
4. ✅ Monitor webhook logs for any errors
5. ✅ The automatic fallback in `DepositModal.tsx` will handle missed webhooks
