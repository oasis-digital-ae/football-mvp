import React, { useState, useEffect } from 'react';
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { formatCurrency } from '@/shared/lib/formatters';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { walletService } from '@/shared/lib/services/wallet.service';
import { Wallet, Loader2 } from 'lucide-react';

// Load Stripe with publishable key
const getStripePublishableKey = () => {
  const env = (import.meta as any).env;
  return env?.VITE_STRIPE_PUBLISHABLE_KEY || '';
};

const stripePublishableKey = getStripePublishableKey();
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

if (!stripePublishableKey) {
  console.error('Missing VITE_STRIPE_PUBLISHABLE_KEY environment variable');
}

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const DepositForm: React.FC<{ clientSecret: string; onSuccess: () => void; onClose: () => void }> = ({
  clientSecret,
  onSuccess,
  onClose,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentElementReady, setPaymentElementReady] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || isProcessing) return;

    setIsProcessing(true);
    setError(null);

    try {
      const { error: submitError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/deposit/success`,
        },
        redirect: 'if_required',
      });

      if (submitError) {
        setError(submitError.message || 'Payment failed');
        setIsProcessing(false);
      } else {
        // Success - webhook will credit balance
        onSuccess();
        setIsProcessing(false);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {stripe && elements ? (
        <>
          <PaymentElement 
            onReady={() => {
              setPaymentElementReady(true);
            }}
            onLoadError={(event) => {
              console.error('Payment Element load error:', event);
              setError('Failed to load payment form. Please try again.');
            }}
          />
        </>
      ) : (
        <div className="text-center py-4">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-400">Loading payment form...</p>
        </div>
      )}
      {error && <div className="text-red-400 text-sm">{error}</div>}
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!stripe || !elements || !paymentElementReady || isProcessing}
          className="flex-1 bg-trading-primary hover:bg-trading-primary/80"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            'Pay Now'
          )}
        </Button>
      </div>
    </form>
  );
};

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [amount, setAmount] = useState<number>(100);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setAmount(100);
      setClientSecret(null);
      setError(null);
    }
  }, [isOpen]);

  const createPaymentIntent = async () => {
    if (!user || amount < 10) {
      setError('Minimum deposit is $10');
      return;
    }

    if (!stripePublishableKey) {
      setError('Stripe is not configured. Please contact support.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/.netlify/functions/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_cents: Math.round(amount * 100),
          user_id: user.id,
          currency: 'usd',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Payment intent creation failed:', response.status, errorText);
        throw new Error(errorText || 'Failed to create payment intent');
      }

      const data = await response.json();
      
      if (!data.clientSecret) {
        console.error('No clientSecret in response:', data);
        throw new Error('Invalid response from server');
      }
      
      setClientSecret(data.clientSecret);
    } catch (err: any) {
      console.error('Error creating payment intent:', err);
      setError(err.message || 'Failed to start payment');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuccess = () => {
    onSuccess?.();
    onClose();
  };

  const options: StripeElementsOptions | undefined = clientSecret && stripePromise
    ? {
        clientSecret,
        appearance: { theme: 'night' as const },
      }
    : undefined;

  if (!stripePublishableKey) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="bg-gray-800/95 backdrop-blur-md border border-trading-primary/30 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center gradient-text flex items-center justify-center gap-2">
              <Wallet className="w-5 h-5" />
              Deposit Funds
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="text-red-400 text-sm text-center">
              Stripe is not configured. Please contact support.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800/95 backdrop-blur-md border border-trading-primary/30 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center gradient-text flex items-center justify-center gap-2">
            <Wallet className="w-5 h-5" />
            Deposit Funds
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {!clientSecret || !options ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-gray-300">
                  Deposit Amount (USD)
                </Label>
                <Input
                  id="amount"
                  type="number"
                  min="10"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="bg-gray-700 border-gray-600 text-white"
                  placeholder="100.00"
                />
                <p className="text-xs text-gray-400">Minimum: $10.00</p>
              </div>

              {error && <div className="text-red-400 text-sm">{error}</div>}

              <Button
                onClick={createPaymentIntent}
                disabled={isLoading || amount < 10}
                className="w-full bg-trading-primary hover:bg-trading-primary/80"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating payment...
                  </>
                ) : (
                  `Continue to Payment - ${formatCurrency(amount)}`
                )}
              </Button>
            </>
          ) : (
            stripePromise && (
              <Elements stripe={stripePromise} options={options}>
                <DepositForm clientSecret={clientSecret} onSuccess={handleSuccess} onClose={onClose} />
              </Elements>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

