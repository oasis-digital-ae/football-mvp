import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { formatCurrency, formatPercent, formatNumber } from '@/shared/lib/formatters';
import { PurchaseConfirmationModal } from './PurchaseConfirmationModal';
import ClickableTeamName from '@/shared/components/ClickableTeamName';
import TeamLogo from '@/shared/components/TeamLogo';
import TeamDetailsSlideDown from './TeamDetailsSlideDown';
import { fixturesService } from '@/shared/lib/database';
import type { DatabaseFixture } from '@/shared/lib/database';
import { FixtureSync } from './FixtureSync';
import { TeamSync } from './TeamSync';
import { useToast } from '@/shared/hooks/use-toast';
import { ChevronDown, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useRealtimeMarket } from '@/shared/hooks/useRealtimeMarket';
import { useRealtimeOrders } from '@/shared/hooks/useRealtimeOrders';
import BuyWindowIndicator from '@/shared/components/BuyWindowIndicator';
import { buyWindowService } from '@/shared/lib/buy-window.service';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { supabase } from '@/shared/lib/supabase';
import {
  calculateMatchdayPercentChange,
  calculateLifetimePercentChange,
  calculateProfitLoss
} from '@/shared/lib/utils/calculations';
import { toDecimal, roundForDisplay } from '@/shared/lib/utils/decimal';

