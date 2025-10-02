import React, { useContext, useState, useMemo, useCallback } from 'react';
import { AppContext } from '@/features/trading/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { formatCurrency, formatNumber } from '@/shared/lib/formatters';
import TransactionHistoryModal from './TransactionHistoryModal';

const PortfolioPage: React.FC = () => {
  const { portfolio, getTransactionsByClub } = useContext(AppContext);
  const [selectedClub, setSelectedClub] = useState<{ id: string; name: string } | null>(null);

  // Memoized KPI calculations
  const { totalInvested, totalMarketValue, totalProfitLoss } = useMemo(() => {
    const invested = portfolio.reduce((sum, item) => sum + (item.purchasePrice * item.units), 0);
    const marketValue = portfolio.reduce((sum, item) => sum + item.totalValue, 0);
    const profitLoss = marketValue - invested;
    
    return {
      totalInvested: invested,
      totalMarketValue: marketValue,
      totalProfitLoss: profitLoss
    };
  }, [portfolio]);

  const handleClubClick = useCallback((clubId: string, clubName: string) => {
    setSelectedClub({ id: clubId, name: clubName });
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedClub(null);
  }, []);

  return (
    <div className="p-6">
      <Card className="bg-gray-800 border-gray-700 mb-6">
        <CardHeader>
          <CardTitle className="text-white text-2xl">Portfolio Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6 text-white">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">Total Invested</p>
              <p className="text-2xl font-bold text-blue-400">{formatCurrency(totalInvested)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">Market Value</p>
              <p className="text-2xl font-bold text-yellow-400">{formatCurrency(totalMarketValue)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">Total P&L</p>
              <p className={`text-2xl font-bold ${totalProfitLoss === 0 ? 'text-gray-400' : totalProfitLoss > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(totalProfitLoss)}
              </p>
              <p className={`text-sm ${totalProfitLoss === 0 ? 'text-gray-400' : totalProfitLoss > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalInvested > 0 ? `${((totalProfitLoss / totalInvested) * 100).toFixed(2)}%` : '0.00%'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white text-xl">Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          {portfolio.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No holdings yet. Start buying clubs!</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-white">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left p-3">Club</th>
                    <th className="text-right p-3">Units</th>
                    <th className="text-right p-3">Avg Price</th>
                    <th className="text-right p-3">Current Price</th>
                    <th className="text-right p-3">% Change</th>
                    <th className="text-right p-3">Total Value</th>
                    <th className="text-right p-3">% Portfolio</th>
                    <th className="text-right p-3">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {useMemo(() => portfolio.map((item) => {
                    const percentChange = ((item.currentPrice - item.purchasePrice) / item.purchasePrice) * 100;
                    const portfolioPercent = totalMarketValue > 0 ? (item.totalValue / totalMarketValue) * 100 : 0;
                    
                    return (
                      <tr 
                        key={item.clubId} 
                        className="border-b border-gray-700 hover:bg-gray-700 cursor-pointer"
                        onClick={() => handleClubClick(item.clubId, item.clubName)}
                      >
                        <td className="p-3 font-medium">{item.clubName}</td>
                        <td className="p-3 text-right">{formatNumber(item.units)}</td>
                        <td className="p-3 text-right">{formatCurrency(item.purchasePrice)}</td>
                        <td className="p-3 text-right">{formatCurrency(item.currentPrice)}</td>
                        <td className={`p-3 text-right ${percentChange === 0 ? 'text-gray-400' : percentChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {percentChange.toFixed(2)}%
                        </td>
                        <td className="p-3 text-right">{formatCurrency(item.totalValue)}</td>
                        <td className="p-3 text-right text-blue-400">{portfolioPercent.toFixed(1)}%</td>
                        <td className={`p-3 text-right ${item.profitLoss === 0 ? 'text-gray-400' : item.profitLoss > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(item.profitLoss)}
                        </td>
                      </tr>
                    );
                  }), [portfolio, totalMarketValue, handleClubClick])}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedClub && (
        <TransactionHistoryModal
          isOpen={!!selectedClub}
          onClose={handleCloseModal}
          clubName={selectedClub.name}
          transactions={getTransactionsByClub(selectedClub.id)}
        />
      )}
    </div>
  );
};

export default PortfolioPage;