import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Transaction } from '@/shared/constants/clubs';
import { formatCurrency, formatNumber } from '@/shared/lib/formatters';

interface TransactionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubName: string;
  transactions: Transaction[];
}

const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  isOpen,
  onClose,
  clubName,
  transactions
}) => {
  const totalUnits = transactions.reduce((sum, t) => sum + t.units, 0);
  const totalValue = transactions.reduce((sum, t) => sum + t.totalValue, 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{clubName} - Transaction History</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-700 rounded-lg">
            <div>
              <p className="text-gray-400 text-sm">Total Units</p>
              <p className="text-lg font-bold">{formatNumber(totalUnits)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm">Cost</p>
              <p className="text-lg font-bold">{formatCurrency(totalValue)}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-600">
                  <th className="text-left p-2">Date</th>
                  <th className="text-right p-2">Units</th>
                  <th className="text-right p-2">Price/Unit</th>
                  <th className="text-right p-2">Total Value</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => {
                  // Format date with time for display
                  const dateWithTime = new Date(transaction.timestamp).toLocaleString();
                  return (
                  <tr key={transaction.id} className="border-b border-gray-700">
                    <td className="p-2">{dateWithTime}</td>
                    <td className="p-2 text-right">{formatNumber(transaction.units)}</td>
                    <td className="p-2 text-right">{formatCurrency(transaction.pricePerUnit)}</td>
                    <td className="p-2 text-right">{formatCurrency(transaction.totalValue)}</td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionDetailModal;