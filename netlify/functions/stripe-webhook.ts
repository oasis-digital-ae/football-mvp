import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = {
  // Ensure Netlify passes the raw body so we can verify signature
  // parse: false is used in older runtimes; new runtimes expose raw body string as event.body
} as any;

export const handler: Handler = async (event) => {
  try {
    // Validate required environment variables
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY_LIVE;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET_LIVE;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase credentials:', {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey,
      });
      return { statusCode: 500, body: 'Server configuration error: Missing Supabase credentials' };
    }

    if (!stripeSecretKey) {
      console.error('Missing Stripe secret key (STRIPE_SECRET_KEY_LIVE)');
      return { statusCode: 500, body: 'Server configuration error: Missing Stripe credentials' };
    }

    if (!endpointSecret) {
      console.error('Missing webhook secret (STRIPE_WEBHOOK_SECRET_LIVE)');
      return { statusCode: 500, body: 'Server configuration error: Missing webhook secret' };
    }

    // Initialize clients with validated env vars
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
    });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
    if (!signature) return { statusCode: 400, body: 'Missing signature' };

    const rawBody = event.body as string;

    let stripeEvent: Stripe.Event;
    try {
      stripeEvent = stripe.webhooks.constructEvent(rawBody, String(signature), endpointSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }

    // Idempotency guard
    const { data: existing } = await supabase
      .from('stripe_events')
      .select('id')
      .eq('id', stripeEvent.id)
      .maybeSingle();

    if (!existing) {
      await supabase.from('stripe_events').insert({ id: stripeEvent.id, type: stripeEvent.type });

      if (stripeEvent.type === 'payment_intent.succeeded') {
        const pi = stripeEvent.data.object as Stripe.PaymentIntent;
        const userId = pi.metadata?.user_id;
        const amount = pi.amount_received || pi.amount || 0;

        if (userId && amount > 0) {
          const { error: creditError } = await supabase.rpc('credit_wallet', {
            p_user_id: userId,
            p_amount_cents: amount,
            p_ref: pi.id,
          });

          if (creditError) {
            console.error('Error crediting wallet:', creditError);
            // Don't fail the webhook - we'll retry later if needed
            // Stripe will retry if we return non-2xx
          } else {
            console.log(`Successfully credited wallet for user ${userId}: ${amount / 100} ${pi.currency}`);
          }
        }
      }
    }

    return { statusCode: 200, body: 'ok' };
  } catch (e: any) {
    console.error('Webhook handler error:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e?.message || 'webhook error' }) };
  }
};


