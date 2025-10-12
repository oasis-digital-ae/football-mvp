import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { formatCurrency, formatPercent } from '@/shared/lib/formatters';
import { PurchaseConfirmationModal } from './PurchaseConfirmationModal';
import ClickableTeamName from '@/shared/components/ClickableTeamName';
import TeamLogo from '@/shared/components/TeamLogo';
import TeamDetailsSlideDown from './TeamDetailsSlideDown';
import { fixturesService } from '@/shared/lib/database';
import type { DatabaseFixture } from '@/shared/lib/database';
import { FixtureSync } from './FixtureSync';
import { TeamSync } from './TeamSync';
import { useToast } from '@/shared/hooks/use-toast';
import { ChevronDown, ChevronUp, Activity, Users } from 'lucide-react';
import { useRealtimeMarket } from '@/shared/hooks/useRealtimeMarket';
import { useRealtimeOrders } from '@/shared/hooks/useRealtimeOrders';
import { useRealtimePresence } from '@/shared/hooks/useRealtimePresence';

export const ClubValuesPage: React.FC = () => {
  const { clubs, matches, purchaseClub, user } = useAppContext();
  const { toast } = useToast();
  const [selectedClub, setSelectedClub] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState<DatabaseFixture[]>([]);
  const [confirmationData, setConfirmationData] = useState<{
    clubId: string;
    clubName: string;
    externalId?: number;
    pricePerShare: number;
  } | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchasingClubId, setPurchasingClubId] = useState<string | null>(null);

  // Realtime subscriptions
  const { lastUpdate, isConnected: marketConnected } = useRealtimeMarket();
  const { recentOrders, isConnected: ordersConnected, clearOrders } = useRealtimeOrders();
  const { activeUsers, isConnected: presenceConnected } = useRealtimePresence('marketplace');

  // Load fixtures on component mount and when clubs change
  useEffect(() => {
    loadFixtures();
  }, [clubs]); // Refresh fixtures when clubs data changes (e.g., after simulation)

  // Show toast when market updates
  useEffect(() => {
    if (lastUpdate) {
      toast({
        title: "Market Update",
        description: `${lastUpdate.team.name} price updated!`,
        duration: 3000,
      });
    }
  }, [lastUpdate, toast]);

  // Show toast when new orders come in
  useEffect(() => {
    if (recentOrders.length > 0) {
      const latestOrder = recentOrders[0];
      toast({
        title: "New Trade",
        description: `${latestOrder.order.quantity} shares traded`,
        duration: 2000,
      });
    }
  }, [recentOrders.length, toast]);

  const loadFixtures = async () => {
    try {
      const fixturesData = await fixturesService.getAll();
      setFixtures(fixturesData);
    } catch (error) {
      console.error('Error loading fixtures:', error);
    }
  };

  // Expose refresh function for external components to call
  const refreshFixtures = async () => {
    await loadFixtures();
  };

  // Make refreshFixtures available globally for simulation components
  useEffect(() => {
    (window as any).refreshClubValuesFixtures = refreshFixtures;
    return () => {
      delete (window as any).refreshClubValuesFixtures;
    };
  }, []);

  // Memoized function to count games played for a club using fixture data
  // Only counts fixtures that have been simulated (not synced from API)
  const getGamesPlayed = useCallback((clubId: string): number => {
    // OPTIMIZED: Pre-filter fixtures once instead of filtering for each club
    const clubIdInt = parseInt(clubId);
    return fixtures.filter(fixture => 
      (fixture.home_team_id === clubIdInt || fixture.away_team_id === clubIdInt) &&
      fixture.status === 'applied' && 
      fixture.result !== 'pending' &&
      // Only count fixtures that have snapshot data (indicating they were simulated)
      fixture.snapshot_home_cap !== null &&
      fixture.snapshot_away_cap !== null
    ).length;
  }, [fixtures]);
  // Function to get the latest ending value for a club from matches
  const getLatestClubValue = (clubName: string, launchValue: number): number => {
    // Find all matches where this club participated
    const clubMatches = matches.filter(match => 
      match.homeTeam === clubName || match.awayTeam === clubName
    );
    
    if (clubMatches.length === 0) {
      return launchValue; // No matches, return launch value
    }
    
    // Get the most recent match (first in array since matches are sorted newest first)
    const latestMatch = clubMatches[0];
    return latestMatch.homeTeam === clubName ? latestMatch.homeEndValue : latestMatch.awayEndValue;
  };

  const handleTeamClick = useCallback((clubId: string) => {
    setSelectedClub(selectedClub === clubId ? null : clubId);
  }, [selectedClub]);

  // Memoize the teams data to prevent unnecessary re-renders
  const memoizedTeams = useMemo(() => {
    const now = new Date().toISOString(); // Create date once per render
    return clubs.map(c => ({
      id: parseInt(c.id),
      external_id: c.externalId ? parseInt(c.externalId) : null,
      name: c.name,
      short_name: c.name,
      logo_url: null,
      initial_market_cap: c.launchPrice * c.sharesOutstanding,
      market_cap: c.marketCap,
      total_shares: c.sharesOutstanding,
      available_shares: c.sharesOutstanding,
      shares_outstanding: c.sharesOutstanding,
      is_tradeable: true,
      created_at: now,
      updated_at: now,
      launch_price: c.launchPrice
    }));
  }, [clubs]);

  const handlePurchaseClick = useCallback((clubId: string) => {
    // Prevent multiple clicks while a purchase is in progress
    if (isPurchasing) return;
    
    const club = clubs.find(c => c.id === clubId);
    if (!club) return;
    
    const pricePerShare = club.currentValue; // Use actual current value (NAV)
    
    setConfirmationData({
      clubId,
      clubName: club.name,
      externalId: club.externalId ? parseInt(club.externalId) : undefined,
      pricePerShare
    });
  }, [clubs, isPurchasing]);
  
  const confirmPurchase = useCallback(async (shares: number) => {
    if (!confirmationData || isPurchasing) return;
    
    setIsPurchasing(true);
    setPurchasingClubId(confirmationData.clubId);
    
    try {
      await purchaseClub(confirmationData.clubId, shares);
      setConfirmationData(null);
      toast({
        title: "Purchase Successful",
        description: `Successfully purchased ${shares} shares of ${confirmationData.clubName}`,
      });
    } catch (error: any) {
      console.error('Purchase failed:', error);
      toast({
        title: "Purchase Failed",
        description: error?.message || 'An unknown error occurred',
        variant: "destructive",
      });
    } finally {
      setIsPurchasing(false);
      setPurchasingClubId(null);
    }
  }, [confirmationData, purchaseClub, toast, isPurchasing]);

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white gradient-text">Live Market</h1>
          <p className="text-gray-400 mt-1 text-sm sm:text-base">Trade Premier League club shares in real-time</p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-400">
          <div className="w-2 h-2 bg-trading-primary rounded-full animate-pulse"></div>
          <span>Live Updates</span>
        </div>
      </div>

      {/* Market Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <Card className="trading-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-gray-400 text-xs sm:text-sm font-medium truncate">Total Market Cap</p>
                <p className="text-lg sm:text-xl font-bold text-white truncate">
                  {formatCurrency(clubs.reduce((sum, club) => sum + Number(club.marketCap), 0))}
                </p>
              </div>
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-primary rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="trading-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-gray-400 text-xs sm:text-sm font-medium truncate">Active Clubs</p>
                <p className="text-lg sm:text-xl font-bold text-white">{clubs.length}</p>
              </div>
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-slate rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="trading-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-gray-400 text-xs sm:text-sm font-medium truncate">Top Performer</p>
                <p className="text-sm sm:text-lg font-bold text-white truncate">
                  {clubs.length > 0 ? clubs.sort((a, b) => b.percentChange - a.percentChange)[0]?.name : 'N/A'}
                </p>
                <p className="text-xs sm:text-sm text-trading-success font-semibold">
                  {clubs.length > 0 ? `+${clubs.sort((a, b) => b.percentChange - a.percentChange)[0]?.percentChange.toFixed(2)}%` : ''}
                </p>
              </div>
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-success rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Marketplace Table */}
      <Card className="trading-card">
        <CardHeader>
          <CardTitle className="text-white text-xl flex items-center space-x-2">
            <svg className="w-5 h-5 text-trading-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span>Club Rankings</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-white">
              <thead>
                <tr className="border-b border-gray-700/50">
                  <th className="text-left p-4 font-semibold text-gray-300">#</th>
                  <th className="text-left p-4 font-semibold text-gray-300">Club</th>
                  <th className="text-center p-4 font-semibold text-gray-300">Games</th>
                  <th className="text-right p-4 font-semibold text-gray-300">Launch</th>
                  <th className="text-right p-4 font-semibold text-gray-300">Current</th>
                  <th className="text-right p-4 font-semibold text-gray-300">P/L</th>
                  <th className="text-right p-4 font-semibold text-gray-300">Change</th>
                  <th className="text-right p-4 font-semibold text-gray-300">Market Cap</th>
                  <th className="text-center p-4 font-semibold text-gray-300">Shares</th>
                  <th className="text-center p-4 font-semibold text-gray-300">Action</th>
                </tr>
              </thead>
              <tbody>
                {useMemo(() => clubs
                  .map(club => {
                    const launchPrice = Number(club.launchValue) || 20; // Use actual launch value from database, fallback to 20
                    const currentValue = Number(club.currentValue) || 20; // Use actual current value from database, fallback to 20
                    const profitLoss = currentValue - launchPrice;
                    // Use the percentChange already calculated in convertTeamToClub, don't recalculate
                    const percentChange = club.percentChange;
                    const marketCap = Number(club.marketCap) || 100; // Use actual market cap from database, fallback to 100
                    
                    return {
                      ...club,
                      launchPrice,
                      currentValue,
                      profitLoss,
                      percentChange,
                      marketCap
                    };
                  })
                  .sort((a, b) => b.percentChange - a.percentChange), [clubs]) // Sort by percentage gain descending
                  .map((club, index) => (
                    <React.Fragment key={club.id}>
                      <tr className="border-b border-gray-700/30 hover:bg-gray-700/30 transition-colors duration-200 group">
                        <td className="p-4 text-gray-400 font-semibold">{index + 1}</td>
                        <td className="p-4 font-medium">
                          <div className="flex items-center gap-3">
                            <div className="team-logo-container">
                              <TeamLogo 
                                teamName={club.name} 
                                externalId={club.externalId ? parseInt(club.externalId) : undefined}
                                size="md" 
                              />
                            </div>
                            <button
                              onClick={() => handleTeamClick(club.id)}
                              className="hover:text-trading-primary transition-colors duration-200 cursor-pointer text-left flex items-center gap-2 group-hover:text-trading-primary"
                            >
                              <span className="font-semibold">{club.name}</span>
                              <ChevronDown 
                                className={`h-4 w-4 transition-transform duration-280 ease-out ${
                                  selectedClub === club.id ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                          </div>
                        </td>
                        <td 
                          className="p-4 text-center text-trading-primary font-semibold cursor-pointer hover:text-trading-primary-light transition-colors duration-200"
                          onClick={() => handleTeamClick(club.id)}
                        >
                          {getGamesPlayed(club.id)}
                        </td>
                        <td className="p-4 text-right font-mono">{formatCurrency(club.launchPrice)}</td>
                        <td className="p-4 text-right font-mono font-semibold">{formatCurrency(club.currentValue)}</td>
                        <td className={`p-4 text-right font-semibold ${club.profitLoss === 0 ? 'text-gray-400' : club.profitLoss > 0 ? 'price-positive' : 'price-negative'}`}>
                          {club.profitLoss > 0 ? '+' : ''}{formatCurrency(club.profitLoss)}
                        </td>
                        <td className={`p-4 text-right font-semibold ${club.percentChange === 0 ? 'text-gray-400' : club.percentChange > 0 ? 'price-positive' : 'price-negative'}`}>
                          {club.percentChange > 0 ? '+' : ''}{formatPercent(club.percentChange)}
                        </td>
                        <td className="p-4 text-right font-mono">{formatCurrency(club.marketCap)}</td>
                        <td className="p-4 text-center text-trading-primary font-semibold">
                          {club.sharesOutstanding.toLocaleString()}
                        </td>
                        <td className="p-4 text-center">
                          <Button
                            onClick={() => handlePurchaseClick(club.id)}
                            size="sm"
                            disabled={isPurchasing}
                            className="bg-gradient-success hover:bg-gradient-success/80 text-white font-semibold px-4 py-2 rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                          >
                            {isPurchasing && purchasingClubId === club.id ? 'Processing...' : 'Buy'}
                          </Button>
                        </td>
                      </tr>
                      
                      {/* Slide-down panel for team details */}
                      <tr>
                        <td colSpan={10} className="p-0">
                          <TeamDetailsSlideDown
                            isOpen={selectedClub === club.id}
                            teamId={parseInt(club.id)}
                            teamName={club.name}
                            userId={user?.id}
                            fixtures={fixtures}
                            teams={memoizedTeams}
                          />
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}

              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout */}
          <div className="lg:hidden space-y-3">
            {useMemo(() => clubs
              .map(club => {
                const launchPrice = Number(club.launchValue) || 20;
                const currentValue = Number(club.currentValue) || 20;
                const profitLoss = currentValue - launchPrice;
                const percentChange = club.percentChange;
                const marketCap = Number(club.marketCap) || 100;
                
                return {
                  ...club,
                  launchPrice,
                  currentValue,
                  profitLoss,
                  percentChange,
                  marketCap
                };
              })
              .sort((a, b) => b.percentChange - a.percentChange), [clubs])
              .map((club, index) => (
                <div key={club.id} className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/30">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="team-logo-container">
                        <TeamLogo 
                          teamName={club.name} 
                          externalId={club.externalId ? parseInt(club.externalId) : undefined}
                          size="sm" 
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-sm font-medium">#{index + 1}</span>
                          <button
                            onClick={() => handleTeamClick(club.id)}
                            className="hover:text-trading-primary transition-colors duration-200 cursor-pointer text-left flex items-center gap-1"
                          >
                            <span className="font-semibold text-white text-sm">{club.name}</span>
                            <ChevronDown 
                              className={`h-3 w-3 transition-transform duration-280 ease-out ${
                                selectedClub === club.id ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                        </div>
                        <div className="text-xs text-gray-400">
                          {getGamesPlayed(club.id)} games played
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => handlePurchaseClick(club.id)}
                      size="sm"
                      disabled={isPurchasing}
                      className="bg-gradient-success hover:bg-gradient-success/80 text-white font-semibold px-3 py-1 text-xs rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPurchasing && purchasingClubId === club.id ? 'Processing...' : 'Buy'}
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Launch:</span>
                        <span className="text-white font-mono">{formatCurrency(club.launchPrice)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Current:</span>
                        <span className="text-white font-mono font-semibold">{formatCurrency(club.currentValue)}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-400">P/L:</span>
                        <span className={`font-semibold ${club.profitLoss === 0 ? 'text-gray-400' : club.profitLoss > 0 ? 'price-positive' : 'price-negative'}`}>
                          {club.profitLoss > 0 ? '+' : ''}{formatCurrency(club.profitLoss)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Change:</span>
                        <span className={`font-semibold ${club.percentChange === 0 ? 'text-gray-400' : club.percentChange > 0 ? 'price-positive' : 'price-negative'}`}>
                          {club.percentChange > 0 ? '+' : ''}{formatPercent(club.percentChange)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-gray-700/30">
                    <div className="flex justify-between text-xs">
                      <div>
                        <span className="text-gray-400">Market Cap:</span>
                        <span className="text-white font-mono ml-1">{formatCurrency(club.marketCap)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Shares:</span>
                        <span className="text-trading-primary font-semibold ml-1">{club.sharesOutstanding.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Slide-down panel for team details */}
                  <div className="slide-down-panel" data-open={selectedClub === club.id}>
                    <div className="slide-down-panel-inner">
                      <div className="slide-down-panel-content">
                        <TeamDetailsSlideDown
                          isOpen={selectedClub === club.id}
                          teamId={parseInt(club.id)}
                          teamName={club.name}
                          userId={user?.id}
                          fixtures={fixtures}
                          teams={memoizedTeams}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
      
      
      {/* Team Sync Component */}
      <div className="mt-6">
        <TeamSync />
      </div>
      
      {/* Fixture Sync Component */}
      <div className="mt-6">
        <FixtureSync />
      </div>
      
      
      <PurchaseConfirmationModal
        isOpen={confirmationData !== null}
        onClose={() => setConfirmationData(null)}
        onConfirm={confirmPurchase}
        clubName={confirmationData?.clubName || ''}
        clubId={confirmationData?.clubId}
        externalId={confirmationData?.externalId}
        pricePerShare={confirmationData?.pricePerShare || 0}
        isProcessing={isPurchasing}
      />

      {/* Realtime UI Components */}
      
      {/* Live Trade Feed */}
      <div className="fixed bottom-4 right-4 w-80 z-50">
        <Card className="bg-gray-900/95 backdrop-blur-sm border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Activity className={`h-4 w-4 ${ordersConnected ? 'text-green-500 animate-pulse' : 'text-gray-500'}`} />
                <span>Live Trade Feed</span>
                {recentOrders.length > 0 && (
                  <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                    {recentOrders.length}
                  </span>
                )}
              </div>
              {recentOrders.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearOrders}
                  className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                >
                  ×
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {recentOrders.length > 0 ? (
                recentOrders.map((orderItem, idx) => (
                  <div key={idx} className="text-xs bg-gray-800/50 p-2 rounded border border-gray-700/50">
                    <div className="flex justify-between items-center">
                      <span className="text-green-400 font-medium">
                        {orderItem.order.quantity} shares
                      </span>
                      <span className="text-white">
                        {formatCurrency(orderItem.order.price_per_share)}
                      </span>
                    </div>
                    <div className="text-gray-400 text-xs mt-1">
                      {new Date(orderItem.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-gray-400 text-xs text-center py-4">
                  {ordersConnected ? 'Waiting for trades...' : 'Connecting...'}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Users Indicator */}
      <div className="fixed top-4 right-4 z-50">
        <Card className="bg-gray-900/95 backdrop-blur-sm border-gray-700">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-sm">
              <Users className={`h-4 w-4 ${presenceConnected ? 'text-blue-500' : 'text-gray-500'}`} />
              <span className="text-white">
                {activeUsers} active
              </span>
              <div className={`w-2 h-2 rounded-full ${presenceConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Market Connection Status */}
      <div className="fixed bottom-4 left-4 z-50">
        <Card className="bg-gray-900/95 backdrop-blur-sm border-gray-700">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${marketConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-white">
                {marketConnected ? 'Live Market' : 'Connecting...'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
};

export default ClubValuesPage;