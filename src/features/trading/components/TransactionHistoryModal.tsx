import React from 'react';
import { Dialog, DialogContent, DialogHeader } from '@/shared/components/ui/dialog';
import { Transaction } from '@/shared/constants/clubs';
import { formatCurrency, formatNumber } from '@/shared/lib/formatters';
import TeamLogo from '@/shared/components/TeamLogo';

interface TransactionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubName: string;
  clubId?: string;
  externalId?: number;
  transactions: Transaction[];
}

const TransactionHistoryModal: React.FC<TransactionHistoryModalProps> = ({
  isOpen,
  onClose,
  clubName,
  clubId,
  externalId,
  transactions
}) => {
  // Calculate total units: add buys, subtract sells
  const totalUnits = transactions.reduce((sum, t) => {
    return t.orderType === 'BUY' ? sum + t.units : sum - t.units;
  }, 0);
  
  // Calculate total invested: only sum buy transactions (sells reduce investment)
  const totalInvested = transactions.reduce((sum, t) => {
    return t.orderType === 'BUY' ? sum + t.totalValue : sum - t.totalValue;
  }, 0);
  
  // Average price is based on net investment and net units
  const avgPrice = totalUnits > 0 ? totalInvested / totalUnits : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-2xl max-w-[calc(100vw-1rem)] max-h-[calc(100vh-1rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto">
        <DialogHeader className="pb-4 border-b border-gray-700/50 mb-4 pr-12">
          <div className="flex items-center gap-3 pr-8">
            <TeamLogo 
              teamName={clubName} 
              externalId={externalId}
              size="md"
              className="flex-shrink-0"
            />
            <h2 className="text-xl font-bold text-white">Transaction History</h2>
          </div>
        </DialogHeader>
        
        <div className="mb-4 p-4 bg-gray-700/50 rounded-lg">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <p className="text-gray-400 mb-1">Total Units</p>
              <p className="font-bold text-white">{formatNumber(totalUnits)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 mb-1">Total Invested</p>
              <p className="font-bold text-white">{formatCurrency(totalInvested)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 mb-1">Average Price</p>
              <p className="font-bold text-white">{formatCurrency(avgPrice)}</p>
            </div>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-800">
              <tr className="border-b border-gray-600">
                <th className="text-left p-2">Date</th>
                <th className="text-center p-2">Type</th>
                <th className="text-right p-2">Units</th>
                <th className="text-right p-2">Price/Unit</th>
                <th className="text-right p-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="border-b border-gray-700">
                  <td className="p-2">{transaction.date}</td>
                  <td className="p-2 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      transaction.orderType === 'BUY' 
                        ? 'bg-green-900/30 text-green-400' 
                        : 'bg-red-900/30 text-red-400'
                    }`}>
                      {transaction.orderType === 'BUY' ? 'Buy' : 'Sell'}
                    </span>
                  </td>
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