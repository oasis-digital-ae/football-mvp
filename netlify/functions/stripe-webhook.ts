import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = {
  // Ensure Netlify passes the raw body so we can verify signature
  // parse: false is used in older runtimes; new runtimes expose raw body string as event.body
} as any;

export const handler: Handler = async (event) => {
  try {
    // Prioritize live keys for production (can fallback to test keys if live not available)
    // Validate required environment variables
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET_LIVE || process.env.STRIPE_WEBHOOK_SECRET;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase credentials:', {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey,
      });
      return { statusCode: 500, body: 'Server configuration error: Missing Supabase credentials' };
    }

    if (!stripeSecretKey) {
      console.error('Missing Stripe secret key (STRIPE_SECRET_KEY or STRIPE_SECRET_KEY_LIVE)');
      return { statusCode: 500, body: 'Server configuration error: Missing Stripe credentials' };
    }

    if (!endpointSecret) {
      console.error('Missing webhook secret (STRIPE_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET_LIVE)');
      return { statusCode: 500, body: 'Server configuration error: Missing webhook secret' };
    }
    
    const keyType = stripeSecretKey.startsWith('sk_live_') ? 'LIVE' : 'TEST';
    console.log(`Using ${keyType} Stripe keys for webhook`);

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
        
        // Get deposit amount from metadata (not the charged amount)
        // The charged amount includes the 5% platform fee
        // We only credit the deposit amount to the user's wallet
        const depositAmountCents = pi.metadata?.deposit_amount_cents 
          ? parseInt(pi.metadata.deposit_amount_cents, 10)
          : null;
        
        const platformFeeCents = pi.metadata?.platform_fee_cents
          ? parseInt(pi.metadata.platform_fee_cents, 10)
          : null;

        if (userId && depositAmountCents && depositAmountCents > 0) {
          // CRITICAL: Validate deposit amount matches expected range
          // If deposit_amount_cents is suspiciously high, log warning
          if (depositAmountCents > 1000000) { // More than $10,000
            console.error('WARNING: Suspiciously high deposit amount detected:', {
              depositAmountCents,
              paymentIntentId: pi.id,
              totalCharged: pi.amount,
              metadata: pi.metadata,
            });
          }
          
          console.log(`Processing wallet credit for user ${userId}:`, {
            depositAmountCents,
            depositAmountDollars: depositAmountCents / 100,
            platformFeeCents,
            paymentIntentId: pi.id,
            totalCharged: pi.amount,
            totalChargedDollars: pi.amount / 100,
            metadata: pi.metadata,
          });

          const { data: creditResult, error: creditError } = await supabase.rpc('credit_wallet', {
            p_user_id: userId,
            p_amount_cents: depositAmountCents, // Credit only the deposit amount (not including fee)
            p_ref: pi.id,
          });

          if (creditError) {
            console.error('Error crediting wallet:', {
              error: creditError,
              message: creditError.message,
              details: creditError.details,
              hint: creditError.hint,
              code: creditError.code,
            });
            // Return error so Stripe retries the webhook
            return { 
              statusCode: 500, 
              body: JSON.stringify({ 
                error: 'Failed to credit wallet',
                details: creditError.message 
              }) 
            };
          } else {
            console.log(`Successfully credited wallet for user ${userId}: $${depositAmountCents / 100} ${pi.currency}`);
            if (platformFeeCents) {
              console.log(`Platform fee collected: $${platformFeeCents / 100}`);
            }
          }
        } else {
          const missingData = {
            userId: !!userId,
            depositAmountCents: depositAmountCents,
            hasMetadata: !!pi.metadata,
            metadataKeys: pi.metadata ? Object.keys(pi.metadata) : [],
            paymentIntentId: pi.id,
            paymentIntentAmount: pi.amount,
          };
          console.warn('Missing required metadata for payment intent:', missingData);
          
          // If metadata is missing, we can't credit the wallet
          // Log this but don't fail the webhook (payment already succeeded)
          // This should not happen if payment intent was created correctly
          return {
            statusCode: 200,
            body: JSON.stringify({ 
              warning: 'Payment succeeded but wallet not credited - missing metadata',
              details: missingData
            })
          };
        }
      }
    }

    return { statusCode: 200, body: 'ok' };
  } catch (e: any) {
    console.error('Webhook handler error:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e?.message || 'webhook error' }) };
  }
};


