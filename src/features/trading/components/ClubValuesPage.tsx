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
  calculateProfitLoss,
  calculatePriceImpactPercent
} from '@/shared/lib/utils/calculations';
import { toDecimal, roundForDisplay, fromCents, Decimal } from '@/shared/lib/utils/decimal';

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
  const [sortField, setSortField] = useState<'name' | 'price' | 'change' | 'marketCap'>('price');
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

      // Get latest match result for all teams
      const { data: ledgerData, error } = await supabase
        .from('total_ledger')
        .select('team_id, market_cap_before, market_cap_after, event_date')
        .in('team_id', teamIds)
        .in('ledger_type', ['match_win', 'match_loss', 'match_draw'])
        .order('event_date', { ascending: false });

      if (error) {
        console.error('Error loading matchday changes:', error);
        return;
      }

      // Group by team_id and get the latest match only
      // Calculate percentage from full-precision values (matching backend 4-decimal precision)
      const latestMatches = new Map<number, { marketCapBefore: Decimal; marketCapAfter: Decimal; date: string }>();
      
      (ledgerData || []).forEach(entry => {
        const teamId = entry.team_id;
        // Only store the first (latest) match for each team
        if (!latestMatches.has(teamId) && entry.market_cap_before && entry.market_cap_after) {
          latestMatches.set(teamId, {
            marketCapBefore: toDecimal(fromCents(entry.market_cap_before || 0)),
            marketCapAfter: toDecimal(fromCents(entry.market_cap_after || 0)),
            date: entry.event_date
          });
        }
      });

      // Calculate latest match's price impact percentage for each team
      // Calculate from full-precision values, then round only the final result (matching backend)
      latestMatches.forEach((match, teamId) => {
        // Calculate percentage change from full-precision Decimal values
        const percentChange = calculatePriceImpactPercent(
          match.marketCapAfter.toNumber(),
          match.marketCapBefore.toNumber()
        );
        const change = roundForDisplay(match.marketCapAfter.minus(match.marketCapBefore).toNumber());
        
        changesMap.set(teamId.toString(), { change, percentChange });
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

  // Get team short name for mobile display
  const getTeamShortName = useCallback((teamName: string): string => {
    // Map of team names to their short forms (like Premier League official app)
    const teamShortNames: Record<string, string> = {
      'Arsenal FC': 'Arsenal',
      'Aston Villa FC': 'Aston Villa',
      'AFC Bournemouth': 'Bournemouth',
      'Brentford FC': 'Brentford',
      'Brighton & Hove Albion FC': 'Brighton',
      'Burnley FC': 'Burnley',
      'Chelsea FC': 'Chelsea',
      'Crystal Palace FC': 'Crystal Palace',
      'Everton FC': 'Everton',
      'Fulham FC': 'Fulham',
      'Leeds United FC': 'Leeds',
      'Liverpool FC': 'Liverpool',
      'Manchester City FC': 'Man City',
      'Manchester United FC': 'Man Utd',
      'Newcastle United FC': 'Newcastle',
      'Nottingham Forest FC': 'Nott\'m Forest',
      'Sunderland AFC': 'Sunderland',
      'Tottenham Hotspur FC': 'Spurs',
      'West Ham United FC': 'West Ham',
      'Wolverhampton Wanderers FC': 'Wolves'
    };

    // Return short name if found, otherwise return original name
    return teamShortNames[teamName] || teamName.replace(/\s+FC$|\s+AFC$/, '');
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
    <div className="md:p-3 md:sm:p-4 md:p-5 lg:p-6 space-y-3 sm:space-y-4 md:space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Header Section - Mobile Optimized */}
      <div className="flex items-center justify-between px-3 md:px-0">
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold">The Premier League</h1>
        </div>
      </div>

      {/* Main Marketplace Table - Clean Professional Style */}
      <Card className="trading-card border-0 md:rounded-lg">
        <CardContent className="p-0">
          {/* Desktop/Tablet Table */}
          <div className="hidden md:block overflow-x-auto w-full max-w-full">
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
                      <span>Latest Match</span>
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
                        const aValue = matchdayChanges.get(a.id)?.percentChange ?? 0;
                        const bValue = matchdayChanges.get(b.id)?.percentChange ?? 0;
                        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
                      }
                      case 'marketCap': {
                        const aValue = a.marketCap;
                        const bValue = b.marketCap;
                        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
                      }
                      default: {
                        const aValue = a.currentValue;
                        const bValue = b.currentValue;
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
                        <td className={`px-3 text-center ${
                          (() => {
                            const latestMatchChange = matchdayChanges.get(club.id)?.percentChange;
                            if (latestMatchChange === undefined || latestMatchChange === null) {
                              return 'text-gray-500';
                            }
                            return latestMatchChange === 0 ? 'price-neutral' : latestMatchChange > 0 ? 'price-positive' : 'price-negative';
                          })()
                        }`}>
                          {(() => {
                            const latestMatchChange = matchdayChanges.get(club.id)?.percentChange;
                            if (latestMatchChange === undefined || latestMatchChange === null) {
                              return <span className="text-gray-500">—</span>;
                            }
                            return `${latestMatchChange > 0 ? '+' : ''}${formatPercent(latestMatchChange)}`;
                          })()}
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
                            teamsMarketCapInDollars
                            launchPrice={club.launchValue}
                            currentPrice={club.currentValue}
                            currentPercentChange={club.percentChange}
                          />
                        </td>
                      </tr>
                    </React.Fragment>
                  ));
                }, [clubs, sortField, sortDirection, selectedClub, getGamesPlayed, handleTeamClick, handlePurchaseClick, isPurchasing, purchasingClubId, buyWindowStatuses, formatTradingDeadline, matchdayChanges])}

              </tbody>
            </table>
          </div>

          {/* Mobile Table Layout - Premier League Style Compact Design */}
          <div className="md:hidden -mx-3 sm:-mx-4">
            {/* Mobile Table Header */}
            <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700/50">
              <div className="grid grid-cols-[28px_minmax(0,1fr)_65px_50px_50px] gap-1.5 px-3 py-2 text-[10px] font-semibold text-gray-400 items-center">
                  <div className="text-center">#</div>
                  <button
                    onClick={() => {
                      if (sortField === 'name') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('name');
                        setSortDirection('asc');
                      }
                    }}
                    className="flex items-center gap-1 hover:text-white transition-colors text-left"
                  >
                    <span>Team</span>
                    {sortField === 'name' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                    ) : (
                      <ArrowUpDown className="h-2.5 w-2.5 opacity-20" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (sortField === 'price') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('price');
                        setSortDirection('desc');
                      }
                    }}
                    className="flex items-center justify-center gap-1 hover:text-white transition-colors w-full"
                  >
                    <span>Price</span>
                    {sortField === 'price' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                    ) : (
                      <ArrowUpDown className="h-2.5 w-2.5 opacity-20" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (sortField === 'change') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('change');
                        setSortDirection('desc');
                      }
                    }}
                    className="flex items-center justify-center gap-1 hover:text-white transition-colors w-full"
                  >
                    <span>%</span>
                    {sortField === 'change' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                    ) : (
                      <ArrowUpDown className="h-2.5 w-2.5 opacity-20" />
                    )}
                  </button>
                  <div className="text-center">Buy</div>
                </div>
              </div>

              {/* Mobile Table Rows */}
              <div className="space-y-0">
                {useMemo(() => {
                  // Sort based on selected field (same logic as desktop)
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
                        const aValue = matchdayChanges.get(a.id)?.percentChange ?? 0;
                        const bValue = matchdayChanges.get(b.id)?.percentChange ?? 0;
                        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
                      }
                      case 'marketCap': {
                        const aValue = a.marketCap;
                        const bValue = b.marketCap;
                        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
                      }
                      default: {
                        const aValue = a.currentValue;
                        const bValue = b.currentValue;
                        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
                      }
                    }
                  });

                  return filtered.map((club, index) => {
                    return (
                      <React.Fragment key={club.id}>
                        <div className="border-b border-gray-700/30 last:border-b-0">
                          <div className="grid grid-cols-[28px_minmax(0,1fr)_65px_50px_50px] gap-1.5 px-3 py-2 items-center active:bg-gray-700/30 transition-colors touch-manipulation">
                            {/* Rank */}
                            <div className="text-center text-[11px] font-medium text-gray-400 flex-shrink-0">
                              {index + 1}
                            </div>
                            
                            {/* Team */}
                            <div className="flex items-center gap-1 min-w-0 flex-1">
                              <div className="flex-shrink-0">
                                <TeamLogo 
                                  teamName={club.name} 
                                  externalId={club.externalId ? parseInt(club.externalId) : undefined}
                                  size="sm" 
                                />
                              </div>
                              <button
                                onClick={() => handleTeamClick(club.id)}
                                className="flex items-center gap-0.5 min-w-0 flex-1 hover:text-trading-primary transition-colors text-left"
                              >
                                <span className="text-[11px] font-medium text-white truncate block">{club.name}</span>
                                <ChevronDown 
                                  className={`h-2.5 w-2.5 transition-transform flex-shrink-0 text-gray-400 ${
                                    selectedClub === club.id ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                            </div>
                            
                            {/* Price */}
                            <div className="text-center font-mono font-semibold text-[11px] text-white flex-shrink-0 whitespace-nowrap">
                              {formatCurrency(club.currentValue)}
                            </div>
                            
                            {/* Percent Change */}
                            <div className={`text-center font-semibold text-[11px] flex-shrink-0 ${
                              (() => {
                                const latestMatchChange = matchdayChanges.get(club.id)?.percentChange;
                                if (latestMatchChange === undefined || latestMatchChange === null) {
                                  return 'text-gray-500';
                                }
                                return latestMatchChange === 0 ? 'text-gray-400' : latestMatchChange > 0 ? 'text-green-400' : 'text-red-400';
                              })()
                            }`}>
                              {(() => {
                                const latestMatchChange = matchdayChanges.get(club.id)?.percentChange;
                                if (latestMatchChange === undefined || latestMatchChange === null) {
                                  return '—';
                                }
                                return `${latestMatchChange > 0 ? '+' : ''}${formatPercent(latestMatchChange)}`;
                              })()}
                            </div>
                            
                            {/* Buy Button */}
                            <div className="flex justify-center flex-shrink-0">
                              <Button
                                onClick={() => handlePurchaseClick(club.id)}
                                size="sm"
                                disabled={isPurchasing || (buyWindowStatuses.has(club.id) && !buyWindowStatuses.get(club.id)?.isOpen)}
                                className="bg-[#10B981] hover:bg-[#059669] text-white font-medium px-1.5 py-0.5 text-[8px] rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation h-[20px] w-auto min-w-[32px] flex items-center justify-center"
                                title={(buyWindowStatuses.has(club.id) && !buyWindowStatuses.get(club.id)?.isOpen) ? 'Trading window is closed' : 'Buy shares'}
                              >
                                {isPurchasing && purchasingClubId === club.id ? '...' : 
                                 (buyWindowStatuses.has(club.id) && !buyWindowStatuses.get(club.id)?.isOpen) ? 'Closed' : 'Buy'}
                              </Button>
                            </div>
                          </div>
                        
                        {/* Slide-down panel for team details */}
                        <div className="slide-down-panel" data-open={selectedClub === club.id}>
                          <div className="slide-down-panel-inner">
                            <div className="slide-down-panel-content">
                  {/* Mobile Summary Stats */}
                  <div className="md:hidden border-b border-gray-700/30 pb-3 mb-3">
                    <div className="grid grid-cols-3 gap-2 px-2">
                      {/* Games Played */}
                      <div className="bg-gray-700/20 rounded p-2 text-center">
                        <div className="text-[9px] text-gray-500 uppercase tracking-wide mb-0.5">Games</div>
                        <div className="text-xs font-semibold text-white">
                          {getGamesPlayed(club.id)}
                        </div>
                      </div>
                      
                      {/* Market Cap */}
                      <div className="bg-gray-700/20 rounded p-2 text-center">
                        <div className="text-[9px] text-gray-500 uppercase tracking-wide mb-0.5">Market Cap</div>
                        <div className="text-xs font-mono font-semibold text-white truncate">
                          {formatCurrency(club.marketCap)}
                        </div>
                      </div>
                      
                      {/* Closes Time */}
                      <div className="bg-gray-700/20 rounded p-2 text-center">
                        <div className="text-[9px] text-gray-500 uppercase tracking-wide mb-0.5">Closes</div>
                        <div className="text-[10px] font-mono text-gray-300">
                          {(() => {
                            const status = buyWindowStatuses.get(club.id);
                            if (!status?.nextCloseTime) {
                              return <span className="text-gray-500">—</span>;
                            }
                            const deadline = formatTradingDeadline(status.nextCloseTime);
                            return deadline ? deadline.split(', ')[1] : '—'; // Show only time part
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                              
                              <TeamDetailsSlideDown
                                isOpen={selectedClub === club.id}
                                teamId={parseInt(club.id)}
                                teamName={club.name}
                                userId={user?.id}
                                fixtures={fixtures}
                                teams={memoizedTeams}
                                teamsMarketCapInDollars
                                launchPrice={club.launchValue}
                                currentPrice={club.currentValue}
                                currentPercentChange={club.percentChange}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                  });
                }, [clubs, sortField, sortDirection, selectedClub, getGamesPlayed, handleTeamClick, handlePurchaseClick, isPurchasing, purchasingClubId, buyWindowStatuses, matchdayChanges])}
              </div>
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