import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { formatCurrency } from '../lib/formatters';

interface PurchaseConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  clubName: string;
  shares: number;
  pricePerShare: number;
  totalValue: number;
}

export const PurchaseConfirmationModal: React.FC<PurchaseConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  clubName,
  shares,
  pricePerShare,
  totalValue
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center">
            Confirm Purchase
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-6 space-y-4">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-blue-400 mb-4">
              {clubName}
            </h3>
          </div>
          
          <div className="space-y-3 bg-gray-700 p-4 rounded-lg">
            <div className="flex justify-between">
              <span className="text-gray-300">Number of shares:</span>
              <span className="font-semibold">{shares}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-300">Price per share:</span>
              <span className="font-semibold">{formatCurrency(pricePerShare)}</span>
            </div>
            
            <div className="border-t border-gray-600 pt-3">
              <div className="flex justify-between text-lg">
                <span className="font-semibold">Total purchase value:</span>
                <span className="font-bold text-green-400">{formatCurrency(totalValue)}</span>
              </div>
            </div>
          </div>
        </div>
        
        <DialogFooter className="flex gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            Confirm Purchase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};