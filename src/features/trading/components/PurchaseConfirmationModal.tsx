import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { formatCurrency } from '@/shared/lib/formatters';
import TeamLogo from '@/shared/components/TeamLogo';
import { AppValidators, validateForm, validateAndSanitize } from '@/shared/lib/validation';
import { ValidationError } from '@/shared/lib/error-handling';
import { sanitizeInput } from '@/shared/lib/sanitization';
import BuyWindowIndicator from '@/shared/components/BuyWindowIndicator';
import { buyWindowService } from '@/shared/lib/buy-window.service';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { DepositModal } from './DepositModal';

interface PurchaseConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (shares: number) => void;
  clubName: string;
  clubId?: string;
  externalId?: number;
  pricePerShare: number;
  maxShares?: number;
  isProcessing?: boolean;
}

export const PurchaseConfirmationModal: React.FC<PurchaseConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  clubName,
  clubId,
  externalId,
  pricePerShare,
  maxShares = 10000,
  isProcessing = false
}) => {
  const { walletBalance, refreshWalletBalance } = useAuth();
  const [shares, setShares] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [buyWindowStatus, setBuyWindowStatus] = useState<any>(null);
  const [depositModalOpen, setDepositModalOpen] = useState(false);

  // Reset shares when modal opens
  useEffect(() => {
    if (isOpen) {
      setShares('');
      setValidationErrors({});
      
      // Fetch buy window status
      if (clubId) {
        buyWindowService.getBuyWindowDisplayInfo(parseInt(clubId))
          .then(setBuyWindowStatus)
          .catch(error => {
            console.error('Error fetching buy window status:', error);
            setBuyWindowStatus({ isOpen: false, message: 'Unable to check trading status' });
          });
      }
    }
  }, [isOpen, clubId]);

  const handleSharesChange = (value: string) => {
    // Sanitize and validate input
    const sanitizedValue = sanitizeInput(value, 'number');
    
    // Allow empty string to clear the input
    if (sanitizedValue === '') {
      setShares('');
      setValidationErrors({});
      return;
    }
    
    const numShares = parseInt(sanitizedValue);
    
    // Only update if it's a valid number
    if (isNaN(numShares)) {
      return;
    }
    
    setShares(sanitizedValue);
    
    // Validate the input using enhanced validation with sanitization
    const validation = validateAndSanitize(AppValidators.sharePurchaseModal, {
      units: numShares,
      pricePerShare: pricePerShare
    }, {
      units: 'number',
      pricePerShare: 'number'
    });
    
    setValidationErrors(validation.errors);
  };
  const handleConfirm = () => {
    // Prevent multiple clicks while processing
    if (isProcessing) return;
    
    try {
      // Parse shares to number
      const numShares = parseInt(shares);
      
      // Final validation before confirming using enhanced validation with sanitization
      const validation = validateAndSanitize(AppValidators.sharePurchaseModal, {
        units: numShares,
        pricePerShare: pricePerShare
      }, {
        units: 'number',
        pricePerShare: 'number'
      });
      
      if (!validation.isValid) {
        setValidationErrors(validation.errors);
        return;
      }
      
      // Use sanitized data
      onConfirm(validation.data.units);
    } catch (error) {
      if (error instanceof ValidationError) {
        setValidationErrors({ general: error.message });
      }
    }
  };

  const numericShares = parseInt(shares) || 0;
  const totalValue = numericShares * pricePerShare;
  const hasSufficientBalance = walletBalance >= totalValue;
  const isValid = Object.keys(validationErrors).length === 0 && numericShares > 0 && hasSufficientBalance;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800/95 backdrop-blur-md border border-trading-primary/30 text-white">
        <DialogHeader className="pb-3 sm:pb-4">
          <DialogTitle className="text-base sm:text-lg md:text-xl font-bold text-center gradient-text">
            Purchase Shares
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-2 sm:py-4 space-y-3 sm:space-y-4">
          {/* Team Logo and Name - Financial App Style */}
          <div className="text-center space-y-1.5 sm:space-y-2">
            <div className="flex justify-center">
              <TeamLogo 
                teamName={clubName} 
                externalId={externalId}
                size="sm"
                className="mx-auto"
              />
            </div>
            <h3 className="text-xs sm:text-sm font-semibold text-trading-primary">
              {clubName}
            </h3>
          </div>
          
          {/* Buy Window Status - Minimal */}
          {buyWindowStatus && !buyWindowStatus.isOpen && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-center">
              <div className="text-red-400 text-[10px] sm:text-xs">
                ⚠️ Trading closed
              </div>
            </div>
          )}
          
          <div className="space-y-3">
            {/* Shares Input - Financial App Style */}
            <div className="space-y-1">
              <Label htmlFor="shares" className="text-[10px] sm:text-xs text-gray-400 font-medium uppercase tracking-wide">
                Shares
              </Label>              <Input
                id="shares"
                type="number"
                min="1"
                max={maxShares}
                value={shares}
                onChange={(e) => handleSharesChange(e.target.value)}
                className={`bg-gray-700/50 border-gray-600 text-white text-base sm:text-lg font-semibold h-12 sm:h-14 touch-manipulation text-center ${
                  !isValid ? 'border-red-500 focus:border-red-500' : 'focus:border-blue-500'
                }`}
                placeholder="Enter quantity"
              />
              {validationErrors.units && (
                <p className="text-red-400 text-[10px] sm:text-xs mt-0.5">
                  {validationErrors.units}
                </p>
              )}
              {validationErrors.general && (
                <p className="text-red-400 text-[10px] sm:text-xs mt-0.5">
                  {validationErrors.general}
                </p>
              )}
            </div>
            
            {/* Purchase Summary - Financial App Style (Compact) */}
            <div className="bg-gray-700/20 rounded-lg p-2.5 sm:p-3 border border-gray-600/30 space-y-2">
              <div className="flex justify-between items-center text-[10px] sm:text-xs">
                <span className="text-gray-500">Price</span>
                <span className="font-medium text-gray-300">{formatCurrency(pricePerShare)}</span>
              </div>
                <div className="flex justify-between items-center text-[10px] sm:text-xs">
                <span className="text-gray-500">Qty</span>
                <span className="font-medium text-gray-300">{numericShares.toLocaleString()}</span>
              </div>
              
              <div className="border-t border-gray-600/30 pt-2 space-y-1.5">
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">Total</span>
                  <span className="text-lg sm:text-xl md:text-2xl font-bold text-trading-primary">{formatCurrency(totalValue)}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] sm:text-xs">
                  <span className="text-gray-500">Available</span>
                  <span className={`font-medium ${hasSufficientBalance ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(walletBalance)}
                  </span>
                </div>
                {!hasSufficientBalance && (
                  <div className="pt-1 flex items-center justify-between">
                    <span className="text-red-400 text-[10px]">Insufficient funds</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDepositModalOpen(true)}
                      className="text-[10px] h-6 px-2 touch-manipulation border-gray-600 text-gray-300 hover:bg-gray-700"
                    >
                      Add
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Action Buttons - Financial App Style */}        <DialogFooter className="flex flex-col gap-2 pt-3 border-t border-gray-700/50">
          <Button
            onClick={handleConfirm}
            disabled={!isValid || numericShares <= 0 || isProcessing || !buyWindowStatus?.isOpen || !hasSufficientBalance}
            className="w-full bg-[#10B981] hover:bg-[#059669] disabled:bg-gray-600 disabled:opacity-50 text-white font-semibold transition-all duration-200 disabled:hover:scale-100 h-12 sm:h-14 touch-manipulation text-sm sm:text-base shadow-lg"
            title={
              !buyWindowStatus?.isOpen 
                ? 'Trading window is closed' 
                : !hasSufficientBalance 
                ? 'Insufficient balance' 
                : 'Confirm purchase'
            }
          >
            {isProcessing ? 'Processing...' : 
             !buyWindowStatus?.isOpen ? 'Trading Closed' : 
             !hasSufficientBalance ? 'Insufficient Balance' :
             'Purchase'}
          </Button>
          <Button
            onClick={onClose}
            variant="ghost"
            className="w-full bg-transparent hover:bg-gray-700/30 text-gray-400 hover:text-gray-300 font-medium h-10 touch-manipulation text-xs sm:text-sm"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
      <DepositModal
        isOpen={depositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        onSuccess={() => {
          refreshWalletBalance();
          setDepositModalOpen(false);
        }}
      />
    </Dialog>
  );
};