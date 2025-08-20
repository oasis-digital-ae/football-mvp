import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Transaction } from '@/data/clubs';
import { formatCurrency, formatNumber } from '@/lib/formatters';

interface TransactionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubName: string;
  transactions: Transaction[];
}

const TransactionHistoryModal: React.FC<TransactionHistoryModalProps> = ({
  isOpen,
  onClose,
  clubName,
  transactions
}) => {
  const totalUnits = transactions.reduce((sum, t) => sum + t.units, 0);
  const totalValue = transactions.reduce((sum, t) => sum + t.totalValue, 0);
  const avgPrice = totalValue / totalUnits || 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{clubName} - Transaction History</DialogTitle>
        </DialogHeader>
        
        <div className="mb-4 p-4 bg-gray-700 rounded">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-400">Total Units</p>
              <p className="font-bold">{formatNumber(totalUnits)}</p>
            </div>
            <div>
              <p className="text-gray-400">Total Invested</p>
              <p className="font-bold">{formatCurrency(totalValue)}</p>
            </div>
            <div>
              <p className="text-gray-400">Average Price</p>
              <p className="font-bold">{formatCurrency(avgPrice)}</p>
            </div>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-800">
              <tr className="border-b border-gray-600">
                <th className="text-left p-2">Date</th>
                <th className="text-right p-2">Units</th>
                <th className="text-right p-2">Price/Unit</th>
                <th className="text-right p-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="border-b border-gray-700">
                  <td className="p-2">{transaction.date}</td>
                  <td className="p-2 text-right">{formatNumber(transaction.units)}</td>
                  <td className="p-2 text-right">{formatCurrency(transaction.pricePerUnit)}</td>
                  <td className="p-2 text-right">{formatCurrency(transaction.totalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionHistoryModal;