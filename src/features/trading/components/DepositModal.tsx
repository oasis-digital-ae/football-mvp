import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { formatCurrency } from '@/shared/lib/formatters';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { Wallet, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { walletService } from '@/shared/lib/services/wallet.service';

// Stripe is enabled
const STRIPE_DISABLED = false;

// Platform fee: 5%
const PLATFORM_FEE_PERCENT = 0.05;

// Minimum deposit: $10.00
const MIN_DEPOSIT_CENTS = 1000;

// Get Netlify function base URL
// Vite proxy will handle forwarding to Netlify dev server (port 8888) if running
// Otherwise, use relative path for production
const getNetlifyFunctionUrl = (functionName: string): string => {
  return `/.netlify/functions/${functionName}`;
};

// Prioritize live keys for production (can fallback to test keys if live not available)
const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_LIVE || import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

const stripePromise = loadStripe(stripePublishableKey || '');

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// Payment form component
const PaymentForm: React.FC<{ 
  depositAmount: number; 
  clientSecret: string;
  onSuccess: () => void; 
  onClose: () => void 
}> = ({ 
  depositAmount, 
  clientSecret,
  onSuccess, 
  onClose 
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { user, refreshWalletBalance } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !user || !clientSecret) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // CRITICAL: Submit elements first before any async work
      // This validates the form and prepares it for confirmation
      const { error: submitError } = await elements.submit();
      if (submitError) {
        throw submitError;
      }

      // Use the existing clientSecret that was already created in handleContinue
      // DO NOT create a new payment intent here - it's already been created!

      // Now confirm payment (elements.submit() was already called above)
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret, // Use the clientSecret passed as prop
        confirmParams: {
          return_url: `${window.location.origin}/portfolio`,
        },
        redirect: 'if_required',
      });

      if (confirmError) {
        throw confirmError;
      }

      // Payment succeeded - webhook will credit wallet automatically
      // Wait a moment for webhook to process, then refresh balance
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Refresh wallet balance
      await refreshWalletBalance();
      
      // Also trigger wallet balance change event for other components
      window.dispatchEvent(new CustomEvent('wallet-balance-changed'));

      toast({
        title: "Deposit Successful",
        description: `${formatCurrency(depositAmount)} payment processed. Your wallet will be updated shortly via webhook.`,
        variant: "default",
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Payment failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-700/50 rounded p-3">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      <Button
        type="submit"
        disabled={!stripe || isLoading}
        className="w-full bg-gradient-primary hover:bg-gradient-primary/80 text-white font-semibold"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing payment...
          </>
        ) : (
          `Pay ${formatCurrency(depositAmount * (1 + PLATFORM_FEE_PERCENT))}`
        )}
      </Button>
    </form>
  );
};

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [depositAmount, setDepositAmount] = useState<string>('100');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const depositAmountNum = parseFloat(depositAmount) || 0;
  const platformFee = depositAmountNum * PLATFORM_FEE_PERCENT;
  const totalCharge = depositAmountNum + platformFee;

  const handleAmountChange = (value: string) => {
    // Only allow numbers and one decimal point
    const cleaned = value.replace(/[^\d.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) return; // Only one decimal point allowed
    if (parts[1] && parts[1].length > 2) return; // Max 2 decimal places
    setDepositAmount(cleaned);
    setError(null);
  };

  const validateAmount = (): boolean => {
    if (depositAmountNum < MIN_DEPOSIT_CENTS / 100) {
      setError(`Minimum deposit is ${formatCurrency(MIN_DEPOSIT_CENTS / 100)}`);
      return false;
    }
    return true;
  };

  const handleContinue = async () => {
    if (!user || !validateAmount()) {
      return;
    }

    setError(null);

    try {
      const depositAmountCents = Math.round(depositAmountNum * 100);

      const functionUrl = getNetlifyFunctionUrl('create-payment-intent');
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deposit_amount_cents: depositAmountCents,
          user_id: user.id,
          currency: 'usd',
        }),
      });

      // Check if response is ok
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Server error: ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Parse JSON response
      const responseText = await response.text();
      if (!responseText) {
        throw new Error('Empty response from server');
      }

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse response:', responseText);
        throw new Error('Invalid response from server');
      }

      const { clientSecret: secret, error: apiError } = responseData;

      if (apiError || !secret) {
        throw new Error(apiError || 'Failed to create payment intent');
      }

      setClientSecret(secret);
    } catch (err: any) {
      console.error('Error creating payment intent:', err);
      setError(err.message || 'Failed to initialize payment. Please try again.');
    }
  };

  const handleBack = () => {
    setClientSecret(null);
    setError(null);
  };

  const options = clientSecret
    ? {
        clientSecret,
        appearance: {
          theme: 'night' as const,
          variables: {
            colorPrimary: '#3b82f6',
            colorBackground: '#1f2937',
            colorText: '#f3f4f6',
            colorDanger: '#ef4444',
            fontFamily: 'system-ui, sans-serif',
            spacingUnit: '4px',
            borderRadius: '8px',
          },
        },
      }
    : undefined;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800/95 backdrop-blur-md border border-trading-primary/30 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center gradient-text flex items-center justify-center gap-2">
            <Wallet className="w-5 h-5" />
            Deposit Funds
          </DialogTitle>
          <DialogDescription className="text-center text-gray-400">
            Add funds to your wallet to start trading. A 5% platform fee applies to all deposits.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {!clientSecret ? (
            <>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="deposit-amount" className="text-gray-300 mb-2 block">
                    Deposit Amount
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <Input
                      id="deposit-amount"
                      type="text"
                      value={depositAmount}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      placeholder="100.00"
                      className="pl-8 bg-gray-700/50 border-gray-600 text-white"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Minimum: {formatCurrency(MIN_DEPOSIT_CENTS / 100)}
                  </p>
                </div>

                {depositAmountNum > 0 && (
                  <div className="bg-gradient-card p-4 rounded-lg border border-trading-primary/20 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-300">Deposit Amount:</span>
                      <span className="text-white font-medium">{formatCurrency(depositAmountNum)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-300">Platform Fee (5%):</span>
                      <span className="text-gray-400">{formatCurrency(platformFee)}</span>
                    </div>
                    <div className="border-t border-gray-600 pt-2 flex justify-between">
                      <span className="text-gray-200 font-medium">Total Charge:</span>
                      <span className="text-green-400 font-bold">{formatCurrency(totalCharge)}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      You will receive {formatCurrency(depositAmountNum)} in your wallet
                    </p>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-700/50 rounded p-3">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  onClick={handleContinue}
                  disabled={!user || depositAmountNum < MIN_DEPOSIT_CENTS / 100}
                  className="w-full bg-gradient-primary hover:bg-gradient-primary/80 text-white font-semibold"
                >
                  Continue to Payment
                </Button>
              </div>
            </>
          ) : (
            <>
              {stripePromise && options && clientSecret && (
                <Elements stripe={stripePromise} options={options}>
                  <PaymentForm 
                    depositAmount={depositAmountNum}
                    clientSecret={clientSecret}
                    onSuccess={() => {
                      onSuccess?.();
                      onClose();
                    }} 
                    onClose={onClose}
                  />
                </Elements>
              )}
              <Button
                onClick={handleBack}
                variant="outline"
                className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
              >
                Back
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
