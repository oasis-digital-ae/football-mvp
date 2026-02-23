import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { formatCurrency } from '@/shared/lib/formatters';
import TeamLogo from '@/shared/components/TeamLogo';
import { AppValidators, validateAndSanitize } from '@/shared/lib/validation';
import { ValidationError } from '@/shared/lib/error-handling';
import { sanitizeInput } from '@/shared/lib/sanitization';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { buyWindowService } from '@/shared/lib/buy-window.service';
import { fixturesService } from '@/shared/lib/database';

interface SellConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (shares: number) => void;
  clubName: string;
  clubId?: string;
  externalId?: number;
  pricePerShare: number;
  currentQuantity: number; // User's current position quantity
  isProcessing?: boolean;
}

export const SellConfirmationModal: React.FC<SellConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  clubName,
  clubId,
  externalId,
  pricePerShare,
  currentQuantity,
  isProcessing = false
}) => {
  const { walletBalance, refreshWalletBalance } = useAuth();
  const [shares, setShares] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [tradingWindowStatus, setTradingWindowStatus] = useState<{
    isOpen: boolean;
    message: string;
  }>({ isOpen: true, message: 'Trading is open' });
  const [checkingWindow, setCheckingWindow] = useState(false);

  // Check trading window status when modal opens
  useEffect(() => {
    const checkTradingWindow = async () => {
      if (!isOpen || !clubId) return;
      
      setCheckingWindow(true);
      try {
        const teamIdInt = parseInt(clubId);
        if (isNaN(teamIdInt)) return;
        
        // Get fixtures for window calculation
        const fixtures = await fixturesService.getAll();
        const status = buyWindowService.calculateBuyWindowStatus(teamIdInt, fixtures);
        
        setTradingWindowStatus({
          isOpen: status.isOpen,
          message: status.reason || (status.isOpen ? 'Trading is open' : 'Trading is closed')
        });
      } catch (error) {
        console.error('Error checking trading window:', error);
        // Default to open on error
        setTradingWindowStatus({ isOpen: true, message: 'Trading is open' });
      } finally {
        setCheckingWindow(false);
      }
    };
    
    checkTradingWindow();
  }, [isOpen, clubId]);

  // Reset shares when modal opens
  useEffect(() => {
    if (isOpen) {
      // Start with empty input instead of pre-filled value
      setShares('');
      setValidationErrors({});
    }
  }, [isOpen, currentQuantity]);

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
    
    // Validate the input
    if (numShares <= 0) {
      setValidationErrors({ units: 'Must sell at least 1 share' });
      return;
    }
    
    if (numShares > currentQuantity) {
      setValidationErrors({ units: `You only own ${currentQuantity} share(s)` });
      return;
    }
    
    setValidationErrors({});
  };
  const handleConfirm = () => {
    // Prevent multiple clicks while processing
    if (isProcessing) return;
    
    try {
      // Parse shares to number
      const numShares = parseInt(shares);
      
      // Final validation before confirming
      if (isNaN(numShares) || numShares <= 0) {
        setValidationErrors({ units: 'Must sell at least 1 share' });
        return;
      }
      
      if (numShares > currentQuantity) {
        setValidationErrors({ units: `You only own ${currentQuantity} share(s)` });
        return;
      }
      
      onConfirm(numShares);
    } catch (error) {
      if (error instanceof ValidationError) {
        setValidationErrors({ general: error.message });
      }
    }
  };

  const numericShares = parseInt(shares) || 0;
  const totalProceeds = numericShares * pricePerShare;
  const newWalletBalance = walletBalance + totalProceeds;
  const isValid = Object.keys(validationErrors).length === 0 && numericShares > 0 && numericShares <= currentQuantity;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800/95 backdrop-blur-md border border-trading-primary/30 text-white max-w-md rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center gradient-text">
            Sell Shares
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
                Number of shares to sell
              </Label>
              <Input
                id="shares"
                type="number"
                min="1"
                max={currentQuantity}
                value={shares}
                onChange={(e) => handleSharesChange(e.target.value)}
                className={`bg-gray-700 border-gray-600 text-white ${
                  !isValid ? 'border-red-500 focus:border-red-500' : 'focus:border-blue-500'
                }`}
                placeholder="Enter number of shares"
              />
              <p className="text-gray-400 text-xs">
                You own {currentQuantity} share(s)
              </p>
              {validationErrors.units && (
                <p className="text-red-400 text-sm">
                  {validationErrors.units}
                </p>
              )}
              {validationErrors.general && (
                <p className="text-red-400 text-sm">
                  {validationErrors.general}
                </p>
              )}            </div>
            
            {/* Trading Window Status */}
            {!tradingWindowStatus.isOpen && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-red-400">Trading Closed</p>
                    <p className="text-xs text-red-300 mt-1">{tradingWindowStatus.message}</p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="space-y-4 bg-gradient-card p-6 rounded-lg border border-trading-primary/20">
              <div className="flex justify-between items-center">
                <span className="text-gray-300 font-medium">Price per share:</span>
                <span className="font-semibold text-white">{formatCurrency(pricePerShare)}</span>
              </div>
                <div className="flex justify-between items-center">
                <span className="text-gray-300 font-medium">Number of shares:</span>
                <span className="font-semibold text-white">{numericShares.toLocaleString()}</span>
              </div>
              
              <div className="border-t border-trading-primary/30 pt-4 space-y-2">
                <div className="flex justify-between items-center text-lg">
                  <span className="font-semibold text-gray-300">Total sale proceeds:</span>
                  <span className="font-bold text-green-400 text-xl">{formatCurrency(totalProceeds)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Current balance:</span>
                  <span className="font-semibold text-white">
                    {formatCurrency(walletBalance)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">New balance:</span>
                  <span className="font-semibold text-green-400">
                    {formatCurrency(newWalletBalance)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
          <DialogFooter className="flex gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white border-gray-600 hover:border-gray-500 font-semibold"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isValid || numericShares <= 0 || isProcessing || numericShares > currentQuantity || !tradingWindowStatus.isOpen || checkingWindow}
            className="flex-1 bg-gradient-danger hover:bg-gradient-danger/80 disabled:bg-gray-600 text-white font-semibold transition-all duration-200 disabled:hover:scale-100"
            title={
              !tradingWindowStatus.isOpen ? 'Trading is closed' :
              checkingWindow ? 'Checking trading window...' :
              numericShares > currentQuantity 
                ? 'Cannot sell more shares than you own' 
                : 'Confirm sale'
            }
          >
            {checkingWindow ? 'Checking...' :
             isProcessing ? 'Processing...' : 
             !tradingWindowStatus.isOpen ? '🔒 Trading Closed' :
             numericShares > currentQuantity ? '❌ Invalid Quantity' :
             'Confirm Sale'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};








