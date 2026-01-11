import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

/**
 * Manual wallet credit endpoint
 * This can be called to manually credit a wallet if the webhook failed
 * Requires payment_intent_id and user_id
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    // Detect environment
    const isProduction = process.env.NETLIFY_ENV === 'production' || 
                         process.env.CONTEXT === 'production' ||
                         process.env.NODE_ENV === 'production';
    
    // Validate required environment variables
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    // Use live keys in production, test keys in development
    // In development, ONLY use test keys (no fallback to live keys)
    const stripeSecretKey = isProduction
      ? process.env.STRIPE_SECRET_KEY_LIVE
      : process.env.STRIPE_SECRET_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'Server configuration error: Missing Supabase credentials' }) 
      };
    }

    if (!stripeSecretKey) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'Server configuration error: Missing Stripe credentials' }) 
      };
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
    });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let requestBody;
    try {
      requestBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
    } catch (parseError: any) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid request body', details: parseError.message })
      };
    }

    const { payment_intent_id, user_id } = requestBody;

    if (!payment_intent_id || !user_id) {
      return { 
        statusCode: 400,
        body: JSON.stringify({ error: 'payment_intent_id and user_id are required' }) 
      };
    }

    // Retrieve payment intent from Stripe
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
    } catch (stripeError: any) {
      console.error('Error retrieving payment intent:', stripeError);
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Failed to retrieve payment intent',
          details: stripeError.message 
        })
      };
    }

    // Verify payment intent succeeded
    if (paymentIntent.status !== 'succeeded') {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Payment intent has not succeeded',
          status: paymentIntent.status 
        })
      };
    }

    // Verify user_id matches
    if (paymentIntent.metadata?.user_id !== user_id) {
      return {
        statusCode: 403,
        body: JSON.stringify({ 
          error: 'User ID does not match payment intent metadata' 
        })
      };
    }

    // Get deposit amount from metadata
    const depositAmountCents = paymentIntent.metadata?.deposit_amount_cents 
      ? parseInt(paymentIntent.metadata.deposit_amount_cents, 10)
      : null;

    if (!depositAmountCents || depositAmountCents <= 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Invalid or missing deposit_amount_cents in payment intent metadata',
          metadata: paymentIntent.metadata 
        })
      };
    }

    // Check if already credited (idempotency)
    const { data: existingTransaction } = await supabase
      .from('wallet_transactions')
      .select('id')
      .eq('ref', payment_intent_id)
      .eq('user_id', user_id)
      .maybeSingle();

    if (existingTransaction) {
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          message: 'Wallet already credited for this payment intent',
          transaction_id: existingTransaction.id 
        })
      };
    }

    // Credit wallet
    const { error: creditError } = await supabase.rpc('credit_wallet', {
      p_user_id: user_id,
      p_amount_cents: depositAmountCents,
      p_ref: payment_intent_id,
    });

    if (creditError) {
      console.error('Error crediting wallet:', creditError);
      return { 
        statusCode: 500, 
        body: JSON.stringify({ 
          error: 'Failed to credit wallet',
          details: creditError.message 
        }) 
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true,
        message: `Successfully credited $${depositAmountCents / 100} to wallet`,
        deposit_amount_cents: depositAmountCents,
      })
    };
  } catch (err: any) {
    console.error('Manual credit error:', err);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: err?.message || 'Server error' }) 
    };
  }
};
