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
}

export const PurchaseConfirmationModal: React.FC<PurchaseConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  clubName,
  clubId,
  externalId,
  pricePerShare,
  maxShares = 10000
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
      <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center">
            Purchase Shares
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-6 space-y-4">
          {/* Team Logo and Name */}
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <TeamLogo 
                teamName={clubName} 
                externalId={externalId}
                size="lg"
                className="mx-auto"
              />
            </div>
            <h3 className="text-lg font-semibold text-blue-400">
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
            
            <div className="space-y-3 bg-gray-700 p-4 rounded-lg">
              <div className="flex justify-between">
                <span className="text-gray-300">Price per share:</span>
                <span className="font-semibold">{formatCurrency(pricePerShare)}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-300">Number of shares:</span>
                <span className="font-semibold">{shares.toLocaleString()}</span>
              </div>
              
              <div className="border-t border-gray-600 pt-3">
                <div className="flex justify-between text-lg">
                  <span className="font-semibold">Total purchase value:</span>
                  <span className="font-bold text-green-400">{formatCurrency(totalValue)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <DialogFooter className="flex gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1 bg-red-500 text-white border-red-500 hover:bg-red-600 hover:text-white hover:border-red-600"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isValid || shares <= 0}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600"
          >
            Confirm Purchase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};