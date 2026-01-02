import React, { useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { AppContext } from '@/features/trading/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { formatCurrency, formatNumber } from '@/shared/lib/formatters';
import TransactionHistoryModal from './TransactionHistoryModal';
import { SellConfirmationModal } from './SellConfirmationModal';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { realtimeService } from '@/shared/lib/services/realtime.service';
import { useToast } from '@/shared/hooks/use-toast';
import { Button } from '@/shared/components/ui/button';
import {
  calculatePercentChange,
  calculatePortfolioPercentage
} from '@/shared/lib/utils/calculations';

const PortfolioPage: React.FC = () => {
  const { portfolio, getTransactionsByClub, sellClub, clubs } = useContext(AppContext);
  const [selectedClub, setSelectedClub] = useState<{ id: string; name: string } | null>(null);
  const [sellModalData, setSellModalData] = useState<{
    clubId: string;
    clubName: string;
    externalId?: number;
    pricePerShare: number;
    currentQuantity: number;
  } | null>(null);
  const [isSelling, setIsSelling] = useState(false);
  const { user, profile } = useAuth();
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

  const handleSellClick = useCallback((e: React.MouseEvent, item: typeof portfolio[0]) => {
    e.stopPropagation(); // Prevent row click from opening transaction history
    
    // Find club to get external_id
    const club = clubs.find(c => c.id === item.clubId);
    
    setSellModalData({
      clubId: item.clubId,
      clubName: item.clubName,
      externalId: club?.externalId ? parseInt(club.externalId) : undefined,
      pricePerShare: item.currentPrice,
      currentQuantity: item.units
    });
  }, [clubs]);

  const handleCloseSellModal = useCallback(() => {
    setSellModalData(null);
  }, []);

  const handleConfirmSell = useCallback(async (shares: number) => {
    if (!sellModalData) return;
    
    setIsSelling(true);
    try {
      await sellClub(sellModalData.clubId, shares);
      setSellModalData(null);
    } catch (error: any) {
      toast({
        title: "Sale Failed",
        description: error.message || "An error occurred while selling shares",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsSelling(false);
    }
  }, [sellModalData, sellClub, toast]);

  // Memoized portfolio table rows
  const memoizedPortfolioRows = useMemo(() => portfolio.map((item) => {
    // Since total_invested = ROUND(price, 2) * quantity, purchasePrice should equal currentPrice exactly
    // when prices haven't changed, so percentChange should be exactly 0
    const percentChange = calculatePercentChange(item.currentPrice, item.purchasePrice);
    const portfolioPercent = calculatePortfolioPercentage(item.totalValue, totalMarketValue);
    
    return (
      <tr 
        key={item.clubId} 
        className="border-b border-gray-700/30 hover:bg-gray-700/30 cursor-pointer transition-colors duration-200 group"
        onClick={() => handleClubClick(item.clubId, item.clubName)}
      >
        <td className="px-3 font-medium group-hover:text-trading-primary transition-colors duration-200">
          {item.clubName}
        </td>
        <td className="px-3 text-right font-mono">{formatNumber(item.units)}</td>
        <td className="px-3 text-right font-mono">{formatCurrency(item.purchasePrice)}</td>
        <td className="px-3 text-right font-mono">{formatCurrency(item.currentPrice)}</td>
        <td className={`px-3 text-right font-semibold ${percentChange === 0 ? 'text-gray-400' : percentChange > 0 ? 'price-positive' : 'price-negative'}`}>
          {percentChange > 0 ? '+' : ''}{percentChange.toFixed(2)}%
        </td>
        <td className="px-3 text-right font-mono">{formatCurrency(item.totalValue)}</td>
        <td className="px-3 text-right font-semibold text-trading-primary">{portfolioPercent.toFixed(2)}%</td>
        <td className={`px-3 text-right font-semibold ${item.profitLoss === 0 ? 'text-gray-400' : item.profitLoss > 0 ? 'price-positive' : 'price-negative'}`}>
          {item.profitLoss > 0 ? '+' : ''}{formatCurrency(item.profitLoss)}
        </td>
        <td className="px-3 text-center" onClick={(e) => handleSellClick(e, item)}>
          <Button
            size="sm"
            variant="outline"
            className="bg-gradient-danger hover:bg-gradient-danger/80 text-white border-danger hover:border-danger/80 font-semibold"
            onClick={(e) => handleSellClick(e, item)}
          >
            Sell
          </Button>
        </td>
      </tr>
    );
  }), [portfolio, totalMarketValue, handleClubClick, handleSellClick]);

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
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4 lg:space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Welcome Header - Mobile Optimized */}
      {profile && (profile.first_name || profile.full_name) && (
        <div className="mb-1 sm:mb-2">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold">Welcome, {profile.first_name || (profile.full_name ? profile.full_name.split(' ')[0] : 'User')}</h1>
        </div>
      )}
      
      {/* Portfolio Overview Cards - Mobile Optimized */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3 lg:gap-4">
        {/* Total Invested */}
        <Card className="trading-card group">
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs sm:text-sm font-medium mb-1 sm:mb-2">Total Invested</p>
                <p className="text-lg sm:text-xl lg:text-2xl font-bold text-white">{formatCurrency(totalInvested)}</p>
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
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs sm:text-sm font-medium mb-1 sm:mb-2">Market Value</p>
                <p className="text-lg sm:text-xl lg:text-2xl font-bold text-white">{formatCurrency(totalMarketValue)}</p>
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
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs sm:text-sm font-medium mb-1 sm:mb-2">Total P&L</p>
                <p className={`text-lg sm:text-xl lg:text-2xl font-bold ${totalProfitLoss === 0 ? 'text-gray-400' : totalProfitLoss > 0 ? 'price-positive' : 'price-negative'}`}>
                  {formatCurrency(totalProfitLoss)}
                </p>
                <p className={`text-xs sm:text-sm font-medium ${totalProfitLoss === 0 ? 'text-gray-400' : totalProfitLoss > 0 ? 'price-positive' : 'price-negative'}`}>
                  {totalInvested > 0 ? `${calculatePercentChange(totalProfitLoss + totalInvested, totalInvested).toFixed(1)}%` : '0.0%'}
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
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto w-full max-w-full">
                <table className="trading-table w-full">
                  <thead>
                    <tr>
                      <th className="text-left px-3">Club</th>
                      <th className="text-right px-3">Units</th>
                      <th className="text-right px-3">Avg Price</th>
                      <th className="text-right px-3">Current Price</th>
                      <th className="text-right px-3">% Change</th>
                      <th className="text-right px-3">Total Value</th>
                      <th className="text-right px-3">% Portfolio</th>
                      <th className="text-right px-3">P&L</th>
                      <th className="text-center px-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memoizedPortfolioRows}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Layout - Optimized */}
              <div className="md:hidden space-y-2.5">
                {portfolio.map((item) => {
                  const percentChange = calculatePercentChange(item.currentPrice, item.purchasePrice);
                  const portfolioPercent = calculatePortfolioPercentage(item.totalValue, totalMarketValue);
                  const profitLoss = item.totalValue - (item.purchasePrice * item.units);
                  
                  return (
                    <div
                      key={item.clubId}
                      onClick={() => handleClubClick(item.clubId, item.clubName)}
                      className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/30 active:bg-gray-700/50 transition-colors touch-manipulation"
                    >
                      <div className="flex items-start justify-between mb-2.5">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-semibold text-sm mb-1 truncate">{item.clubName}</h3>
                          <div className="flex items-center gap-2 text-[10px] text-gray-500">
                            <span>{item.units} units</span>
                            <span>•</span>
                            <span>{portfolioPercent.toFixed(1)}%</span>
                          </div>
                        </div>
                        <Button
                          onClick={(e) => handleSellClick(e, item)}
                          size="sm"
                          className="bg-red-600 hover:bg-red-700 text-white text-[11px] px-3 py-2 min-h-[44px] touch-manipulation"
                        >
                          Sell
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 mb-2.5">
                        <div className="bg-gray-700/20 rounded p-2">
                          <div className="text-[9px] text-gray-500 mb-0.5 uppercase tracking-wide">Avg Price</div>
                          <div className="text-white font-mono font-semibold text-xs">{formatCurrency(item.purchasePrice)}</div>
                        </div>
                        <div className="bg-gray-700/20 rounded p-2">
                          <div className="text-[9px] text-gray-500 mb-0.5 uppercase tracking-wide">Current</div>
                          <div className="text-white font-mono font-semibold text-xs">{formatCurrency(item.currentPrice)}</div>
                        </div>
                      </div>
                      
                      <div className="pt-2.5 border-t border-gray-700/20">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-[9px] text-gray-500 mb-0.5 uppercase tracking-wide">Total Value</div>
                            <div className="text-white font-bold text-base sm:text-lg">{formatCurrency(item.totalValue)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[9px] text-gray-500 mb-0.5 uppercase tracking-wide">P&L</div>
                            <div className={`font-bold text-sm sm:text-base ${profitLoss === 0 ? 'text-gray-400' : profitLoss > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {profitLoss > 0 ? '+' : ''}{formatCurrency(profitLoss)}
                            </div>
                            <div className={`text-[10px] font-medium ${percentChange === 0 ? 'text-gray-500' : percentChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
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

      {sellModalData && (
        <SellConfirmationModal
          isOpen={!!sellModalData}
          onClose={handleCloseSellModal}
          onConfirm={handleConfirmSell}
          clubName={sellModalData.clubName}
          clubId={sellModalData.clubId}
          externalId={sellModalData.externalId}
          pricePerShare={sellModalData.pricePerShare}
          currentQuantity={sellModalData.currentQuantity}
          isProcessing={isSelling}
        />
      )}
    </div>
  );
};

export default PortfolioPage;