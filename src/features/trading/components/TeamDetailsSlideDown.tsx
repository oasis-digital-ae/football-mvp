import React, { useState, useEffect, useCallback } from 'react';
import { positionsService } from '@/shared/lib/database';
import type { DatabasePositionWithTeam } from '@/shared/types/database.types';
import type { DatabaseFixture } from '@/shared/lib/services/fixtures.service';
import type { DatabaseTeam } from '@/shared/lib/services/teams.service';
import { formatCurrency } from '@/shared/lib/formatters';
import { Loader2, TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase';
import { LineChart, ChartDataPoint } from '@/shared/components/ui/line-chart';
import { ChartSkeleton } from '@/shared/components/ui/skeleton';
import {
  calculateLifetimePercentChange,
  calculatePriceImpactPercent
} from '@/shared/lib/utils/calculations';
import { toDecimal, roundForDisplay, fromCents } from '@/shared/lib/utils/decimal';

interface TeamDetailsSlideDownProps {
  isOpen: boolean;
  teamId: number;
  teamName: string;
  userId: string;
  fixtures?: DatabaseFixture[];
  teams?: DatabaseTeam[];
  launchPrice?: number; // Launch price from club data for consistent Change calculation
}

// Utility functions
const extractOpponentName = (eventDescription?: string): string => {
  if (!eventDescription) return '';
  const match = eventDescription.match(/vs\s+(.+?)(?:\s|$)/i);
  return match?.[1]?.trim() || '';
};

const processChartData = (events: any[]): ChartDataPoint[] => {
  const initialStates = events.filter(e => e.ledger_type === 'initial_state');
  const matchEvents = events.filter(e => e.ledger_type !== 'initial_state');
  
  const sortedMatches = [...matchEvents].sort((a, b) => 
    new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
  );
  
  const chartPoints: ChartDataPoint[] = [];
  
  // Add initial state first
  initialStates.forEach((event: any) => {
    const sharePrice = roundForDisplay(fromCents(event.share_price_after || event.share_price_before || 0));
    if (sharePrice > 0) {
      chartPoints.push({ x: 0, y: sharePrice, label: 'Initial' });
    }
  });
  
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

const TeamDetailsSlideDown: React.FC<TeamDetailsSlideDownProps> = ({
  isOpen,
  teamId,
  teamName,
  userId,
  fixtures: parentFixtures,
  teams: parentTeams,
  launchPrice
}) => {
  const [activeTab, setActiveTab] = useState<'matches' | 'chart'>('matches');
  const [matchHistory, setMatchHistory] = useState<any[]>([]);
  const [userPosition, setUserPosition] = useState<DatabasePositionWithTeam | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState({ matches: false, chart: false });

  const fixtures = parentFixtures || [];
  const teams = parentTeams || [];


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
      
      const chartPoints = data && data.length > 0 ? processChartData(data) : [];
      setChartData(chartPoints);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error loading chart data:', error);
      setChartData([]);
    } finally {
      setLoading(prev => ({ ...prev, chart: false }));
    }
  }, [teamId]);

  const loadMatchesData = useCallback(async () => {
    if (!isOpen || !teamId) return;

    setLoading(prev => ({ ...prev, matches: true }));
    try {
      const [positionResult, ledgerData] = await Promise.all([
        positionsService.getByUserIdAndTeamId(userId, teamId),
        supabase
          .from('total_ledger')
          .select('*')
          .eq('team_id', teamId)
          .in('ledger_type', ['match_win', 'match_loss', 'match_draw'])
          .order('event_date', { ascending: false })
      ]);

      if (ledgerData.error) {
        if (process.env.NODE_ENV === 'development') console.error('Failed to get ledger data:', ledgerData.error);
        setMatchHistory([]);
        return;
      }

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
        const description = event.event_description || 'Match Result';
        // Convert from cents (BIGINT) to dollars
        const marketCapBefore = roundForDisplay(fromCents(event.market_cap_before || 0));
        const marketCapAfter = roundForDisplay(fromCents(event.market_cap_after || 0));
        const priceImpact = roundForDisplay(toDecimal(marketCapAfter).minus(marketCapBefore));
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
  }, [isOpen, teamId, userId]); // Removed fixtures and teams - they're not used in this function

  // Load match data when opened
  useEffect(() => {
    if (isOpen && teamId && userId) {
      loadMatchesData();
    }
  }, [isOpen, teamId, userId, loadMatchesData]);


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
                        <>
                          {/* Desktop Table View */}
                          <div className="hidden md:block overflow-x-auto">
                            <table className="trading-table w-full">
                              <thead>
                                <tr>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'left' }}>Match</th>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'center' }}>Date</th>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'center' }}>Market Cap</th>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'center' }}>Change</th>
                                  <th className="px-3 py-2 text-xs font-semibold" style={{ textAlign: 'center' }}>%</th>
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
                                      event.sharePriceAfter > event.sharePriceBefore ? 'price-positive' :
                                      event.sharePriceAfter < event.sharePriceBefore ? 'price-negative' :
                                      ''
                                    }`} style={{ textAlign: 'center' }}>
                                      {event.sharePriceAfter !== event.sharePriceBefore && (
                                        <span>{event.sharePriceAfter > event.sharePriceBefore ? '+' : ''}${(event.sharePriceAfter - event.sharePriceBefore).toFixed(2)}</span>
                                      )}
                                    </td>
                                    <td className={`px-3 py-2.5 text-xs font-semibold ${
                                      event.priceImpactPercent >= 0 ? 'price-positive' : 'price-negative'
                                    }`} style={{ textAlign: 'center' }}>
                                      {event.priceImpactPercent >= 0 ? '+' : ''}{event.priceImpactPercent.toFixed(2)}%
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
                              const priceChange = event.sharePriceAfter - event.sharePriceBefore;
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

                                  {/* Stats Row: Market Cap + Change */}
                                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-700/20">
                                    <div>
                                      <p className="text-[9px] sm:text-[10px] text-gray-400 mb-0.5">Market Cap</p>
                                      <p className="text-[11px] sm:text-xs font-semibold font-mono text-white">
                                        {formatCurrency(event.marketCapAfter)}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-[9px] sm:text-[10px] text-gray-400 mb-0.5">Change</p>
                                      <div className="flex items-center justify-end gap-1">
                                        {priceChange !== 0 && (
                                          <p className={`text-[10px] sm:text-xs font-semibold font-mono ${
                                            isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'
                                          }`}>
                                            {priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}
                                          </p>
                                        )}
                                        <p className={`text-[11px] sm:text-xs font-bold ${
                                          isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'
                                        }`}>
                                          {isPositive ? '+' : ''}{event.priceImpactPercent.toFixed(1)}%
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
                            // Calculate change using launch price if provided, otherwise use chart initial price
                            const initialPrice = launchPrice ?? chartData.find(point => point.x === 0)?.y ?? chartData[0]?.y ?? 0;
                            const latestPrice = chartData[chartData.length - 1]?.y ?? 0;
                            const changePercent = calculateLifetimePercentChange(Number(latestPrice), Number(initialPrice));
                            const isPositive = Number(latestPrice) >= Number(initialPrice);
                            
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
                                    {`${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%`}
                                  </p>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Chart Container */}
                          <div className="rounded border border-gray-800/30 p-4 bg-secondary/10">
                            <LineChart 
                              data={chartData.length > 50 ? chartData.slice(-50) : chartData}
                              width={chartData.length > 20 ? 600 : 800}
                              height={300}
                              color="#10b981"
                              showGrid={chartData.length <= 20}
                              showAxes={true}
                            />
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