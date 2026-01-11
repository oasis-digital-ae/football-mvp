import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    // Use test keys for now (can switch to live keys later)
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_LIVE;
    
    if (!stripeSecretKey) {
      const errorMsg = 'Missing Stripe secret key. Need STRIPE_SECRET_KEY or STRIPE_SECRET_KEY_LIVE';
      console.error(errorMsg);
      return { 
        statusCode: 500, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Server configuration error: Missing Stripe credentials',
          details: errorMsg
        }) 
      };
    }
    
    const keyType = stripeSecretKey.startsWith('sk_live_') ? 'LIVE' : 'TEST';
    console.log(`Using ${keyType} Stripe keys (key prefix: ${stripeSecretKey.substring(0, 7)})`);

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
    });

    // Parse request body
    let requestBody;
    try {
      requestBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
    } catch (parseError: any) {
      console.error('Failed to parse request body:', parseError);
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid request body', details: parseError.message })
      };
    }

    const { deposit_amount_cents, user_id, currency } = requestBody;

    if (!deposit_amount_cents || !user_id) {
      console.error('Missing required parameters:', {
        hasDepositAmount: !!deposit_amount_cents,
        hasUserId: !!user_id,
        requestBody: JSON.stringify(requestBody),
      });
      return { 
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'deposit_amount_cents and user_id are required' }) 
      };
    }

    const depositAmountCents = Number(deposit_amount_cents);
    if (depositAmountCents < 1000) { // Minimum $10.00 in cents
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: 'Minimum deposit amount is $10.00' }) 
      };
    }

    // Calculate 5% platform fee
    const platformFeeCents = Math.round(depositAmountCents * 0.05);
    const totalChargeCents = depositAmountCents + platformFeeCents;

    console.log('Creating PaymentIntent:', {
      depositAmountCents,
      platformFeeCents,
      totalChargeCents,
      userId: user_id,
      currency: currency || 'usd',
    });

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: totalChargeCents, // Charge total (deposit + fee)
          currency: (currency || 'usd').toLowerCase(),
          metadata: { 
            user_id: String(user_id), 
            purpose: 'wallet_top_up',
            deposit_amount_cents: String(depositAmountCents), // Store original deposit amount
            platform_fee_cents: String(platformFeeCents),
          },
          automatic_payment_methods: { enabled: true },
        },
        { idempotencyKey: `pi_topup_${user_id}_${depositAmountCents}_${Date.now()}` }
      );
    } catch (stripeError: any) {
      console.error('Stripe API error:', {
        type: stripeError.type,
        code: stripeError.code,
        message: stripeError.message,
        statusCode: stripeError.statusCode,
      });
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Failed to create payment intent',
          details: stripeError.message || 'Stripe API error'
        })
      };
    }

    if (!paymentIntent.client_secret) {
      console.error('PaymentIntent created but no client_secret:', paymentIntent);
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'Failed to create payment intent' }) 
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };
  } catch (err: any) {
    console.error('Error creating payment intent:', err);
    return { 
      statusCode: 500, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err?.message || 'Server error' }) 
    };
  }
};


