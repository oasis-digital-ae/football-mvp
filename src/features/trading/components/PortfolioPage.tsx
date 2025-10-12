import React, { useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { AppContext } from '@/features/trading/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { formatCurrency, formatNumber } from '@/shared/lib/formatters';
import TransactionHistoryModal from './TransactionHistoryModal';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { realtimeService } from '@/shared/lib/services/realtime.service';
import { useToast } from '@/shared/hooks/use-toast';

const PortfolioPage: React.FC = () => {
  const { portfolio, getTransactionsByClub } = useContext(AppContext);
  const [selectedClub, setSelectedClub] = useState<{ id: string; name: string } | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

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

  // Realtime portfolio updates
  useEffect(() => {
    if (!user) return;
    
    const channel = realtimeService.subscribeToPortfolio(user.id, (position) => {
      // Show notification when portfolio updates
      toast({
        title: "Portfolio Updated",
        description: "Your portfolio has been updated with the latest changes.",
        duration: 3000,
      });
      
      // Note: The portfolio will be refreshed automatically by the AppContext
      // when the underlying data changes through other realtime subscriptions
    });

    return () => {
      realtimeService.unsubscribe(channel);
    };
  }, [user, toast]);

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
      {/* Portfolio Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Invested */}
        <Card className="trading-card group">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm font-medium mb-2">Total Invested</p>
                <p className="text-2xl font-bold text-white">{formatCurrency(totalInvested)}</p>
              </div>
              <div className="w-12 h-12 bg-gradient-success rounded-full flex items-center justify-center group-hover:animate-bounce-gentle">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Market Value */}
        <Card className="trading-card group">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm font-medium mb-2">Market Value</p>
                <p className="text-2xl font-bold text-white">{formatCurrency(totalMarketValue)}</p>
              </div>
              <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center group-hover:animate-bounce-gentle">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total P&L */}
        <Card className="trading-card group">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm font-medium mb-2">Total P&L</p>
                <p className={`text-2xl font-bold ${totalProfitLoss === 0 ? 'text-gray-400' : totalProfitLoss > 0 ? 'price-positive' : 'price-negative'}`}>
                  {formatCurrency(totalProfitLoss)}
                </p>
                <p className={`text-sm font-medium ${totalProfitLoss === 0 ? 'text-gray-400' : totalProfitLoss > 0 ? 'price-positive' : 'price-negative'}`}>
                  {totalInvested > 0 ? `${((totalProfitLoss / totalInvested) * 100).toFixed(2)}%` : '0.00%'}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center group-hover:animate-bounce-gentle ${
                totalProfitLoss > 0 ? 'bg-gradient-success' : totalProfitLoss < 0 ? 'bg-gradient-danger' : 'bg-gray-600'
              }`}>
                {totalProfitLoss > 0 ? (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17l9.2-9.2M17 17V7H7" />
                  </svg>
                ) : totalProfitLoss < 0 ? (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 7l-9.2 9.2M7 7v10h10" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Portfolio Performance */}
        <Card className="trading-card group">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm font-medium mb-2">Performance</p>
                <p className={`text-2xl font-bold ${totalProfitLoss > 0 ? 'price-positive' : totalProfitLoss < 0 ? 'price-negative' : 'text-gray-400'}`}>
                  {totalProfitLoss > 0 ? '🚀' : totalProfitLoss < 0 ? '📉' : '➖'}
                </p>
                <p className="text-sm font-medium text-gray-300">
                  {portfolio.length} {portfolio.length === 1 ? 'Position' : 'Positions'}
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-slate rounded-full flex items-center justify-center group-hover:animate-bounce-gentle">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Holdings Table */}
      <Card className="trading-card">
        <CardHeader>
          <CardTitle className="text-white text-xl flex items-center space-x-2">
            <svg className="w-5 h-5 text-trading-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Holdings</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {portfolio.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
              <p className="text-gray-400 text-lg font-medium mb-2">No holdings yet</p>
              <p className="text-gray-500 text-sm">Start building your portfolio by buying club shares!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-white">
                <thead>
                  <tr className="border-b border-gray-700/50">
                    <th className="text-left p-4 font-semibold text-gray-300">Club</th>
                    <th className="text-right p-4 font-semibold text-gray-300">Units</th>
                    <th className="text-right p-4 font-semibold text-gray-300">Avg Price</th>
                    <th className="text-right p-4 font-semibold text-gray-300">Current Price</th>
                    <th className="text-right p-4 font-semibold text-gray-300">% Change</th>
                    <th className="text-right p-4 font-semibold text-gray-300">Total Value</th>
                    <th className="text-right p-4 font-semibold text-gray-300">% Portfolio</th>
                    <th className="text-right p-4 font-semibold text-gray-300">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {useMemo(() => portfolio.map((item) => {
                    const percentChange = ((item.currentPrice - item.purchasePrice) / item.purchasePrice) * 100;
                    const portfolioPercent = totalMarketValue > 0 ? (item.totalValue / totalMarketValue) * 100 : 0;
                    
                    return (
                      <tr 
                        key={item.clubId} 
                        className="border-b border-gray-700/30 hover:bg-gray-700/30 cursor-pointer transition-colors duration-200 group"
                        onClick={() => handleClubClick(item.clubId, item.clubName)}
                      >
                        <td className="p-4 font-medium group-hover:text-trading-primary transition-colors duration-200">
                          {item.clubName}
                        </td>
                        <td className="p-4 text-right font-mono">{formatNumber(item.units)}</td>
                        <td className="p-4 text-right font-mono">{formatCurrency(item.purchasePrice)}</td>
                        <td className="p-4 text-right font-mono">{formatCurrency(item.currentPrice)}</td>
                        <td className={`p-4 text-right font-semibold ${percentChange === 0 ? 'text-gray-400' : percentChange > 0 ? 'price-positive' : 'price-negative'}`}>
                          {percentChange > 0 ? '+' : ''}{percentChange.toFixed(2)}%
                        </td>
                        <td className="p-4 text-right font-mono">{formatCurrency(item.totalValue)}</td>
                        <td className="p-4 text-right font-semibold text-trading-primary">{portfolioPercent.toFixed(1)}%</td>
                        <td className={`p-4 text-right font-semibold ${item.profitLoss === 0 ? 'text-gray-400' : item.profitLoss > 0 ? 'price-positive' : 'price-negative'}`}>
                          {item.profitLoss > 0 ? '+' : ''}{formatCurrency(item.profitLoss)}
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