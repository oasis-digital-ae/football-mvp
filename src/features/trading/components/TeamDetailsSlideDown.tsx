import React, { useState, useEffect, useCallback } from 'react';
import { positionsService, fixturesService } from '@/shared/lib/database';
import type { DatabasePositionWithTeam } from '@/shared/types/database.types';
import type { DatabaseFixture } from '@/shared/lib/services/fixtures.service';
import type { DatabaseTeam } from '@/shared/lib/services/teams.service';
import { formatCurrency } from '@/shared/lib/formatters';
import { Loader2, TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { supabase } from '@/shared/lib/supabase';
import { LineChart, ChartDataPoint } from '@/shared/components/ui/line-chart';
import { ChartSkeleton } from '@/shared/components/ui/skeleton';
import {
  calculateLifetimePercentChange,
  calculatePriceImpactPercent
} from '@/shared/lib/utils/calculations';
import { toDecimal, roundForDisplay, fromCents } from '@/shared/lib/utils/decimal';

/** Shape from TeamDetailsModal's matchHistory for pre-loaded data */
export interface InitialMatchHistoryItem {
  fixture: { kickoff_at: string };
  description: string;
  postMatchCap: number;
  priceImpact: number;
  priceImpactPercent: number;
  result: 'win' | 'loss' | 'draw';
  postMatchSharePrice: number;
}

interface TeamDetailsSlideDownProps {
  isOpen: boolean;
  teamId: number;
  teamName: string;
  userId: string;
  fixtures?: DatabaseFixture[];
  teams?: DatabaseTeam[];
  /** When true, team.market_cap is already in dollars (e.g. from clubs); when false, it's in cents (raw DB). Default false. */
  teamsMarketCapInDollars?: boolean;
  /** When provided, match history is shown immediately without a second load */
  initialMatchHistory?: InitialMatchHistoryItem[];
  initialUserPosition?: DatabasePositionWithTeam | null;
  launchPrice?: number; // Launch price from club data for consistent Change calculation
  currentPrice?: number; // Current price from club data for consistent Change calculation
  currentPercentChange?: number; // Current percent change from club data for consistent display
}

// Utility functions
const extractOpponentName = (eventDescription?: string): string => {
  if (!eventDescription) return '';
  const match = eventDescription.match(/vs\s+(.+?)(?:\s|$)/i);
  return match?.[1]?.trim() || '';
};

const processChartData = (events: any[], launchPrice?: number): ChartDataPoint[] => {
  const matchEvents = events.filter(e => e.ledger_type !== 'initial_state');
  
  const sortedMatches = [...matchEvents].sort((a, b) => 
    new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
  );
  
  const chartPoints: ChartDataPoint[] = [];
  
  // Always use launch price for initial point if provided, otherwise fall back to initial_state
  if (launchPrice && launchPrice > 0) {
    chartPoints.push({ x: 0, y: roundForDisplay(launchPrice), label: 'Initial' });
  } else {
    // Fallback: use initial_state events if launch price not provided
    const initialStates = events.filter(e => e.ledger_type === 'initial_state');
    initialStates.forEach((event: any) => {
      const sharePrice = roundForDisplay(fromCents(event.share_price_after || event.share_price_before || 0));
      if (sharePrice > 0) {
        chartPoints.push({ x: 0, y: sharePrice, label: 'Initial' });
      }
    });
  }
  
  // Add match events in chronological order
  sortedMatches.forEach((event: any) => {
    const sharePrice = roundForDisplay(fromCents(event.share_price_after || event.share_price_before || 0));
    if (sharePrice > 0) {
      const eventDate = new Date(event.event_date);
      chartPoints.push({
        x: chartPoints.length,
        y: sharePrice,
        label: eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        price: sharePrice,
        date: eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        opponent: extractOpponentName(event.event_description)
      });
    }
  });
  
  return chartPoints;
};

function mapInitialMatchHistory(initial: InitialMatchHistoryItem[]): any[] {
  return initial.map(item => ({
    date: item.fixture.kickoff_at,
    description: item.description,
    marketCapAfter: item.postMatchCap,
    priceImpact: item.priceImpact,
    priceImpactPercent: item.priceImpactPercent,
    matchResult: item.result,
    sharePriceAfter: item.postMatchSharePrice,
    isMatch: true,
    isPurchase: false
  }));
}

const TeamDetailsSlideDown: React.FC<TeamDetailsSlideDownProps> = ({
  isOpen,
  teamId,
  teamName,
  userId,
  fixtures: parentFixtures,
  teams: parentTeams,
  teamsMarketCapInDollars = false,
  initialMatchHistory,
  initialUserPosition,
  launchPrice,
  currentPrice,
  currentPercentChange
}) => {  const [activeTab, setActiveTab] = useState<'matches' | 'upcoming' | 'chart'>('matches');
  const [matchHistory, setMatchHistory] = useState<any[]>(() =>
    initialMatchHistory?.length ? mapInitialMatchHistory(initialMatchHistory) : []
  );
  const [upcomingMatches, setUpcomingMatches] = useState<any[]>([]);
  const [userPosition, setUserPosition] = useState<DatabasePositionWithTeam | null>(initialUserPosition ?? null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState({ matches: false, upcoming: false, chart: false });

  const fixtures = parentFixtures || [];
  const teams = parentTeams || [];
  const hasInitialMatchHistory = (initialMatchHistory?.length ?? 0) > 0;


  const loadChartData = useCallback(async () => {
    if (!teamId) return;

    setLoading(prev => ({ ...prev, chart: true }));
    try {
      // Try to get data directly from total_ledger table
      const { data, error } = await supabase
        .from('total_ledger')
        .select('*')
        .eq('team_id', teamId)
        .in('ledger_type', ['initial_state', 'match_win', 'match_loss', 'match_draw'])
        .order('event_date', { ascending: true });

      if (error) throw error;
      
      const chartPoints = data && data.length > 0 ? processChartData(data, launchPrice) : [];
      setChartData(chartPoints);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error loading chart data:', error);
      setChartData([]);
    } finally {
      setLoading(prev => ({ ...prev, chart: false }));
    }
  }, [teamId, launchPrice]);

  const loadMatchesData = useCallback(async () => {
    if (!isOpen || !teamId) return;

    setLoading(prev => ({ ...prev, matches: true }));
    try {
      const [positionResult, ledgerData, fixturesData] = await Promise.all([
        positionsService.getByUserIdAndTeamId(userId, teamId),
        supabase
          .from('total_ledger')
          .select('*')
          .eq('team_id', teamId)
          .in('ledger_type', ['match_win', 'match_loss', 'match_draw'])
          .order('event_date', { ascending: false }),
        fixtures.length > 0 ? Promise.resolve(fixtures) : fixturesService.getAll()
      ]);

      if (ledgerData.error) {
        if (process.env.NODE_ENV === 'development') console.error('Failed to get ledger data:', ledgerData.error);
        setMatchHistory([]);
        return;
      }

      // Create a map of fixtures by ID for quick lookup
      const fixturesMap = new Map((fixturesData || []).map(f => [f.id, f]));
      const teamsMap = new Map((teams || []).map(t => [t.id, t]));

      // Deduplicate match events by trigger_event_id (keep most recent by created_at or id)
      const matchEventsMap = new Map<number, typeof ledgerData.data[0]>();
      
      (ledgerData.data || []).forEach(event => {
        const triggerEventId = event.trigger_event_id;
        if (!triggerEventId) {
          // Skip events without trigger_event_id (shouldn't happen for matches, but be safe)
          return;
        }
        
        const existing = matchEventsMap.get(triggerEventId);
        if (!existing) {
          matchEventsMap.set(triggerEventId, event);
          return;
        }
        
        // Compare by created_at (most recent) or id (fallback)
        const existingTime = existing.created_at ? new Date(existing.created_at).getTime() : 0;
        const currentTime = event.created_at ? new Date(event.created_at).getTime() : 0;
        
        if (currentTime > existingTime || (currentTime === existingTime && event.id > existing.id)) {
          // Replace with more recent entry
          matchEventsMap.set(triggerEventId, event);
        }
      });
      
      // Only process match events (no share purchases/sales)
      const deduplicatedLedgerData = Array.from(matchEventsMap.values());

      // Filter out future matches - only show matches that have actually been played
      // event_date should match the fixture's kickoff_at, so we can filter by event_date
      const now = new Date();
      const pastMatchesOnly = deduplicatedLedgerData.filter(event => {
        if (!event.event_date) return false;
        return new Date(event.event_date) <= now;
      });

      const processedEvents = pastMatchesOnly.map(event => {
        // Process match events only
        const matchResult = event.ledger_type === 'match_win' ? 'win' : 
                           event.ledger_type === 'match_loss' ? 'loss' : 'draw';
        
        // Determine opponent from fixture data (source of truth) instead of event_description
        let opponentName = 'Unknown';
        if (event.trigger_event_id) {
          const fixture = fixturesMap.get(event.trigger_event_id);
          if (fixture) {
            // Determine if this team is home or away
            const isHome = fixture.home_team_id === teamId;
            const opponentId = isHome ? fixture.away_team_id : fixture.home_team_id;
            const opponentTeam = teamsMap.get(opponentId);
            opponentName = opponentTeam?.name || 'Unknown';
          }
        }
        
        // Use opponent name from fixture, fallback to extracting from description if fixture not found
        const description = opponentName !== 'Unknown' 
          ? `Match vs ${opponentName}`
          : (event.event_description || 'Match Result');
        // Convert from cents (BIGINT) to dollars
        const marketCapBefore = roundForDisplay(fromCents(event.market_cap_before || 0));
        const marketCapAfter = roundForDisplay(fromCents(event.market_cap_after || 0));
        
        // Use amount_transferred directly from database to avoid rounding errors
        // amount_transferred is stored in cents (BIGINT), convert to dollars
        const transferAmountDollars = roundForDisplay(fromCents(event.amount_transferred || 0));
        
        // Calculate share price change: transfer amount / total shares (1000)
        // This ensures winner and loser show the exact same dollar amount change
        const TOTAL_SHARES = 1000;
        const sharePriceChange = transferAmountDollars / TOTAL_SHARES;
        const priceImpact = matchResult === 'win' 
          ? sharePriceChange  // Winner's share price increases
          : matchResult === 'loss' 
          ? -sharePriceChange  // Loser's share price decreases
          : 0; // Draw: no change
        
        const priceImpactPercent = calculatePriceImpactPercent(marketCapAfter, marketCapBefore);

        return {
          date: event.event_date,
          description,
          marketCapBefore,
          marketCapAfter,
          sharePriceBefore: roundForDisplay(fromCents(event.share_price_before || 0)),
          sharePriceAfter: roundForDisplay(fromCents(event.share_price_after || 0)),
          priceImpact,
          priceImpactPercent,
          matchResult,
          isMatch: true,
          isPurchase: false
        };
      });

      // Sort by date descending (most recent first)
      processedEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setUserPosition(positionResult);
      setMatchHistory(processedEvents);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error loading match data:', error);
      setMatchHistory([]);
      setUserPosition(null);
    } finally {
      setLoading(prev => ({ ...prev, matches: false }));
    }
  }, [isOpen, teamId, userId, fixtures, teams]);
  const loadUpcomingMatches = useCallback(async () => {
    if (!isOpen || !teamId) return;

    setLoading(prev => ({ ...prev, upcoming: true }));
    try {
      const fixturesData = fixtures.length > 0 ? fixtures : await fixturesService.getAll();
      const teamsMap = new Map((teams || []).map(t => [t.id, t]));
        // Get the selected team's info
      const selectedTeam = teamsMap.get(teamId);      // Filter upcoming and live matches for this team
      const now = new Date();
      const upcomingFixtures = (fixturesData || [])
        .filter(fixture => {
          const kickoffDate = new Date(fixture.kickoff_at);
          const isTeamInFixture = fixture.home_team_id === teamId || fixture.away_team_id === teamId;
          
          // Calculate time windows
          const threeHoursAfterKickoff = new Date(kickoffDate.getTime() + 3 * 60 * 60 * 1000);
          const hasRecentlyKickedOff = kickoffDate <= now && now <= threeHoursAfterKickoff;
            // Include:
          // 1. Scheduled matches that haven't kicked off yet
          // 2. Live matches (status = 'live' or 'closed' for backward compatibility)
          // 3. Scheduled matches that kicked off recently (within 3 hours) - catches matches during status transition
          // Exclude finished matches (status = 'applied')
          const isRelevant = 
            (fixture.status === 'scheduled' && (kickoffDate > now || hasRecentlyKickedOff)) || 
            (fixture.status === 'live') ||
            (fixture.status === 'closed'); // Backward compatibility
            return isRelevant && isTeamInFixture;
        })        .sort((a, b) => {
          // Sort live matches first, then upcoming by kickoff time
          const aIsLive = (a.status === 'live' || a.status === 'closed');
          const bIsLive = (b.status === 'live' || b.status === 'closed');
          if (aIsLive && !bIsLive) return -1;
          if (!aIsLive && bIsLive) return 1;
          return new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime();
        });// Process upcoming fixtures
      const processedUpcoming = upcomingFixtures.map(fixture => {
        const isHome = fixture.home_team_id === teamId;
        const opponentId = isHome ? fixture.away_team_id : fixture.home_team_id;
        const opponentTeam = teamsMap.get(opponentId);
        
        // Convert market cap from cents to dollars (only if not already in dollars)
        const teamMarketCapDollars = teamsMarketCapInDollars 
          ? roundForDisplay(selectedTeam?.market_cap || 0)
          : roundForDisplay(fromCents(selectedTeam?.market_cap || 0));
        const opponentMarketCapDollars = teamsMarketCapInDollars
          ? roundForDisplay(opponentTeam?.market_cap || 0)
          : roundForDisplay(fromCents(opponentTeam?.market_cap || 0));
        
        // Calculate share prices (market cap in dollars / total shares)
        const TOTAL_SHARES = 1000;
        const teamSharePrice = teamMarketCapDollars / TOTAL_SHARES;
        const opponentSharePrice = opponentMarketCapDollars / TOTAL_SHARES;
        
        return {
          date: fixture.kickoff_at,
          opponent: opponentTeam?.name || 'Unknown',
          isHome,
          teamMarketCap: teamMarketCapDollars,
          opponentMarketCap: opponentMarketCapDollars,
          teamSharePrice,
          opponentSharePrice,
          matchday: fixture.matchday,
          status: fixture.status,
          homeScore: fixture.home_score,
          awayScore: fixture.away_score
        };
      });      setUpcomingMatches(processedUpcoming);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error loading upcoming matches:', error);
      setUpcomingMatches([]);
    } finally {
      setLoading(prev => ({ ...prev, upcoming: false }));
    }
  }, [isOpen, teamId, fixtures, teams, teamsMarketCapInDollars]);

  // Load match data when opened
  useEffect(() => {
    if (isOpen && teamId && userId) {
      loadMatchesData();
      loadUpcomingMatches();
    }
  }, [isOpen, teamId, userId, loadMatchesData, loadUpcomingMatches]);  // Expose refresh function for external components to call
  useEffect(() => {
    if (teamId) {
      const refreshKey = `refreshTeamDetails_${teamId}`;
      (window as any)[refreshKey] = async () => {
        if (isOpen) {
          await loadMatchesData();
          await loadUpcomingMatches();
          await loadChartData();
        }
      };
      return () => {
        delete (window as any)[refreshKey];
      };
    }
  }, [teamId, isOpen, loadMatchesData, loadUpcomingMatches, loadChartData]);
  // Listen for global refresh signal
  useEffect(() => {
    const handleRefresh = async () => {
      if (isOpen && teamId && userId) {
        // Small delay to ensure database triggers have completed
        await new Promise(resolve => setTimeout(resolve, 300));
        await loadMatchesData();
        await loadUpcomingMatches();
        if (activeTab === 'chart') {
          await loadChartData();
        }
      }
    };

    // Listen for custom refresh event
    window.addEventListener('refreshTeamDetails', handleRefresh);
    return () => {
      window.removeEventListener('refreshTeamDetails', handleRefresh);
    };
  }, [isOpen, teamId, userId, activeTab, loadMatchesData, loadUpcomingMatches, loadChartData]);


  // Load chart data when switching to chart tab
  useEffect(() => {
    if (activeTab === 'chart' && teamId && chartData.length === 0 && !loading.chart) {
      loadChartData();
    }
  }, [activeTab, teamId, loadChartData, chartData.length, loading.chart]);
  // Reset data when panel closes
  useEffect(() => {
    if (!isOpen) {
      setActiveTab('matches');
      setMatchHistory([]);
      setUpcomingMatches([]);
      setUserPosition(null);
      setChartData([]);
    }
  }, [isOpen]);


  const getResultIcon = (result: string) => {
    switch (result) {
      case 'win':
        return <TrendingUp className="w-4 h-4" />;
      case 'loss':
        return <TrendingDown className="w-4 h-4" />;
      case 'draw':
        return <Minus className="w-4 h-4" />;
      default:
        return <Minus className="w-4 h-4" />;
    }
  };

  const getResultColor = (result: string) => {
    switch (result) {
      case 'win':
        return 'bg-green-500 text-white';
      case 'loss':
        return 'bg-red-500 text-white';
      case 'draw':
        return 'bg-gray-500 text-white';
      default:
        return 'bg-blue-500 text-white';
    }
  };

  const getResultBadge = (result: string) => {
    switch (result) {
      case 'win':
        return 'W';
      case 'loss':
        return 'L';
      case 'draw':
        return 'D';
      default:
        return '—';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="slide-down-panel" data-open={isOpen}>
      <div className="slide-down-panel-inner">
        <div className="slide-down-panel-content">
          <div className="border-t border-gray-800/30 bg-secondary/20">
            <div className="px-4 pt-2 pb-4">              
            {/* Tab Navigation - Mobile Optimized */}
              <div className="flex items-center gap-1 mb-3 sm:mb-4 border-b border-gray-800/30">
                <button
                  onClick={() => setActiveTab('matches')}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition-colors border-b-2 touch-manipulation ${
                    activeTab === 'matches'
                      ? 'border-trading-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Match History
                </button>
                <button
                  onClick={() => setActiveTab('upcoming')}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition-colors border-b-2 touch-manipulation ${
                    activeTab === 'upcoming'
                      ? 'border-trading-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Upcoming Matches
                </button>
                <button
                  onClick={() => setActiveTab('chart')}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition-colors border-b-2 touch-manipulation ${
                    activeTab === 'chart'
                      ? 'border-trading-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Price Chart
                </button>
              </div>

              {loading.matches && activeTab === 'matches' ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'hsl(var(--muted-foreground))' }} />
                </div>
              ) : loading.upcoming && activeTab === 'upcoming' ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'hsl(var(--muted-foreground))' }} />
                </div>
              ) : loading.chart && activeTab === 'chart' ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'hsl(var(--muted-foreground))' }} />
                </div>
              ) : (
                <>
                  {activeTab === 'matches' && (
                    <div className="space-y-2 sm:space-y-3">
                      {matchHistory.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-xs sm:text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No match history available</p>
                        </div>
                      ) : (
                        <> {/* Desktop Table View */}
                          <div className="hidden md:block overflow-x-auto">
                            <table className="trading-table w-full">
                              <thead>
                                <tr>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'left' }}>Match</th>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'center' }}>Date</th>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'center' }}>Market Cap</th>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'center' }}>Change</th>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'center' }}>%</th>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'center' }}>Price</th>
                                </tr>
                              </thead>
                              <tbody>
                                {matchHistory.map((event, index) => (
                                  <tr key={index} className="border-b border-gray-800/30">
                                    <td className="px-3 py-2.5" style={{ textAlign: 'left' }}>
                                      <div className="flex items-center gap-2">
                                        <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                          event.matchResult === 'win' ? 'bg-[#10B981]/20 text-[#10B981]' :
                                          event.matchResult === 'loss' ? 'bg-[#EF4444]/20 text-[#EF4444]' :
                                          'bg-gray-500/20 text-gray-400'
                                        }`}>
                                          {getResultBadge(event.matchResult)}
                                        </div>
                                        <span className="text-xs font-medium">{event.description}</span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5 text-[10px] font-mono" style={{ color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
                                      {new Date(event.date).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                      })}
                                    </td>
                                    <td className="px-3 py-2.5 text-[10px] font-mono" style={{ color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
                                      {formatCurrency(event.marketCapAfter)}
                                    </td>
                                    <td className={`px-3 py-2.5 text-[10px] font-mono ${
                                      event.priceImpact > 0 ? 'price-positive' :
                                      event.priceImpact < 0 ? 'price-negative' :
                                      ''
                                    }`} style={{ textAlign: 'center' }}>
                                      {event.priceImpact !== 0 && (
                                        <span>{event.priceImpact > 0 ? '+' : ''}${event.priceImpact.toFixed(2)}</span>
                                      )}
                                    </td>
                                    <td className={`px-3 py-2.5 text-xs font-semibold ${
                                      event.matchResult === 'draw' ? 'text-white' :
                                      event.priceImpactPercent >= 0 ? 'price-positive' : 'price-negative'
                                    }`} style={{ textAlign: 'center' }}>
                                      {event.priceImpactPercent >= 0 ? '+' : ''}{event.priceImpactPercent.toFixed(2)}%
                                    </td>
                                    <td className="px-3 py-2.5 text-xs font-mono font-semibold text-white" style={{ textAlign: 'center' }}>
                                      {formatCurrency(event.sharePriceAfter)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Mobile/Tablet Card View */}
                          <div className="md:hidden space-y-2">
                            {matchHistory.map((event, index) => {
                              const isPositive = event.priceImpactPercent >= 0;
                              const sharePriceChange = event.priceImpact; // Share price change (transfer amount / 1000)
                              const dateObj = new Date(event.date);
                              const formattedDate = dateObj.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              });

                              return (
                                <div
                                  key={index}
                                  className="bg-gray-800/40 border border-gray-700/30 rounded-lg p-2.5 sm:p-3 touch-manipulation"
                                >
                                  {/* Header Row: Result Badge + Opponent + Date */}
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                        event.matchResult === 'win' ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30' :
                                        event.matchResult === 'loss' ? 'bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/30' :
                                        'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                                      }`}>
                                        {getResultBadge(event.matchResult)}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[11px] sm:text-xs font-semibold text-white truncate">
                                          {event.description.replace('Match vs ', '')}
                                        </p>
                                        <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">
                                          {formattedDate}
                                        </p>
                                      </div>
                                    </div>
                                  </div>                               
                                  {/* Stats Row: Market Cap + Change + Share Price */}
                                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-700/20">
                                    <div>
                                      <p className="text-[9px] sm:text-[10px] text-gray-400 mb-0.5">Market Cap</p>
                                      <p className="text-[11px] sm:text-xs font-semibold font-mono text-white">
                                        {formatCurrency(event.marketCapAfter)}
                                      </p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-[9px] sm:text-[10px] text-gray-400 mb-0.5">Change</p>
                                      <div className="flex items-center justify-center gap-1">
                                        <p className={`text-[11px] sm:text-xs font-bold ${
                                          event.matchResult === 'draw' ? 'text-white' :
                                          isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'
                                        }`}>
                                          {isPositive ? '+' : ''}{event.priceImpactPercent.toFixed(1)}%
                                        </p>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-[9px] sm:text-[10px] text-gray-400 mb-0.5">Share Price</p>
                                      <p className="text-[11px] sm:text-xs font-semibold font-mono text-white">
                                        {formatCurrency(event.sharePriceAfter)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {activeTab === 'chart' && (
                    <div className="space-y-4">
                      {chartData.length === 0 ? (
                        <div className="text-center py-12">
                          <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No chart data available</p>
                        </div>
                      ) : (
                        <>
                          {/* Chart Summary - Mobile Optimized */}
                          {(() => {
                            // Always use launch price for initial price if provided, otherwise fall back to chart data
                            const chartInitialPrice = chartData.find(point => point.x === 0)?.y ?? chartData[0]?.y ?? 0;
                            const initialPrice = launchPrice && launchPrice > 0 ? launchPrice : chartInitialPrice;
                            
                            // Use current price from props if available (matches marketplace table), otherwise use chart's last point
                            const latestPrice = currentPrice && currentPrice > 0 ? currentPrice : (chartData[chartData.length - 1]?.y ?? 0);
                            
                            // Use current percent change from props if available (matches marketplace table), otherwise calculate from prices
                            const changePercent = currentPercentChange !== undefined ? currentPercentChange : calculateLifetimePercentChange(Number(latestPrice), Number(initialPrice));
                            const isPositive = changePercent >= 0;
                            
                            return (
                              <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4">
                                <div className="p-2 sm:p-3 rounded border border-gray-800/30">
                                  <p className="text-[9px] sm:text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Initial</p>
                                  <p className="text-xs sm:text-sm font-semibold font-mono">
                                    {formatCurrency(initialPrice)}
                                  </p>
                                </div>
                                
                                <div className="p-2 sm:p-3 rounded border border-gray-800/30">
                                  <p className="text-[9px] sm:text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Current</p>
                                  <p className="text-xs sm:text-sm font-semibold font-mono">
                                    {formatCurrency(latestPrice)}
                                  </p>
                                </div>
                                
                                <div className="p-2 sm:p-3 rounded border border-gray-800/30">
                                  <p className="text-[9px] sm:text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Change</p>
                                  <p className={`text-xs sm:text-sm font-semibold ${isPositive ? 'price-positive' : 'price-negative'}`}>
                                    {`${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`}
                                  </p>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Chart Container - Mobile Responsive */}
                          <div className="rounded border border-gray-800/30 p-2 sm:p-4 bg-secondary/10 -mx-2 sm:mx-0">
                            <div className="w-full overflow-x-auto">
                              <LineChart 
                                data={chartData.length > 50 ? chartData.slice(-50) : chartData}
                                width={400}
                                height={250}
                                color="#10b981"
                                showGrid={chartData.length <= 20}
                                showAxes={true}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}                  {activeTab === 'upcoming' && (
                    <div className="space-y-2 sm:space-y-3">
                      {upcomingMatches.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-xs sm:text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>No upcoming matches</p>
                        </div>
                      ) : (
                        <> {/* Desktop Table View */}
                          <div className="hidden md:block overflow-x-auto">
                            <table className="trading-table w-full">
                              <thead>
                                <tr>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'left' }}>Match</th>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'center' }}>Date</th>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'center' }}>{teamName} Price</th>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'center' }}>{teamName} Market Cap</th>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'center' }}>Opponent Price</th>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'center' }}>Opponent Market Cap</th>
                                </tr>
                              </thead>                              <tbody>                                
                                {upcomingMatches.map((match, index) => {
                                  const matchDate = new Date(match.date);
                                  const formattedDate = matchDate.toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    timeZone: 'Asia/Dubai'
                                  });
                                  
                                  return (
                                    <tr
                                      key={index}
                                      className={`hover:bg-gray-700/30 transition-colors ${
                                        (match.status === 'live' || match.status === 'closed') ? 'bg-red-500/5 border-2 border-red-500' : ''
                                      }`}
                                    >
                                      <td className="px-3 py-2.5 whitespace-nowrap">
                                        <div className="flex items-center justify-center">
                                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                            (match.status === 'live' || match.status === 'closed')
                                              ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30'
                                              : match.isHome 
                                                ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30' 
                                                : 'bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30'
                                          }`}>
                                            {(match.status === 'live' || match.status === 'closed') ? match.matchday : (match.isHome ? 'H' : 'A')}
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2.5 whitespace-nowrap">
                                        <div className="flex items-center justify-start gap-2">
                                          {(match.status === 'live' || match.status === 'closed') && (
                                            <Badge variant="outline" className="ml-1 text-yellow-400 border-yellow-400/50 text-[9px] px-1 py-0 animate-pulse flex-shrink-0">
                                              LIVE
                                            </Badge>
                                          )}
                                          <div className="flex items-center gap-2">
                                            <span>{formattedDate}</span>
                                            {match.status === 'closed' && match.homeScore !== null && match.awayScore !== null && (
                                              <div className="flex items-center gap-1">
                                                <span className="text-xs font-bold text-white">
                                                  {match.isHome ? match.homeScore : match.awayScore}
                                                </span>
                                                <span className="text-gray-500">-</span>
                                                <span className="text-xs font-bold text-white">
                                                  {match.isHome ? match.awayScore : match.homeScore}
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2.5 text-[10px] font-mono whitespace-nowrap" style={{ color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
                                        {formatCurrency(match.teamSharePrice)}
                                      </td>
                                      <td className="px-3 py-2.5 text-[10px] font-mono whitespace-nowrap" style={{ color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
                                        {formatCurrency(match.teamMarketCap)}
                                      </td>
                                      <td className="px-3 py-2.5 text-[10px] font-mono whitespace-nowrap" style={{ color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
                                        {formatCurrency(match.opponentSharePrice)}
                                      </td>
                                      <td className="px-3 py-2.5 text-[10px] font-mono whitespace-nowrap" style={{ color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
                                        {formatCurrency(match.opponentMarketCap)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>                          {/* Mobile/Tablet Card View */}                          <div className="md:hidden space-y-2">
                            {upcomingMatches.map((match, index) => {
                              const dateObj = new Date(match.date);
                              const formattedDate = dateObj.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                timeZone: 'Asia/Dubai'
                              });                              return (                                <div
                                  key={index}
                                  className={`rounded-lg p-2.5 sm:p-3 touch-manipulation ${
                                    (match.status === 'live' || match.status === 'closed') 
                                      ? 'bg-red-500/5 border-2 border-red-500' 
                                      : 'bg-gray-800/40 border border-gray-700/30'
                                  }`}
                                >
                                  {/* Header Row: Badge + Opponent + Date */}
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                        (match.status === 'live' || match.status === 'closed')
                                          ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30'
                                          : match.isHome 
                                            ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30' 
                                            : 'bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30'
                                      }`}>
                                        {(match.status === 'live' || match.status === 'closed') ? match.matchday : (match.isHome ? 'H' : 'A')}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <p className="text-[11px] sm:text-xs font-semibold text-white truncate">
                                            vs {match.opponent}
                                          </p>
                                          {(match.status === 'live' || match.status === 'closed') && (
                                            <Badge variant="outline" className="text-yellow-400 border-yellow-400/50 text-[9px] px-1 py-0 animate-pulse">
                                              LIVE
                                            </Badge>
                                          )}
                                        </div>
                                        {(match.status === 'live' || match.status === 'closed') && match.homeScore !== null && match.awayScore !== null ? (
                                          <div className="flex items-center gap-2 mt-1">
                                            <p className="text-[9px] sm:text-[10px] font-mono" style={{ color: '#C9A961' }}>
                                              {formattedDate}
                                            </p>
                                            <div className="flex items-center gap-1">
                                              <span className="text-sm font-bold text-white">
                                                {match.isHome ? match.homeScore : match.awayScore}
                                              </span>
                                              <span className="text-[10px] text-gray-500">-</span>
                                              <span className="text-sm font-bold text-white">
                                                {match.isHome ? match.awayScore : match.homeScore}
                                              </span>
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="text-[9px] sm:text-[10px] font-mono mt-0.5" style={{ color: '#C9A961' }}>
                                            {formattedDate}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Stats Row: Share Prices and Market Caps */}
                                  <div className="space-y-2 pt-2 border-t border-gray-700/20">
                                    {/* Selected Team */}
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <p className="text-[9px] sm:text-[10px] text-gray-400 mb-0.5">{teamName} Price</p>
                                        <p className="text-[11px] sm:text-xs font-semibold font-mono text-white">
                                          {formatCurrency(match.teamSharePrice)}
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-[9px] sm:text-[10px] text-gray-400 mb-0.5">{teamName} Market Cap</p>
                                        <p className="text-[11px] sm:text-xs font-semibold font-mono text-white">
                                          {formatCurrency(match.teamMarketCap)}
                                        </p>
                                      </div>
                                    </div>
                                    {/* Opponent Team */}
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <p className="text-[9px] sm:text-[10px] text-gray-400 mb-0.5">Opponent Price</p>
                                        <p className="text-[11px] sm:text-xs font-semibold font-mono text-white">
                                          {formatCurrency(match.opponentSharePrice)}
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-[9px] sm:text-[10px] text-gray-400 mb-0.5">Opponent Market Cap</p>
                                        <p className="text-[11px] sm:text-xs font-semibold font-mono text-white">
                                          {formatCurrency(match.opponentMarketCap)}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamDetailsSlideDown;