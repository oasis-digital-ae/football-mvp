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
import { toDecimal, roundForDisplay, fromCents } from '@/shared/lib/utils/decimal';
import TeamLogo from '@/shared/components/TeamLogo';
import ClickableTeamName from '@/shared/components/ClickableTeamName';
import { supabase } from '@/shared/lib/supabase';
import { calculatePriceImpactPercent } from '@/shared/lib/utils/calculations';

const PortfolioPage: React.FC = () => {
  const { portfolio, getTransactionsByClub, sellClub, clubs } = useContext(AppContext);
  const [matchdayChanges, setMatchdayChanges] = useState<Map<string, number>>(new Map());
  const [selectedClub, setSelectedClub] = useState<{ id: string; name: string; externalId?: number } | null>(null);
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

  // Load latest match result percentages for each club
  useEffect(() => {
    const loadMatchdayChanges = async () => {
      if (clubs.length === 0) return;

      try {
        const teamIds = clubs.map(c => parseInt(c.id));
        const changesMap = new Map<string, number>();

        const { data: ledgerData } = await supabase
          .from('total_ledger')
          .select('team_id, market_cap_before, market_cap_after, event_date')
          .in('team_id', teamIds)
          .in('ledger_type', ['match_win', 'match_loss', 'match_draw'])
          .order('event_date', { ascending: false });

        const latestMatches = new Map<number, { marketCapBefore: number; marketCapAfter: number }>();
        
        (ledgerData || []).forEach(entry => {
          const teamId = entry.team_id;
          if (!latestMatches.has(teamId) && entry.market_cap_before && entry.market_cap_after) {
            latestMatches.set(teamId, {
              marketCapBefore: roundForDisplay(fromCents(entry.market_cap_before || 0)),
              marketCapAfter: roundForDisplay(fromCents(entry.market_cap_after || 0))
            });
          }
        });

        latestMatches.forEach((match, teamId) => {
          const percentChange = calculatePriceImpactPercent(match.marketCapAfter, match.marketCapBefore);
          changesMap.set(teamId.toString(), percentChange);
        });

        setMatchdayChanges(changesMap);
      } catch (error) {
        console.error('Error loading matchday changes:', error);
      }
    };

    loadMatchdayChanges();
  }, [clubs]);

  // Memoized KPI calculations
  const { totalInvested, totalMarketValue, totalProfitLoss } = useMemo(() => {
    // Calculate net invested and P&L from transactions for each portfolio item
    // Use Decimal for precision to prevent rounding drift
    let invested = toDecimal(0);
    let profitLoss = toDecimal(0);
    
    portfolio.forEach((item) => {
      const transactions = getTransactionsByClub(item.clubId);
      // Calculate net invested: total BUY - total SELL (using Decimal precision)
      const netInvested = transactions.reduce((sum, t) => {
        const value = toDecimal(t.totalValue);
        return t.orderType === 'BUY' ? sum.plus(value) : sum.minus(value);
      }, toDecimal(0));
      
      // Calculate P&L: current value - net invested
      // This includes both unrealized P&L (from current holdings) and realized P&L (from sales)
      const currentValueDecimal = toDecimal(item.totalValue);
      const itemProfitLoss = currentValueDecimal.minus(netInvested);
      
      invested = invested.plus(netInvested);
      profitLoss = profitLoss.plus(itemProfitLoss);
    });
    
    const marketValue = portfolio.reduce((sum, item) => {
      return sum.plus(toDecimal(item.totalValue));
    }, toDecimal(0));
    
    return {
      totalInvested: roundForDisplay(invested),
      totalMarketValue: roundForDisplay(marketValue),
      totalProfitLoss: roundForDisplay(profitLoss)
    };
  }, [portfolio, getTransactionsByClub]);

  const handleClubClick = useCallback((clubId: string, clubName: string) => {
    const club = clubs.find(c => c.id === clubId);
    setSelectedClub({ 
      id: clubId, 
      name: clubName,
      externalId: club?.externalId ? parseInt(club.externalId) : undefined
    });
  }, [clubs]);

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
    // Calculate average price from transactions: net invested / total units
    // Use Decimal for precision to prevent rounding drift
    const transactions = getTransactionsByClub(item.clubId);
    const netInvested = transactions.reduce((sum, t) => {
      const value = toDecimal(t.totalValue);
      return t.orderType === 'BUY' ? sum.plus(value) : sum.minus(value);
    }, toDecimal(0));
    const totalUnitsFromTransactions = transactions.reduce((sum, t) => {
      const units = toDecimal(t.units);
      return t.orderType === 'BUY' ? sum.plus(units) : sum.minus(units);
    }, toDecimal(0));
    
    // Calculate average price using Decimal precision, round only at display
    const avgPrice = totalUnitsFromTransactions.gt(0) 
      ? roundForDisplay(netInvested.dividedBy(totalUnitsFromTransactions))
      : 0;
    
    // Calculate P&L: current value - net invested (includes both unrealized and realized P&L)
    // Use Decimal for precision
    const currentValueDecimal = toDecimal(item.totalValue);
    const profitLoss = roundForDisplay(currentValueDecimal.minus(netInvested));
    
    // Calculate percentage change: (Current Price - Avg Price) / Avg Price * 100
    // This shows the change from the user's average purchase price to the current price
    let percentChange = calculatePercentChange(item.currentPrice, avgPrice);
    // Round very small changes to 0.00% to avoid showing "+0.03%" when it should be "0.00%"
    // This handles floating point precision issues where prices are effectively the same
    if (Math.abs(percentChange) < 0.01) {
      percentChange = 0;
    }
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
        <td className="px-3 text-right font-mono">{formatCurrency(avgPrice)}</td>
        <td className="px-3 text-right font-mono">{formatCurrency(item.currentPrice)}</td>
        <td className={`px-3 text-right font-semibold ${percentChange === 0 ? 'text-gray-400' : percentChange > 0 ? 'price-positive' : 'price-negative'}`}>
          {percentChange > 0 ? '+' : ''}{percentChange.toFixed(2)}%
        </td>
        <td className="px-3 text-right font-mono">{formatCurrency(item.totalValue)}</td>
        <td className="px-3 text-right font-semibold text-trading-primary">{portfolioPercent.toFixed(2)}%</td>
        <td className={`px-3 text-right font-semibold ${profitLoss === 0 ? 'text-gray-400' : profitLoss > 0 ? 'price-positive' : 'price-negative'}`}>
          {profitLoss > 0 ? '+' : ''}{formatCurrency(profitLoss)}
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
  }), [portfolio, clubs, totalMarketValue, handleClubClick, handleSellClick, getTransactionsByClub, matchdayChanges]);

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
    <div className="md:p-3 md:sm:p-4 lg:p-6 space-y-3 sm:space-y-4 md:space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Welcome Header - Mobile Optimized */}
      {profile && (profile.first_name || profile.full_name) && (
        <div className="mb-1 sm:mb-2 px-3 md:px-0">
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
      <Card className="trading-card md:rounded-lg">
        <CardHeader className="hidden md:block">
          <CardTitle className="text-white text-xl flex items-center space-x-2">
            <svg className="w-5 h-5 text-trading-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Holdings</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {portfolio.length === 0 ? (
            <div className="text-center py-12 px-3">
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

              {/* Mobile Table Layout - Compact Premier League Style */}
              <div className="md:hidden -mx-3 sm:-mx-4">
                {/* Mobile Table Header */}
                <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700/50">
                  <div className="grid grid-cols-[1fr_40px_55px_50px_70px_45px] gap-1.5 px-3 py-2 text-[10px] font-semibold text-gray-400 items-center">
                    <div className="text-left">Team</div>
                    <div className="text-center">Units</div>
                    <div className="text-center">Price</div>
                    <div className="text-center">%</div>
                    <div className="text-center">Value</div>
                    <div className="text-center">Sell</div>
                  </div>
                </div>

                {/* Mobile Table Rows */}
                <div className="space-y-0">
                  {portfolio.map((item) => {
                    // Find club to get external_id
                    const club = clubs.find(c => c.id === item.clubId);
                    
                    // Calculate average price from transactions: net invested / total units
                    // Use Decimal for precision to prevent rounding drift
                    const transactions = getTransactionsByClub(item.clubId);
                    const netInvested = transactions.reduce((sum, t) => {
                      const value = toDecimal(t.totalValue);
                      return t.orderType === 'BUY' ? sum.plus(value) : sum.minus(value);
                    }, toDecimal(0));
                    const totalUnitsFromTransactions = transactions.reduce((sum, t) => {
                      const units = toDecimal(t.units);
                      return t.orderType === 'BUY' ? sum.plus(units) : sum.minus(units);
                    }, toDecimal(0));
                    
                    // Calculate average price using Decimal precision, round only at display
                    const avgPrice = totalUnitsFromTransactions.gt(0) 
                      ? roundForDisplay(netInvested.dividedBy(totalUnitsFromTransactions))
                      : 0;
                    
                    // Calculate P&L: current value - net invested (includes both unrealized and realized P&L)
                    // Use Decimal for precision
                    const currentValueDecimal = toDecimal(item.totalValue);
                    const profitLoss = roundForDisplay(currentValueDecimal.minus(netInvested));
                    
                    // Calculate percentage change: (Current Price - Avg Price) / Avg Price * 100
                    // This shows the change from the user's average purchase price to the current price
                    let percentChange = calculatePercentChange(item.currentPrice, avgPrice);
                    // Round very small changes to 0.00% to avoid showing "+0.03%" when it should be "0.00%"
                    // This handles floating point precision issues where prices are effectively the same
                    if (Math.abs(percentChange) < 0.01) {
                      percentChange = 0;
                    }
                    
                    return (
                      <div
                        key={item.clubId}
                        className="border-b border-gray-700/30 last:border-b-0"
                      >
                        <div className="grid grid-cols-[1fr_40px_55px_50px_70px_45px] gap-1.5 px-3 py-2 items-center active:bg-gray-700/30 transition-colors touch-manipulation">
                          {/* Team */}
                          <div className="flex items-center gap-1 min-w-0 flex-1">
                            <div className="flex-shrink-0">
                              <TeamLogo 
                                teamName={item.clubName} 
                                externalId={club?.externalId ? parseInt(club.externalId) : undefined}
                                size="sm" 
                              />
                            </div>
                            <button
                              onClick={() => handleClubClick(item.clubId, item.clubName)}
                              className="flex items-center min-w-0 flex-1 hover:text-trading-primary transition-colors text-left"
                            >
                              <span className="text-[11px] font-medium text-white truncate block">{item.clubName}</span>
                            </button>
                          </div>
                          
                          {/* Units */}
                          <div className="text-center text-[11px] font-medium text-gray-400 flex-shrink-0">
                            {formatNumber(item.units)}
                          </div>
                          
                          {/* Current Price */}
                          <div className="text-center font-mono font-semibold text-[11px] text-white flex-shrink-0 whitespace-nowrap">
                            {formatCurrency(item.currentPrice)}
                          </div>
                          
                          {/* % Change */}
                          <div className={`text-center text-[11px] font-semibold flex-shrink-0 ${
                            percentChange === 0 ? 'text-gray-400' : percentChange > 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%
                          </div>
                          
                          {/* Total Value */}
                          <div className="text-center font-mono font-semibold text-[11px] text-white flex-shrink-0 whitespace-nowrap">
                            {formatCurrency(item.totalValue)}
                          </div>
                          
                          {/* Sell Button */}
                          <div className="flex justify-center flex-shrink-0">
                            <Button
                              onClick={(e) => handleSellClick(e, item)}
                              size="sm"
                              className="bg-red-600 hover:bg-red-700 text-white font-medium px-1.5 py-0.5 text-[8px] rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation h-[18px] w-auto min-w-[32px] flex items-center justify-center"
                            >
                              Sell
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {selectedClub && (() => {
        const portfolioItem = portfolio.find(p => p.clubId === selectedClub.id);
        return (
          <TransactionHistoryModal
            isOpen={!!selectedClub}
            onClose={handleCloseModal}
            clubName={selectedClub.name}
            clubId={selectedClub.id}
            externalId={selectedClub.externalId}
            transactions={getTransactionsByClub(selectedClub.id)}
            averagePrice={portfolioItem?.purchasePrice}
          />
        );
      })()}

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