import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { positionsService } from '@/shared/lib/database';
import type { DatabasePositionWithTeam } from '@/shared/types/database.types';
import type { DatabaseFixture } from '@/shared/lib/services/fixtures.service';
import type { DatabaseTeam } from '@/shared/lib/services/teams.service';
import { formatCurrency } from '@/shared/lib/formatters';
import { Loader2, TrendingUp, TrendingDown, Minus, DollarSign, ShoppingCart, BarChart3 } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase';
import { LineChart, ChartDataPoint } from '@/shared/components/ui/line-chart';
import { ChartSkeleton } from '@/shared/components/ui/skeleton';

interface TeamDetailsSlideDownProps {
  isOpen: boolean;
  teamId: number;
  teamName: string;
  userId: string;
  fixtures?: DatabaseFixture[];
  teams?: DatabaseTeam[];
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
    const sharePrice = parseFloat(event.share_price_after || event.share_price_before || '0');
    if (sharePrice > 0) {
      chartPoints.push({ x: 0, y: sharePrice, label: 'Initial' });
    }
  });
  
  // Add match events in chronological order
  sortedMatches.forEach((event: any) => {
    const sharePrice = parseFloat(event.share_price_after || event.share_price_before || '0');
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
  teams: parentTeams
}) => {
  const [activeTab, setActiveTab] = useState<'matches' | 'orders' | 'chart'>('matches');
  const [matchHistory, setMatchHistory] = useState<any[]>([]);
  const [userPosition, setUserPosition] = useState<DatabasePositionWithTeam | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState({ matches: false, orders: false, chart: false });

  const fixtures = parentFixtures || [];
  const teams = parentTeams || [];

  const loadOrders = useCallback(async () => {
    if (!teamId) return;

    setLoading(prev => ({ ...prev, orders: true }));
    try {
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*, market_cap_before, market_cap_after, shares_outstanding_before, shares_outstanding_after')
        .eq('team_id', teamId)
        .eq('status', 'FILLED')
        .order('executed_at', { ascending: false });

      if (ordersError) throw ordersError;

      const ordersWithImpact = ordersData?.map((order) => {
        const { market_cap_before = 0, market_cap_after = 0, shares_outstanding_before = 0, shares_outstanding_after = 0 } = order;
        const navBefore = shares_outstanding_before > 0 ? market_cap_before / shares_outstanding_before : 20.00;
        const navAfter = shares_outstanding_after > 0 ? market_cap_after / shares_outstanding_after : 20.00;

        return {
          ...order,
          market_cap_impact: order.total_amount,
          market_cap_before,
          market_cap_after,
          share_price_before: navBefore,
          share_price_after: navAfter,
          cash_added_to_market_cap: order.total_amount
        };
      }) || [];

      setOrders(ordersWithImpact);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error loading orders:', error);
      setOrders([]);
    } finally {
      setLoading(prev => ({ ...prev, orders: false }));
    }
  }, [teamId]);

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
          .in('ledger_type', ['match_win', 'match_loss', 'match_draw', 'share_purchase'])
          .order('event_date', { ascending: false })
      ]);

      if (ledgerData.error) {
        if (process.env.NODE_ENV === 'development') console.error('Failed to get ledger data:', ledgerData.error);
        setMatchHistory([]);
        return;
      }

      const processedEvents = (ledgerData.data || []).map(event => {
        const isPurchase = event.ledger_type === 'share_purchase';
        
        if (isPurchase) {
          // Process purchase events
          const description = event.event_description || 'Share purchase';
          const priceImpact = parseFloat(event.price_impact?.toString() || '0');
          const priceImpactPercent = event.market_cap_before > 0 
            ? ((priceImpact / parseFloat(event.market_cap_before.toString())) * 100)
            : 0;

          return {
            date: event.event_date,
            description,
            marketCapBefore: parseFloat(event.market_cap_before?.toString() || '0'),
            marketCapAfter: parseFloat(event.market_cap_after?.toString() || '0'),
            sharePriceBefore: parseFloat(event.share_price_before?.toString() || '0'),
            sharePriceAfter: parseFloat(event.share_price_after?.toString() || '0'),
            priceImpact,
            priceImpactPercent,
            tradeAmount: priceImpact,
            matchResult: null,
            isMatch: false,
            isPurchase: true
          };
        } else {
          // Process match events
        const matchResult = event.ledger_type === 'match_win' ? 'win' : 
                           event.ledger_type === 'match_loss' ? 'loss' : 'draw';
        const description = event.event_description || 'Match Result';
          const priceImpact = parseFloat(event.market_cap_after?.toString() || '0') - parseFloat(event.market_cap_before?.toString() || '0');
          const priceImpactPercent = event.market_cap_before > 0 
            ? ((priceImpact / parseFloat(event.market_cap_before.toString())) * 100)
            : 0;

        return {
          date: event.event_date,
          description,
            marketCapBefore: parseFloat(event.market_cap_before?.toString() || '0'),
            marketCapAfter: parseFloat(event.market_cap_after?.toString() || '0'),
            sharePriceBefore: parseFloat(event.share_price_before?.toString() || '0'),
            sharePriceAfter: parseFloat(event.share_price_after?.toString() || '0'),
            priceImpact,
            priceImpactPercent,
          matchResult,
          isMatch: true,
          isPurchase: false
        };
        }
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

  // Load match data when opened
  useEffect(() => {
    if (isOpen && teamId) {
      loadMatchesData();
    }
  }, [isOpen, teamId, loadMatchesData]);

  // Load orders when switching to orders tab
  useEffect(() => {
    if (activeTab === 'orders' && teamId && orders.length === 0 && !loading.orders) {
      loadOrders();
    }
  }, [activeTab, teamId, loadOrders, orders.length, loading.orders]);

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
      setOrders([]);
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
        return <DollarSign className="w-4 h-4" />;
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
        return '$';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="slide-down-panel" data-open={isOpen}>
      <div className="slide-down-panel-inner">
        <div className="slide-down-panel-content">
          <Card className="w-full">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-base sm:text-lg font-semibold">
                  {teamName} Details
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={activeTab === 'matches' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('matches')}
                    className="text-xs sm:text-sm"
                  >
                    Matches
                  </Button>
                  <Button
                    variant={activeTab === 'orders' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('orders')}
                    className="text-xs sm:text-sm"
                  >
                    Orders
                  </Button>
                  <Button
                    variant={activeTab === 'chart' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('chart')}
                    className="text-xs sm:text-sm"
                  >
                    Chart
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {loading.matches ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  <span className="ml-2 text-sm text-gray-500">Loading...</span>
                </div>
              ) : (
                <>
                  {activeTab === 'matches' && (
                    <div className="space-y-4">
                      <h3 className="text-base sm:text-lg font-semibold flex items-center">
                        <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                        Match History & Share Price Impact
                      </h3>
                      
                      {/* Debug info for errors */}
                      {matchHistory.length === 0 && !loading.matches && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                          <div className="flex items-center">
                            <div className="ml-3">
                              <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                                Timeline Data Unavailable
                              </h4>
                              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                                Team market cap and share price data is not available. This may be because:
                              </p>
                              <ul className="text-sm text-yellow-700 dark:text-yellow-300 mt-1 ml-4 list-disc">
                                <li>The team has no market cap history yet</li>
                                <li>The database function needs to be updated</li>
                                <li>No matches have been played for this team</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {matchHistory.length === 0 ? (
                        <p className="text-gray-500 text-center py-4">No match history available</p>
                      ) : (
                        <div className="space-y-3">
                          {matchHistory.map((event, index) => (
                            <div key={index} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 sm:p-4">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                                    {(() => {
                                      const date = new Date(event.date);
                                      const year = date.getFullYear();
                                      const month = date.getMonth();
                                      const day = date.getDate();
                                      return new Date(year, month, day).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                      });
                                    })()}
                                  </span>
                                  <span className="font-medium text-sm sm:text-base">
                                    {event.description}
                                  </span>
                                </div>
                                <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
                                  event.isPurchase ? 'bg-blue-500 text-white' : getResultColor(event.matchResult || 'purchase')
                                }`}>
                                  {event.isPurchase ? <DollarSign className="w-4 h-4" /> : getResultIcon(event.matchResult || 'purchase')}
                                  <span>{event.isPurchase ? 'BUY' : getResultBadge(event.matchResult || 'purchase')}</span>
                                </div>
                              </div>
                              
                              <div className={`grid gap-3 sm:gap-4 text-sm ${event.isPurchase ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                                  <div>
                                    <span className="text-gray-600 dark:text-gray-400">Market Cap Impact:</span>
                                    <div className="font-medium">
                                      {formatCurrency(event.marketCapBefore)} → {formatCurrency(event.marketCapAfter)}
                                    <span className={`ml-2 ${event.priceImpact >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      ({event.priceImpact >= 0 ? '+' : ''}{formatCurrency(event.priceImpact)})
                                      </span>
                                    </div>
                                  </div>
                                  
                                {!event.isPurchase && (
                                  <div>
                                    <span className="text-gray-600 dark:text-gray-400">Share Price:</span>
                                    <div className="font-medium">
                                      ${event.sharePriceBefore.toFixed(1)} → ${event.sharePriceAfter.toFixed(1)}
                                      {event.priceImpactPercent !== 0 && (
                                        <span className={`ml-2 ${event.priceImpactPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          {event.priceImpactPercent >= 0 ? '+' : ''}{event.priceImpactPercent.toFixed(1)}%
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                </div>

                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'orders' && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold flex items-center">
                        <ShoppingCart className="w-5 h-5 mr-2" />
                        Orders & Cash Impact
                      </h3>
                      
                      {loading.orders ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                          <span className="ml-2 text-sm text-gray-500">Loading...</span>
                        </div>
                      ) : orders.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-gray-500">No orders found for this team</p>
                          <p className="text-sm text-gray-400 mt-2">
                            Orders will appear here once shares are purchased
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Summary */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                              <h4 className="text-sm font-medium text-blue-900 dark:text-blue-300">Total Cash Added</h4>
                              <p className="text-2xl font-bold text-blue-700 dark:text-blue-200">
                                {formatCurrency(orders.reduce((sum, order) => sum + order.cash_added_to_market_cap, 0))}
                              </p>
                              <p className="text-sm text-blue-600 dark:text-blue-400">to market cap</p>
                            </div>
                            
                            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                              <h4 className="text-sm font-medium text-green-900 dark:text-green-300">Total Shares Traded</h4>
                              <p className="text-2xl font-bold text-green-700 dark:text-green-200">
                                {orders.reduce((sum, order) => sum + order.quantity, 0).toLocaleString()}
                              </p>
                              <p className="text-sm text-green-600 dark:text-green-400">shares purchased</p>
                            </div>
                            
                            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                              <h4 className="text-sm font-medium text-purple-900 dark:text-purple-300">Total Orders</h4>
                              <p className="text-2xl font-bold text-purple-700 dark:text-purple-200">
                                {orders.length}
                              </p>
                              <p className="text-sm text-purple-600 dark:text-purple-400">completed orders</p>
                            </div>
                          </div>

                          {/* Orders List */}
                          <div className="space-y-3">
                            {orders.map((order, index) => (
                              <div key={order.id} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                                <div className="flex justify-between items-start mb-3">
                                  <div>
                                    <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                      Order #{order.id} - {order.quantity} shares @ {formatCurrency(order.price_per_share)}
                                    </h4>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                      {new Date(order.executed_at || order.updated_at).toLocaleDateString()} at{' '}
                                      {new Date(order.executed_at || order.updated_at).toLocaleTimeString()}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-lg font-bold text-green-600 dark:text-green-400">
                                      +{formatCurrency(order.cash_added_to_market_cap)}
                                    </div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400">cash added</div>
                                  </div>
                                </div>
                                
                                {/* Market Cap Impact */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
                                  <div>
                                    <p className="font-medium text-gray-700 dark:text-gray-300">Market Cap Before</p>
                                    <p className="text-lg font-semibold">{formatCurrency(order.market_cap_before)}</p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-gray-700 dark:text-gray-300">Market Cap After</p>
                                    <p className="text-lg font-semibold">{formatCurrency(order.market_cap_after)}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {activeTab === 'chart' && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold flex items-center">
                        <BarChart3 className="w-5 h-5 mr-2" />
                        Share Price vs Match Day
                      </h3>
                      
                      {loading.chart ? (
                        <ChartSkeleton />
                      ) : chartData.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-gray-500">No chart data available</p>
                          <p className="text-sm text-gray-400 mt-2">
                            Chart will show share price progression over time
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Chart Summary */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                              <h4 className="text-sm font-medium text-blue-900 dark:text-blue-300">Initial Share Price</h4>
                              <p className="text-lg font-bold text-blue-700 dark:text-blue-200">
                                {formatCurrency(chartData.find(point => point.x === 0)?.y || chartData[0]?.y || 0)}
                              </p>
                            </div>
                            
                            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                              <h4 className="text-sm font-medium text-green-900 dark:text-green-300">Latest Share Price</h4>
                              <p className="text-lg font-bold text-green-700 dark:text-green-200">
                                {formatCurrency(chartData[chartData.length - 1]?.y || 0)}
                              </p>
                            </div>
                            
                            <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
                              <h4 className="text-sm font-medium text-purple-900 dark:text-purple-300">Total Change</h4>
                              <p className="text-lg font-bold text-purple-700 dark:text-purple-200">
                                {chartData.length > 1 ? (() => {
                                  const initialPrice = chartData.find(point => point.x === 0)?.y || chartData[0]?.y || 0;
                                  const latestPrice = chartData[chartData.length - 1]?.y || 0;
                                  const changePercent = initialPrice > 0 ? ((latestPrice - initialPrice) / initialPrice * 100).toFixed(1) : '0';
                                  return `${changePercent}%`;
                                })() : '0%'}
                              </p>
                            </div>
                          </div>

                          {/* Chart Container */}
                          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                            <LineChart 
                              data={chartData.length > 50 ? chartData.slice(-50) : chartData}
                              width={chartData.length > 20 ? 600 : 800}
                              height={350}
                              color="#10b981"
                              showGrid={chartData.length <= 20}
                              showAxes={true}
                            />
                          </div>

                          {/* Chart Info */}
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            <p>📈 Chart shows share price progression from initial state through matches</p>
                            <p>💡 Match Day numbers represent the chronological sequence of events</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TeamDetailsSlideDown;