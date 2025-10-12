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
  const [shares, setShares] = useState<number>(1);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Reset shares when modal opens
  useEffect(() => {
    if (isOpen) {
      setShares(1);
      setValidationErrors({});
    }
  }, [isOpen]);

  const handleSharesChange = (value: string) => {
    // Sanitize and validate input
    const sanitizedValue = sanitizeInput(value, 'number');
    const numShares = parseInt(sanitizedValue) || 0;
    setShares(numShares);
    
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
      // Final validation before confirming using enhanced validation with sanitization
      const validation = validateAndSanitize(AppValidators.sharePurchaseModal, {
        units: shares,
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

  const totalValue = shares * pricePerShare;
  const isValid = Object.keys(validationErrors).length === 0 && shares > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800/95 backdrop-blur-md border border-trading-primary/30 text-white max-w-md rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center gradient-text">
            Purchase Shares
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-6 space-y-4">
          {/* Team Logo and Name */}
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="team-logo-container">
                <TeamLogo 
                  teamName={clubName} 
                  externalId={externalId}
                  size="lg"
                  className="mx-auto"
                />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-trading-primary">
              {clubName}
            </h3>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="shares" className="text-gray-300">
                Number of shares to purchase
              </Label>
              <Input
                id="shares"
                type="number"
                min="1"
                max={maxShares}
                value={shares}
                onChange={(e) => handleSharesChange(e.target.value)}
                className={`bg-gray-700 border-gray-600 text-white ${
                  !isValid ? 'border-red-500 focus:border-red-500' : 'focus:border-blue-500'
                }`}
                placeholder="Enter number of shares"
              />
              {validationErrors.units && (
                <p className="text-red-400 text-sm">
                  {validationErrors.units}
                </p>
              )}
              {validationErrors.general && (
                <p className="text-red-400 text-sm">
                  {validationErrors.general}
                </p>
              )}
            </div>
            
            <div className="space-y-4 bg-gradient-card p-6 rounded-lg border border-trading-primary/20">
              <div className="flex justify-between items-center">
                <span className="text-gray-300 font-medium">Price per share:</span>
                <span className="font-semibold text-white">{formatCurrency(pricePerShare)}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-gray-300 font-medium">Number of shares:</span>
                <span className="font-semibold text-white">{shares.toLocaleString()}</span>
              </div>
              
              <div className="border-t border-trading-primary/30 pt-4">
                <div className="flex justify-between items-center text-lg">
                  <span className="font-semibold text-gray-300">Total purchase value:</span>
                  <span className="font-bold text-trading-primary text-xl">{formatCurrency(totalValue)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <DialogFooter className="flex gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1 bg-gradient-danger hover:bg-gradient-danger/80 text-white border-danger hover:border-danger/80 font-semibold"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isValid || shares <= 0 || isProcessing}
            className="flex-1 bg-gradient-success hover:bg-gradient-success/80 disabled:bg-gray-600 text-white font-semibold transition-all duration-200 disabled:hover:scale-100"
          >
            {isProcessing ? 'Processing...' : 'Confirm Purchase'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};