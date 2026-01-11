# Stripe Integration Guide

## How It Works

### Current Implementation

The Stripe integration uses **live keys by default** in both development and production. Here's how it's configured:

#### Frontend (DepositModal.tsx)
- **Publishable Key**: Uses `VITE_STRIPE_PUBLISHABLE_KEY_LIVE` with fallback to `VITE_STRIPE_PUBLISHABLE_KEY`
- **Priority**: Live key first, then test key
- **Location**: Client-side (visible in browser)

#### Backend Functions
- **create-payment-intent.ts**: Uses `STRIPE_SECRET_KEY_LIVE` (hardcoded)
- **stripe-webhook.ts**: Uses `STRIPE_SECRET_KEY_LIVE` and `STRIPE_WEBHOOK_SECRET_LIVE` (hardcoded)

### Payment Flow

1. **User enters deposit amount** (e.g., $100)
2. **Frontend calculates**:
   - Deposit: $100
   - Platform fee (5%): $5
   - Total charge: $105
3. **Frontend calls** `create-payment-intent` Netlify function
4. **Backend creates PaymentIntent**:
   - Charges: $105 (deposit + fee)
   - Stores in metadata: `deposit_amount_cents: 10000`, `platform_fee_cents: 500`
5. **User completes payment** via Stripe Elements
6. **Stripe sends webhook** to `stripe-webhook` function
7. **Webhook credits wallet** with $100 (deposit amount, not total)

## Test vs Live Keys

### Key Differences

| Feature | Test Keys | Live Keys |
|---------|-----------|-----------|
| **Prefix** | `pk_test_` / `sk_test_` | `pk_live_` / `sk_live_` |
| **Charges** | No real money | Real money |
| **Cards** | Test card numbers | Real cards |
| **Webhooks** | Test webhook secrets | Live webhook secrets |
| **Dashboard** | Separate test dashboard | Production dashboard |
| **Data** | Test data only | Real customer data |

### Test Card Numbers (Test Mode Only)

Stripe provides test card numbers that work with test keys:
- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **3D Secure**: `4000 0025 0000 3155`
- **Any future date** for expiry
- **Any 3 digits** for CVC

## Current Issue: Hardcoded to Live Keys

**Problem**: The backend functions are hardcoded to use `STRIPE_SECRET_KEY_LIVE`, which means:
- ❌ You can't test with test keys in development
- ❌ All payments use real money (even in dev)
- ❌ Risk of accidental charges during testing

## Recommended Solution: Environment-Aware Keys

### Option 1: Use Environment Variable to Switch

Update the functions to detect environment:

```typescript
// In create-payment-intent.ts and stripe-webhook.ts
const isProduction = process.env.NETLIFY_ENV === 'production' || 
                     process.env.CONTEXT === 'production';

const stripeSecretKey = isProduction
  ? process.env.STRIPE_SECRET_KEY_LIVE
  : process.env.STRIPE_SECRET_KEY; // Test key

const webhookSecret = isProduction
  ? process.env.STRIPE_WEBHOOK_SECRET_LIVE
  : process.env.STRIPE_WEBHOOK_SECRET; // Test webhook secret
```

### Option 2: Use Separate Netlify Sites

- **Development site**: Use test keys
- **Production site**: Use live keys
- Different webhook endpoints for each

### Option 3: Feature Flag

Add a feature flag to switch between test/live:

```typescript
const USE_LIVE_KEYS = process.env.USE_STRIPE_LIVE_KEYS === 'true';
```

## Development vs Production Behavior

### Development (Test Keys)
- ✅ No real charges
- ✅ Use test card numbers
- ✅ Test webhook endpoint (Stripe CLI)
- ✅ Separate test dashboard
- ⚠️ Webhooks need Stripe CLI: `stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook`

### Production (Live Keys)
- ⚠️ Real charges
- ✅ Real cards only
- ✅ Production webhook endpoint
- ✅ Production dashboard
- ✅ Real customer data

## Webhook Setup

### Test Mode (Development)
1. Install Stripe CLI: `stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook`
2. Use the webhook secret from CLI output
3. Set `STRIPE_WEBHOOK_SECRET` in `.env`

### Live Mode (Production)
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-site.netlify.app/.netlify/functions/stripe-webhook`
3. Select events: `payment_intent.succeeded`
4. Copy webhook signing secret
5. Set `STRIPE_WEBHOOK_SECRET_LIVE` in Netlify environment variables

## Security Considerations

1. **Never commit keys to git** - Use environment variables
2. **Test keys in development** - Avoid accidental charges
3. **Separate webhook secrets** - Test and live use different secrets
4. **HTTPS required for live** - Stripe requires HTTPS for live keys
5. **Webhook signature verification** - Always verify webhook signatures

## Current Configuration

Based on your `.env` file, you have:
- ✅ Test keys: `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- ✅ Live keys: `STRIPE_SECRET_KEY_LIVE`, `VITE_STRIPE_PUBLISHABLE_KEY_LIVE`, `STRIPE_WEBHOOK_SECRET_LIVE`

**But the code only uses live keys!** This needs to be fixed to support both environments.
