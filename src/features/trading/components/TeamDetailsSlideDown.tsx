import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { positionsService } from '@/shared/lib/database';
import type { DatabasePositionWithTeam } from '@/shared/types/database.types';
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
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  
  // Orders tab state
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  
  // Chart tab state
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartLoaded, setChartLoaded] = useState(false);

  const fixtures = useMemo(() => parentFixtures || [], [parentFixtures]);
  const teams = useMemo(() => parentTeams || [], [parentTeams]);

  const loadOrders = useCallback(async () => {
    if (!teamId) return;

    setOrdersLoading(true);
    try {
      // Get orders for the team
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('team_id', teamId)
        .eq('status', 'FILLED')
        .order('executed_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Get current team data
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('market_cap, shares_outstanding')
        .eq('id', teamId)
        .single();

      if (teamError) throw teamError;

      // Calculate market cap impact for each order
      const ordersWithImpact = ordersData.map((order, index) => {
        const previousOrders = ordersData.slice(index + 1);
        const cumulativeMarketCapImpact = previousOrders.reduce((sum, prevOrder) => {
          return sum + (prevOrder.total_amount || 0);
        }, 0);

        const marketCapBeforeAllOrders = team.market_cap - cumulativeMarketCapImpact - order.total_amount;
        const marketCapAfterThisOrder = marketCapBeforeAllOrders + order.total_amount;

        return {
          ...order,
          market_cap_impact: order.total_amount,
          market_cap_before: Math.max(marketCapBeforeAllOrders, 0.01),
          market_cap_after: marketCapAfterThisOrder,
          share_price_before: marketCapBeforeAllOrders / (team.shares_outstanding - order.quantity),
          share_price_after: marketCapAfterThisOrder / team.shares_outstanding,
          cash_added_to_market_cap: order.total_amount,
          order_sequence: ordersData.length - index
        };
      });

      setOrders(ordersWithImpact.reverse());
    } catch (error) {
      // Handle error silently in production, track for monitoring
      if (process.env.NODE_ENV === 'development') {
        console.error('Error loading orders:', error);
      }
      setOrders([]);
    } finally {
      setOrdersLoading(false);
      setOrdersLoaded(true);
    }
  }, [teamId]);

  const loadChartData = useCallback(async () => {
    if (!teamId) return;

    setChartLoading(true);
    try {
      // Get timeline data directly from total_ledger
      const { data: timelineData, error } = await supabase.rpc('get_team_complete_timeline', { 
        p_team_id: teamId 
      });

      if (error) throw error;

      if (!timelineData || timelineData.length === 0) {
        setChartData([]);
        return;
      }

      // Process timeline events chronologically from total_ledger
      const sortedEvents = timelineData.sort((a: any, b: any) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
      
      const chartPoints: ChartDataPoint[] = [];
      let dayCounter = 1;

      sortedEvents.forEach((event: any) => {
        // Use actual share price from total_ledger
        const sharePrice = parseFloat(event.share_price_after || event.share_price_before || '0');
        
        // Include initial state and match events
        if (event.event_type === 'initial' || event.event_type === 'match') {
          // Ensure we have valid data
          if (sharePrice > 0) {
            chartPoints.push({
              x: event.event_type === 'initial' ? 0 : dayCounter, // Start at 0 for initial, then increment days
              y: sharePrice,
              label: event.event_type === 'initial' ? 'Initial' : `Day ${dayCounter}`
            });
            
            if (event.event_type === 'match') {
              dayCounter++;
            }
          }
        }
      });

      setChartData(chartPoints);
    } catch (error) {
      // Handle error silently in production
      if (process.env.NODE_ENV === 'development') {
        console.error('Error loading chart data:', error);
      }
      setChartData([]);
    } finally {
      setChartLoading(false);
      setChartLoaded(true);
    }
  }, [teamId]);

  const loadTeamDataFast = useCallback(async () => {
    if (!isOpen || !teamId) return;

    setLoading(true);
    try {
      // Fetch user position and timeline的数据 in parallel
      const [positionResult, timelineData] = await Promise.all([
        positionsService.getByUserIdAndTeamId(userId, teamId),
        supabase.rpc('get_team_complete_timeline', { p_team_id: teamId })
      ]);

      if (timelineData.error) {
        // Handle error silently in production
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to get team timeline:', timelineData.error);
          console.error('Error details:', JSON.stringify(timelineData.error, null, 2));
        }
        setMatchHistory([]);
        setLoading(false);
        setDataLoaded(true);
        return;
      }

      // Process timeline data into display format
      const processedEvents = [];
      for (const event of timelineData.data || []) {
        if (event.event_type === 'initial') {
          continue; // Skip initial event
        }

        const isMatch = event.event_type === 'match';
        const isPurchase = event.event_type === 'purchase';

        // Calculate user P/L for matches if user has position
        let userPL = 0;
        if (positionResult && positionResult.quantity > 0 && isMatch) {
          userPL = (event.share_price_after - event.share_price_before) * positionResult.quantity;
        }

        processedEvents.push({
          event_type: event.event_type,
          date: event.event_date,
          description: event.description,
          marketCapBefore: event.market_cap_before,
          marketCapAfter: event.market_cap_after,
          sharesOutstanding: event.shares_outstanding,
          sharePriceBefore: event.share_price_before,
          sharePriceAfter: event.share_price_after,
          priceImpact: event.price_impact,
          priceImpactPercent: event.market_cap_before > 0 ? (event.price_impact / event.market_cap_before) * 100 : 0,
          sharesTraded: event.shares_traded,
          tradeAmount: event.trade_amount,
          opponentName: event.opponent_name,
          matchResult: event.match_result,
          score: event.score,
          userPL: userPL,
          isMatch: isMatch,
          isPurchase: isPurchase
        });
      }

      setUserPosition(positionResult);
      setMatchHistory(processedEvents);
      setDataLoaded(true);
    } catch (error) {
      // Handle error silently in production
      if (process.env.NODE_ENV === 'development') {
        console.error('Error loading team data:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
      }
      setMatchHistory([]);
      setUserPosition(null);
      setDataLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [isOpen, teamId, userId]);

  useEffect(() => {
    if (isOpen && teamId) {
      // Reset data first to ensure fresh load
      setDataLoaded(false);
      setMatchHistory([]);
      setUserPosition(null);
      setOrders([]);
      setOrdersLoaded(false);
      setChartData([]);
      setChartLoaded(false);
      
      // Then load fresh data
      loadTeamDataFast();
    }
  }, [isOpen, teamId, loadTeamDataFast]);

  // Load orders when switching to orders tab
  useEffect(() => {
    if (activeTab === 'orders' && teamId && orders.length === 0) {
      loadOrders();
    }
  }, [activeTab, teamId, loadOrders, orders.length]);

  // Load chart data when switching to chart tab
  useEffect(() => {
    if (activeTab === 'chart' && teamId && chartData.length === 0) {
      loadChartData();
    }
  }, [activeTab, teamId, loadChartData, chartData.length]);

  // Reset data when panel closes or team changes
  useEffect(() => {
    if (!isOpen) {
      setDataLoaded(false);
      setMatchHistory([]);
      setUserPosition(null);
      setActiveTab('matches');
      setOrders([]);
      setOrdersLoaded(false);
      setChartData([]);
      setChartLoaded(false);
    }
  }, [isOpen]);

  // Reset data when team changes
  useEffect(() => {
    setDataLoaded(false);
    setMatchHistory([]);
    setUserPosition(null);
    setOrdersLoaded(false);
    setChartLoaded(false);
  }, [teamId]);


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
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">
                  {teamName} Details
                </CardTitle>
                <div className="flex space-x-2">
                  <Button
                    variant={activeTab === 'matches' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('matches')}
                  >
                    Matches
                  </Button>
                  <Button
                    variant={activeTab === 'orders' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('orders')}
                  >
                    Orders
                  </Button>
                  <Button
                    variant={activeTab === 'chart' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('chart')}
                  >
                    Chart
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  <span className="ml-2 text-sm text-gray-500">Loading...</span>
                </div>
              ) : (
                <>
                  {activeTab === 'matches' && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold flex items-center">
                        <TrendingUp className="w-5 h-5 mr-2" />
                        Match History & Share Price Impact
                      </h3>
                      
                      {/* Debug info for errors */}
                      {matchHistory.length === 0 && dataLoaded && (
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
                            <div key={index} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-3">
                                  <span className="text-sm text-gray-600 dark:text-gray-400">
                                    {new Date(event.date).toLocaleDateString()}
                                  </span>
                                  <span className="font-medium">
                                    {event.description}
                                  </span>
                                </div>
                                <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${getResultColor(event.matchResult || 'purchase')}`}>
                                  {getResultIcon(event.matchResult || 'purchase')}
                                  <span>{getResultBadge(event.matchResult || 'purchase')}</span>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-600 dark:text-gray-400">Market Cap Impact:</span>
                                  <div className="font-medium">
                                    {formatCurrency(event.marketCapBefore)} → {formatCurrency(event.marketCapAfter)} 
                                    {event.priceImpactPercent !== 0 && (
                                      <span className={`ml-2 ${event.priceImpactPercent > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {event.priceImpactPercent > 0 ? '+' : ''}{event.priceImpactPercent.toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                                
                                <div>
                                  <span className="text-gray-600 dark:text-gray-400">Share Price:</span>
                                  <div className="font-medium">
                                    ${event.sharePriceBefore.toFixed(1)} → ${event.sharePriceAfter.toFixed(1)}
                                  </div>
                                </div>
                              </div>

                              {event.isPurchase && (
                                <div className="mt-2 text-sm">
                                  <span className="text-gray-600 dark:text-gray-400">Cash Injection:</span>
                                  <span className="font-medium text-blue-600 ml-2">
                                    {formatCurrency(event.tradeAmount)} ({event.sharesTraded} shares)
                                  </span>
                                </div>
                              )}

                              {event.userPL !== 0 && (
                                <div className="mt-2 text-sm">
                                  <span className="text-gray-600 dark:text-gray-400">Your P/L:</span>
                                  <span className={`font-medium ml-2 ${event.userPL > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {event.userPL > 0 ? '+' : ''}{formatCurrency(event.userPL)}
                                  </span>
                                </div>
                              )}
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
                      
                      {ordersLoading ? (
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
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
                                <div className="grid grid-cols-2 md:grid-cols-2 gap-4 text-sm">
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
                      
                      {chartLoading ? (
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