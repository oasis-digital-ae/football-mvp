import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { teamStateSnapshotService, chartingUtils, type TeamStateHistoryPoint } from '@/shared/lib/team-state-snapshots';
import { formatCurrency } from '@/shared/lib/formatters';
import { TrendingUp, TrendingDown, BarChart3, LineChart } from 'lucide-react';

interface TeamChartProps {
  teamId: number;
  teamName: string;
}

const TeamChart: React.FC<TeamChartProps> = ({ teamId, teamName }) => {
  const [history, setHistory] = useState<TeamStateHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartType, setChartType] = useState<'market_cap' | 'share_price'>('market_cap');
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  const loadHistory = async () => {
    setLoading(true);
    try {
      const fromDate = getFromDate(timeRange);
      const data = await teamStateSnapshotService.getTeamStateHistory(
        teamId,
        fromDate,
        undefined
      );
      
      console.log('Loaded team history:', {
        teamId,
        timeRange,
        fromDate,
        dataCount: data.length,
        data: data.map(item => ({
          effective_at: item.effective_at,
          market_cap: item.market_cap,
          current_share_price: item.current_share_price,
          snapshot_type: item.snapshot_type,
          price_impact: item.price_impact,
          shares_traded: item.shares_traded,
          match_result: item.match_result
        }))
      });
      
      setHistory(data);
    } catch (error) {
      console.error('Failed to load team history:', error);
      setHistory([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  const getFromDate = (range: string): string | undefined => {
    const now = new Date();
    switch (range) {
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      case '90d':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return undefined;
    }
  };

  useEffect(() => {
    loadHistory();
  }, [teamId, timeRange]);

  const chartData = chartType === 'market_cap' 
    ? chartingUtils.prepareMarketCapChartData(history)
    : chartingUtils.prepareSharePriceChartData(history);

  // Debug logging
  console.log('Chart data debug:', {
    chartType,
    historyCount: history.length,
    chartDataCount: chartData.length,
    chartData: chartData.map((point, index) => ({
      index,
      x: point.x,
      y: point.y,
      date: new Date(point.x).toISOString(),
      type: point.type,
      priceImpact: point.priceImpact
    })),
    history: history.map((item, index) => ({
      index,
      effective_at: item.effective_at,
      market_cap: item.market_cap,
      current_share_price: item.current_share_price,
      snapshot_type: item.snapshot_type,
      price_impact: item.price_impact
    })),
    changeCalculation: chartData.length > 1 ? {
      firstValue: chartData[0]?.y,
      lastValue: chartData[chartData.length - 1]?.y,
      change: (chartData[chartData.length - 1]?.y || 0) - (chartData[0]?.y || 0)
    } : 'Not enough data'
  });

  const getChartTitle = () => {
    const metric = chartType === 'market_cap' ? 'Market Cap' : 'Share Price';
    return `${teamName} - ${metric} History`;
  };

  const getYAxisLabel = () => {
    return chartType === 'market_cap' ? 'Market Cap ($)' : 'Share Price ($)';
  };

  const getChartConfig = () => {
    return chartingUtils.getChartConfig(getChartTitle(), chartData, getYAxisLabel());
  };

  // Simple chart visualization using CSS
  const renderSimpleChart = () => {
    if (chartData.length === 0) return <div className="text-center py-8 text-gray-400">No data available</div>;

    const maxValue = Math.max(...chartData.map(d => d.y));
    const minValue = Math.min(...chartData.map(d => d.y));
    const range = maxValue - minValue;

    // Ensure we have a valid range
    if (range === 0) {
      return (
        <div className="h-64 flex items-center justify-center">
          <div className="text-center">
            <div className="text-gray-400 mb-2">No price variation</div>
            <div className="text-lg font-semibold">{formatCurrency(maxValue)}</div>
          </div>
        </div>
      );
    }

    return (
      <div className="h-64 relative bg-gray-900 rounded-lg p-4">
        {/* Chart area */}
        <div className="absolute inset-4 flex items-end justify-between">
          {chartData.map((point, index) => {
            const height = ((point.y - minValue) / range) * 100;
            const isPositive = point.priceImpact > 0;
            const isNegative = point.priceImpact < 0;
            const isNeutral = point.priceImpact === 0;
            
            return (
              <div key={index} className="flex flex-col items-center flex-1">
                <div 
                  className={`w-3 rounded-t transition-all duration-300 hover:opacity-80 ${
                    isPositive ? 'bg-green-500' : isNegative ? 'bg-red-500' : isNeutral ? 'bg-blue-500' : 'bg-gray-500'
                  }`}
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={`${new Date(point.x).toLocaleDateString()}: ${formatCurrency(point.y)}`}
                />
                <div className="text-xs text-gray-400 mt-2 text-center">
                  {new Date(point.x).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Y-axis labels */}
        <div className="absolute left-0 top-4 bottom-4 flex flex-col justify-between">
          <div className="text-xs text-gray-400 bg-gray-900 px-1 rounded">{formatCurrency(maxValue)}</div>
          <div className="text-xs text-gray-400 bg-gray-900 px-1 rounded">{formatCurrency(minValue)}</div>
        </div>
        
        {/* Grid lines */}
        <div className="absolute inset-4 pointer-events-none">
          {[0, 25, 50, 75, 100].map(percent => (
            <div 
              key={percent}
              className="absolute w-full border-t border-gray-700 opacity-30"
              style={{ bottom: `${percent}%` }}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {chartType === 'market_cap' ? <BarChart3 className="h-5 w-5" /> : <LineChart className="h-5 w-5" />}
            {getChartTitle()}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant={chartType === 'market_cap' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChartType('market_cap')}
            >
              Market Cap
            </Button>
            <Button
              variant={chartType === 'share_price' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChartType('share_price')}
            >
              Share Price
            </Button>
          </div>
        </div>
        
        <div className="flex gap-2">
          {(['7d', '30d', '90d', 'all'] as const).map(range => (
            <Button
              key={range}
              variant={timeRange === range ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange(range)}
            >
              {range === 'all' ? 'All Time' : range}
            </Button>
          ))}
        </div>
      </CardHeader>
      
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-gray-400">Loading chart data...</span>
          </div>
        ) : (
          <>
            {renderSimpleChart()}
            
            {/* Chart stats */}
            {chartData.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-400">Current Value</div>
                  <div className="font-semibold">
                    {formatCurrency(chartData[chartData.length - 1]?.y || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">Change</div>
                  <div className={`font-semibold ${
                    chartData.length > 1 
                      ? (chartData[chartData.length - 1]?.y || 0) > (chartData[0]?.y || 0)
                        ? 'text-green-400' 
                        : 'text-red-400'
                      : 'text-gray-400'
                  }`}>
                    {chartData.length > 1 
                      ? `${formatCurrency((chartData[chartData.length - 1]?.y || 0) - (chartData[0]?.y || 0))}`
                      : 'N/A'
                    }
                  </div>
                </div>
              </div>
            )}
            
            {/* Debug info for troubleshooting */}
            <div className="mt-4 p-2 bg-gray-900 rounded text-xs text-gray-400">
              <div>Debug: First={chartData[0]?.y}, Last={chartData[chartData.length - 1]?.y}, Change={chartData.length > 1 ? (chartData[chartData.length - 1]?.y || 0) - (chartData[0]?.y || 0) : 'N/A'}</div>
            </div>
            
            {/* Event markers */}
            {chartData.length > 0 && (
              <div className="mt-4">
                <div className="text-sm text-gray-400 mb-2">Recent Events:</div>
                <div className="space-y-1">
                  {chartData.slice(-5).reverse().map((point, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <div className={`w-2 h-2 rounded-full ${
                        point.type === 'match_result' 
                          ? point.matchResult === 'win' 
                            ? 'bg-green-500' 
                            : point.matchResult === 'loss' 
                              ? 'bg-red-500' 
                              : 'bg-gray-500'
                          : 'bg-blue-500'
                      }`} />
                      <span className="text-gray-300">
                        {new Date(point.x).toLocaleDateString()}
                      </span>
                      <span className="text-gray-400">
                        {point.type === 'match_result' 
                          ? `Match ${point.matchResult}`
                          : `${point.type.replace('_', ' ')}`
                        }
                      </span>
                      <span className={`font-medium ${
                        point.priceImpact > 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {point.priceImpact > 0 ? '+' : ''}{formatCurrency(point.priceImpact)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TeamChart;
