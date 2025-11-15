import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    // Validate environment variables
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY_LIVE;
    if (!stripeSecretKey) {
      console.error('Missing STRIPE_SECRET_KEY_LIVE');
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'Server configuration error: Missing Stripe credentials' }) 
      };
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
    });

    const { amount_cents, user_id, currency } = JSON.parse(event.body || '{}');

    if (!amount_cents || !user_id) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: 'amount_cents and user_id are required' }) 
      };
    }

    if (Number(amount_cents) < 1000) { // Minimum $10.00 in cents
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: 'Minimum deposit amount is $10.00' }) 
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: Number(amount_cents),
        currency: (currency || 'usd').toLowerCase(),
        metadata: { user_id: String(user_id), purpose: 'wallet_top_up' },
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: `pi_topup_${user_id}_${amount_cents}_${Date.now()}` }
    );

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