export const ClubValuesPage: React.FC = () => {
  const { clubs, matches, purchaseClub, user, refreshData } = useAppContext();
  const { toast } = useToast();
  const { refreshWalletBalance, isAdmin } = useAuth();
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
  const [buyWindowStatuses, setBuyWindowStatuses] = useState<Map<string, any>>(new Map());
  const [sortField, setSortField] = useState<'name' | 'price' | 'change' | 'marketCap'>('change');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [matchdayChanges, setMatchdayChanges] = useState<Map<string, { change: number; percentChange: number }>>(new Map());

  // Realtime subscriptions (for toast notifications)
  const { lastUpdate } = useRealtimeMarket();
  const { recentOrders } = useRealtimeOrders();

  // Load fixtures only on component mount - fixtures don't change frequently
  // Don't reload every time clubs change (that causes excessive DB calls)
  useEffect(() => {
    loadFixtures();
    loadMatchdayChanges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only load once on mount

  // Reload matchday changes when clubs change
  useEffect(() => {
    if (clubs.length > 0) {
      loadMatchdayChanges();
    }
  }, [clubs.length]); // Only reload when clubs count changes

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

  const loadMatchdayChanges = async () => {
    try {
      if (clubs.length === 0) return;

      const teamIds = clubs.map(c => parseInt(c.id));
      const changesMap = new Map<string, { change: number; percentChange: number }>();

      // Get match results for all teams
      const { data: ledgerData, error } = await supabase
        .from('total_ledger')
        .select('team_id, share_price_before, share_price_after, event_date')
        .in('team_id', teamIds)
        .in('ledger_type', ['match_win', 'match_loss', 'match_draw'])
        .order('event_date', { ascending: false });

      if (error) {
        console.error('Error loading matchday changes:', error);
        return;
      }

      // Group by team_id and get last two matches
      const teamMatches = new Map<number, Array<{ before: number; after: number; date: string }>>();
      
      (ledgerData || []).forEach(entry => {
        const teamId = entry.team_id;
        if (!teamMatches.has(teamId)) {
          teamMatches.set(teamId, []);
        }
        const matches = teamMatches.get(teamId)!;
        
        // Only add if we have both before and after prices
        if (entry.share_price_before && entry.share_price_after) {
          matches.push({
            before: roundForDisplay(toDecimal(entry.share_price_before)),
            after: roundForDisplay(toDecimal(entry.share_price_after)),
            date: entry.event_date
          });
        }
      });

      // Calculate change between last two matchdays for each team
      teamMatches.forEach((matches, teamId) => {
        if (matches.length >= 2) {
          // Get last two matches (most recent first)
          const lastMatch = matches[0];
          const previousMatch = matches[1];
          
          // Price after previous match is the price before last match
          const priceAfterPreviousMatch = lastMatch.before;
          const priceAfterLastMatch = lastMatch.after;
          
          const change = calculateProfitLoss(priceAfterLastMatch, priceAfterPreviousMatch);
          const percentChange = calculateMatchdayPercentChange(priceAfterLastMatch, priceAfterPreviousMatch);
          
          changesMap.set(teamId.toString(), { change, percentChange });
        } else if (matches.length === 1) {
          // Only one match, compare to launch price
          const match = matches[0];
          const club = clubs.find(c => parseInt(c.id) === teamId);
          if (club) {
            const launchPrice = club.launchValue;
            const change = calculateProfitLoss(match.after, launchPrice);
            const percentChange = calculateLifetimePercentChange(match.after, launchPrice);
            changesMap.set(teamId.toString(), { change, percentChange });
          }
        }
      });

      setMatchdayChanges(changesMap);
    } catch (error) {
      console.error('Error calculating matchday changes:', error);
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

  // Calculate buy window statuses instantly from fixtures data (no async needed!)
  useEffect(() => {
    const calculateBuyWindowStatuses = () => {
      if (clubs.length === 0 || fixtures.length === 0) {
        // If fixtures aren't loaded yet, calculate will default to open
        const statuses = new Map();
        clubs.forEach(club => {
          statuses.set(club.id, { isOpen: true, message: 'Trading is open' });
        });
        setBuyWindowStatuses(statuses);
        return;
      }

      // Calculate statuses synchronously from fixtures - INSTANT!
      const statuses = new Map();
      clubs.forEach(club => {
        const status = buyWindowService.getBuyWindowDisplayInfoSync(parseInt(club.id), fixtures);
          statuses.set(club.id, status);
      });
      setBuyWindowStatuses(statuses);
    };

    // Calculate immediately when clubs or fixtures change
    calculateBuyWindowStatuses();
      
    // Refresh every 30 seconds (recalculate from current fixtures)
    const interval = setInterval(calculateBuyWindowStatuses, 30000);
      return () => clearInterval(interval);
  }, [clubs, fixtures]);

  // Memoized function to count games played for a club using fixture data
  // Counts all completed fixtures from API data (not just simulated games)
  const getGamesPlayed = useCallback((clubId: string): number => {
    // OPTIMIZED: Pre-filter fixtures once instead of filtering for each club
    const clubIdInt = parseInt(clubId);
    return fixtures.filter(fixture => 
      (fixture.home_team_id === clubIdInt || fixture.away_team_id === clubIdInt) &&
      fixture.status === 'applied' && 
      fixture.result !== 'pending'
      // Removed snapshot requirement - now counts all completed API fixtures
    ).length;
  }, [fixtures]);

  // Format trading deadline in UAE time - compact format
  const formatTradingDeadline = useCallback((nextCloseTime: Date | undefined): string | null => {
    if (!nextCloseTime) return null;
    
    const datePart = nextCloseTime.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Dubai'
    });
    const timePart = nextCloseTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Dubai'
    });
    
    return `${datePart}, ${timePart}`;
  }, []);

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
      initial_market_cap: c.launchValue * 1000, // Fixed shares model: $20 * 1000 = $20,000
      market_cap: c.marketCap,
      total_shares: 1000, // Fixed at 1000 shares
      available_shares: c.sharesOutstanding, // This represents available_shares from Club interface
      shares_outstanding: 1000, // Keep for backward compatibility
      is_tradeable: true,
      created_at: now,
      updated_at: now,
      launch_price: c.launchValue
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
      
      // Immediately refresh wallet balance
      refreshWalletBalance();
      
      // Refresh all data (portfolio, clubs, etc.)
      await refreshData();
      
      // Double-check wallet balance after a short delay (for webhook updates)
      setTimeout(() => {
        refreshWalletBalance();
        refreshData();
      }, 1500);
      
      // Success toast is shown in AppContext.purchaseClub
    } catch (error: any) {
      console.error('Purchase failed:', error);
      
      // Extract user-friendly error message
      let errorMessage = 'An unknown error occurred';
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      // Show error toast with clear message
      toast({
        title: "Purchase Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 5000, // Show for 5 seconds so user can read it
      });
    } finally {
      setIsPurchasing(false);
      setPurchasingClubId(null);
    }
  }, [confirmationData, purchaseClub, toast, isPurchasing, refreshWalletBalance, refreshData]);

  return (
    <div className="p-4 lg:p-6 space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Header Section - Minimalist */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">The Premier League</h1>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <div className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-pulse"></div>
          <span>Live</span>
        </div>
      </div>

      {/* Main Marketplace Table - Clean Professional Style */}
      <Card className="trading-card border-0">
        <CardContent className="p-0">
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto w-full max-w-full">
            <table className="trading-table w-full">
              <thead>
                <tr>
                  <th className="text-left w-10 px-3">#</th>
                  <th className="text-left px-3">
                    <button
                      onClick={() => {
                        if (sortField === 'name') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('name');
                          setSortDirection('asc');
                        }
                      }}
                      className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                    >
                      <span>Club</span>
                      {sortField === 'name' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-20" />
                      )}
                    </button>
                  </th>
                  <th className="text-center px-3">Games</th>
                  <th className="text-center px-3">
                    <button
                      onClick={() => {
                        if (sortField === 'price') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('price');
                          setSortDirection('desc');
                        }
                      }}
                      className="flex items-center justify-center gap-1.5 hover:text-foreground transition-colors mx-auto"
                    >
                      <span>Price</span>
                      {sortField === 'price' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-20" />
                      )}
                    </button>
                  </th>
                  <th className="text-center px-3">
                    <button
                      onClick={() => {
                        if (sortField === 'change') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('change');
                          setSortDirection('desc');
                        }
                      }}
                      className="flex items-center justify-center gap-1.5 hover:text-foreground transition-colors mx-auto"
                    >
                      <span>Gain/Loss</span>
                      {sortField === 'change' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-20" />
                      )}
                    </button>
                  </th>
                  <th className="text-center px-3">
                    <button
                      onClick={() => {
                        if (sortField === 'marketCap') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('marketCap');
                          setSortDirection('desc');
                        }
                      }}
                      className="flex items-center justify-center gap-1.5 hover:text-foreground transition-colors mx-auto"
                    >
                      <span>Market Cap</span>
                      {sortField === 'marketCap' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-20" />
                      )}
                    </button>
                  </th>
                  <th className="text-center px-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    <span className="text-xs inline-block" style={{ paddingLeft: '2rem' }}>Closes (UAE time)</span>
                  </th>
                  <th className="text-center px-3 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {useMemo(() => {
                  // Sort based on selected field
                  let filtered = [...clubs].sort((a, b) => {
                    switch (sortField) {
                      case 'name':
                        const aName = a.name.toLowerCase();
                        const bName = b.name.toLowerCase();
                        return sortDirection === 'asc' 
                          ? aName.localeCompare(bName)
                          : bName.localeCompare(aName);
                      case 'price': {
                        const aValue = a.currentValue;
                        const bValue = b.currentValue;
                        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
                      }
                      case 'change': {
                        const aValue = a.percentChange;
                        const bValue = b.percentChange;
                        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
                      }
                      case 'marketCap': {
                        const aValue = a.marketCap;
                        const bValue = b.marketCap;
                        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
                      }
                      default: {
                        const aValue = a.percentChange;
                        const bValue = b.percentChange;
                        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
                      }
                    }
                  });

                  return filtered.map((club, index) => (
                    <React.Fragment key={club.id}>
                      <tr className="group">
                        <td className="px-3 text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>{index + 1}</td>
                        <td className="px-3">
                          <div className="flex items-center gap-2">
                            <TeamLogo 
                              teamName={club.name} 
                              externalId={club.externalId ? parseInt(club.externalId) : undefined}
                              size="sm" 
                            />
                            <button
                              onClick={() => handleTeamClick(club.id)}
                              className="hover:text-trading-primary transition-colors cursor-pointer flex items-center gap-1 font-medium"
                            >
                              <span>{club.name}</span>
                              <ChevronDown 
                                className={`h-3 w-3 transition-transform ${
                                  selectedClub === club.id ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                          </div>
                        </td>
                        <td 
                          className="px-3 text-center text-xs font-medium cursor-pointer hover:text-trading-primary transition-colors"
                          onClick={() => handleTeamClick(club.id)}
                          style={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                          {getGamesPlayed(club.id)}
                        </td>
                        <td className="px-3 text-center font-mono font-semibold">{formatCurrency(club.currentValue)}</td>
                        <td className={`px-3 text-center ${club.percentChange === 0 ? 'price-neutral' : club.percentChange > 0 ? 'price-positive' : 'price-negative'}`}>
                          {club.percentChange > 0 ? '+' : ''}{formatPercent(club.percentChange)}
                        </td>
                        <td className="px-3 text-center font-mono text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                          {formatCurrency(club.marketCap)}
                        </td>
                        <td className="px-3 text-center text-xs" style={{ color: '#C9A961' }}>
                          {(() => {
                            const status = buyWindowStatuses.get(club.id);
                            if (!status?.nextCloseTime) {
                              return <span className="text-gray-500">—</span>;
                            }
                            const deadline = formatTradingDeadline(status.nextCloseTime);
                            return <span className="font-mono" style={{ color: '#C9A961' }}>{deadline}</span>;
                          })()}
                        </td>
                        <td className="px-3 text-center">
                          <Button
                            onClick={() => handlePurchaseClick(club.id)}
                            size="sm"
                            disabled={isPurchasing || (buyWindowStatuses.has(club.id) && !buyWindowStatuses.get(club.id)?.isOpen)}
                            className="bg-[#10B981] hover:bg-[#059669] text-white font-medium px-3 py-1 text-xs rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title={(buyWindowStatuses.has(club.id) && !buyWindowStatuses.get(club.id)?.isOpen) ? 'Trading window is closed' : 'Buy shares'}
                          >
                            {isPurchasing && purchasingClubId === club.id ? '...' : 
                             (buyWindowStatuses.has(club.id) && !buyWindowStatuses.get(club.id)?.isOpen) ? 'Closed' : 'Buy'}
                          </Button>
                        </td>
                      </tr>
                      
                      {/* Slide-down panel for team details */}
                      <tr>
                        <td colSpan={8} className="p-0">
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
                  ));
                }, [clubs, sortField, sortDirection, selectedClub, getGamesPlayed, handleTeamClick, handlePurchaseClick, isPurchasing, purchasingClubId, buyWindowStatuses, formatTradingDeadline])}

              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout */}
          <div className="lg:hidden space-y-3">
            {useMemo(() => clubs
              .map(club => {
                const launchPrice = roundForDisplay(toDecimal(club.launchValue || 20));
                const currentValue = roundForDisplay(toDecimal(club.currentValue || 20));
                const profitLoss = roundForDisplay(toDecimal(currentValue).minus(launchPrice));
                const percentChange = club.percentChange;
                const marketCap = roundForDisplay(toDecimal(club.marketCap || 100));
                
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
                        {(() => {
                          const status = buyWindowStatuses.get(club.id);
                          if (status?.nextCloseTime) {
                            const deadline = formatTradingDeadline(status.nextCloseTime);
                            return (
                              <div className="text-xs mt-1 font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                <span>Until {deadline}</span>
                                <span className="text-[10px] text-gray-500 ml-1">(UAE)</span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        onClick={() => handlePurchaseClick(club.id)}
                        size="sm"
                        disabled={isPurchasing || (buyWindowStatuses.has(club.id) && !buyWindowStatuses.get(club.id)?.isOpen)}
                        className="bg-gradient-success hover:bg-gradient-success/80 text-white font-semibold px-3 py-1 text-xs rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                        title={(buyWindowStatuses.has(club.id) && !buyWindowStatuses.get(club.id)?.isOpen) ? 'Trading window is closed' : 'Buy shares'}
                      >
                        {isPurchasing && purchasingClubId === club.id ? 'Processing...' : 
                         (buyWindowStatuses.has(club.id) && !buyWindowStatuses.get(club.id)?.isOpen) ? '🔒 Closed' : 'Buy'}
                      </Button>
                      <BuyWindowIndicator teamId={parseInt(club.id)} compact={true} showCountdown={false} />
                    </div>
                  </div>
                  
                  {/* Main Price Display - Large and Clear */}
                  <div className="mb-3 p-3 rounded-lg bg-gray-700/30 border border-gray-600/30">
                    <div className="text-center">
                      <div className="text-xs text-gray-400 mb-1">Current Share Price</div>
                      <div className="text-2xl font-bold text-white mb-1">{formatCurrency(club.currentValue)}</div>
                      <div className={`text-sm font-semibold ${club.percentChange === 0 ? 'text-gray-400' : club.percentChange > 0 ? 'price-positive' : 'price-negative'}`}>
                        {club.percentChange > 0 ? '+' : ''}{formatPercent(club.percentChange)} from launch
                      </div>
                    </div>
                  </div>
                  
                  {/* Secondary Info - Grid Layout */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-700/20 rounded p-2">
                      <div className="text-gray-400 text-[10px] uppercase tracking-wide mb-1">Launch Price</div>
                      <div className="text-white font-mono font-semibold">{formatCurrency(club.launchValue)}</div>
                    </div>
                    <div className="bg-gray-700/20 rounded p-2">
                      <div className="text-gray-400 text-[10px] uppercase tracking-wide mb-1">Profit/Loss</div>
                      <div className={`font-semibold ${club.profitLoss === 0 ? 'text-gray-400' : club.profitLoss > 0 ? 'price-positive' : 'price-negative'}`}>
                        {club.profitLoss > 0 ? '+' : ''}{formatCurrency(club.profitLoss)}
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
                          launchPrice={club.launchValue}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
      
      
      {/* Team Sync Component - Admin Only */}
      {isAdmin && (
        <div className="mt-6">
          <TeamSync />
        </div>
      )}
      
      {/* Fixture Sync Component - Admin Only */}
      {isAdmin && (
        <div className="mt-6">
          <FixtureSync />
        </div>
      )}
      
      
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


    </div>
  );
};

export default ClubValuesPage;