// Unified trading activity table (consolidates UserInvestmentsTable and TradeHistoryTable)
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { 
  TrendingUp, 
  TrendingDown, 
  Download, 
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  BarChart3
} from 'lucide-react';
import { useTradeHistory } from '../hooks/useTradeHistory';
import { TradeFilters } from './TradeFilters';
import { formatCurrency } from '@/shared/lib/formatters';
import type { TradeHistoryFilters } from '../types/admin.types';
import { adminService } from '@/shared/lib/services/admin.service';

type SortField = 'executed_at' | 'username' | 'teamName' | 'order_type' | 'quantity' | 'price_per_share' | 'total_amount';
type SortDirection = 'asc' | 'desc';

interface TradingStats {
  totalVolume24h: number;
  totalVolume7d: number;
  totalVolume30d: number;
  totalVolumeAll: number;
  buyCount: number;
  sellCount: number;
  buyVolume: number;
  sellVolume: number;
  averageTradeSize: number;
}

export const TradingActivityTable: React.FC = () => {
  const [filters, setFilters] = useState<TradeHistoryFilters>({});
  const [sortField, setSortField] = useState<SortField>('executed_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [stats, setStats] = useState<TradingStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const { trades, loading, error, updateFilters, clearFilters } = useTradeHistory(filters);

  useEffect(() => {
    loadTradingStats();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadTradingStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadTradingStats = async () => {
    try {
      setLoadingStats(true);
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [trades24h, trades7d, trades30d, tradesAll] = await Promise.all([
        adminService.getTradeHistory({ dateRange: { start: oneDayAgo.toISOString(), end: now.toISOString() } }),
        adminService.getTradeHistory({ dateRange: { start: sevenDaysAgo.toISOString(), end: now.toISOString() } }),
        adminService.getTradeHistory({ dateRange: { start: thirtyDaysAgo.toISOString(), end: now.toISOString() } }),
        adminService.getTradeHistory({})
      ]);

      const buyTrades = tradesAll.filter(t => t.order_type === 'BUY');
      const sellTrades = tradesAll.filter(t => t.order_type === 'SELL');

      setStats({
        totalVolume24h: trades24h.reduce((sum, t) => sum + Number(t.total_amount), 0),
        totalVolume7d: trades7d.reduce((sum, t) => sum + Number(t.total_amount), 0),
        totalVolume30d: trades30d.reduce((sum, t) => sum + Number(t.total_amount), 0),
        totalVolumeAll: tradesAll.reduce((sum, t) => sum + Number(t.total_amount), 0),
        buyCount: buyTrades.length,
        sellCount: sellTrades.length,
        buyVolume: buyTrades.reduce((sum, t) => sum + Number(t.total_amount), 0),
        sellVolume: sellTrades.reduce((sum, t) => sum + Number(t.total_amount), 0),
        averageTradeSize: tradesAll.length > 0 
          ? tradesAll.reduce((sum, t) => sum + Number(t.total_amount), 0) / tradesAll.length 
          : 0
      });
    } catch (error) {
      console.error('Error loading trading stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedTrades = React.useMemo(() => {
    if (!trades) return [];

    return [...trades].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'executed_at':
          aValue = new Date(a.executed_at || a.created_at).getTime();
          bValue = new Date(b.executed_at || b.created_at).getTime();
          break;
        case 'username':
          aValue = a.username.toLowerCase();
          bValue = b.username.toLowerCase();
          break;
        case 'teamName':
          aValue = a.teamName.toLowerCase();
          bValue = b.teamName.toLowerCase();
          break;
        case 'order_type':
          aValue = a.order_type;
          bValue = b.order_type;
          break;
        case 'quantity':
          aValue = a.quantity;
          bValue = b.quantity;
          break;
        case 'price_per_share':
          aValue = a.price_per_share;
          bValue = b.price_per_share;
          break;
        case 'total_amount':
          aValue = a.total_amount;
          bValue = b.total_amount;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [trades, sortField, sortDirection]);

  const handleExportCSV = () => {
    if (!trades || trades.length === 0) return;

    const headers = [
      'Date',
      'User',
      'Team',
      'Type',
      'Quantity',
      'Price per Share',
      'Total Amount',
      'Status',
      'Market Cap Before',
      'Market Cap After',
      'Market Cap Change'
    ];

    const csvData = sortedTrades.map(trade => [
      new Date(trade.executed_at || trade.created_at).toISOString(),
      trade.username,
      trade.teamName,
      trade.order_type,
      trade.quantity,
      trade.price_per_share,
      trade.total_amount,
      trade.status,
      trade.market_cap_before || '',
      trade.market_cap_after || '',
      (() => {
        const change = (trade.market_cap_after || 0) - (trade.market_cap_before || 0);
        return Math.abs(change) > 0.01 ? change.toFixed(2) : '0.00';
      })()
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `trading-activity-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4" />;
    }
    return sortDirection === 'asc' ? 
      <ArrowUp className="h-4 w-4" /> : 
      <ArrowDown className="h-4 w-4" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'FILLED':
        return <Badge variant="default" className="bg-green-100 text-green-800">Filled</Badge>;
      case 'PENDING':
        return <Badge variant="secondary">Pending</Badge>;
      case 'CANCELLED':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getOrderTypeBadge = (orderType: string) => {
    return orderType === 'BUY' ? (
      <Badge variant="default" className="bg-blue-100 text-blue-800">
        <TrendingUp className="h-3 w-3 mr-1" />
        Buy
      </Badge>
    ) : (
      <Badge variant="destructive">
        <TrendingDown className="h-3 w-3 mr-1" />
        Sell
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Trading Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trading Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Filters */}
      <div className="lg:col-span-1">
        <TradeFilters
          filters={filters}
          onFiltersChange={updateFilters}
          onClearFilters={clearFilters}
        />
      </div>

      {/* Trading Activity Table */}
      <div className="lg:col-span-3 space-y-6">
        {/* Trading Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Trading Statistics
              </div>
              <Button variant="outline" size="sm" onClick={loadTradingStats} disabled={loadingStats}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingStats ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingStats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">24h Volume</p>
                  <p className="text-lg font-bold">{formatCurrency(stats.totalVolume24h)}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">7d Volume</p>
                  <p className="text-lg font-bold">{formatCurrency(stats.totalVolume7d)}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Buy vs Sell</p>
                  <p className="text-lg font-bold">
                    {stats.buyCount} / {stats.sellCount}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {stats.buyCount + stats.sellCount > 0 
                      ? ((stats.buyCount / (stats.buyCount + stats.sellCount)) * 100).toFixed(1) + '% buy'
                      : '0%'}
                  </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Avg Trade Size</p>
                  <p className="text-lg font-bold">{formatCurrency(stats.averageTradeSize)}</p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Trading Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span>Trading Activity</span>
                <Badge variant="secondary">{sortedTrades.length} trades</Badge>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button variant="ghost" onClick={() => handleSort('executed_at')} className="h-auto p-0 font-medium">
                        Date <SortIcon field="executed_at" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" onClick={() => handleSort('username')} className="h-auto p-0 font-medium">
                        User <SortIcon field="username" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" onClick={() => handleSort('teamName')} className="h-auto p-0 font-medium">
                        Team <SortIcon field="teamName" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" onClick={() => handleSort('order_type')} className="h-auto p-0 font-medium">
                        Type <SortIcon field="order_type" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-center">
                      <Button variant="ghost" onClick={() => handleSort('quantity')} className="h-auto p-0 font-medium">
                        Shares <SortIcon field="quantity" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-center">
                      <Button variant="ghost" onClick={() => handleSort('price_per_share')} className="h-auto p-0 font-medium">
                        Price <SortIcon field="price_per_share" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-center">
                      <Button variant="ghost" onClick={() => handleSort('total_amount')} className="h-auto p-0 font-medium">
                        Total <SortIcon field="total_amount" />
                      </Button>
                    </TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTrades.map((trade) => (
                    <TableRow key={trade.id}>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(trade.executed_at || trade.created_at).toLocaleDateString()}
                          <br />
                          <span className="text-muted-foreground">
                            {new Date(trade.executed_at || trade.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{trade.username}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{trade.teamName}</p>
                      </TableCell>
                      <TableCell>
                        {getOrderTypeBadge(trade.order_type)}
                      </TableCell>
                      <TableCell className="text-center">
                        <p className="font-medium font-mono">{trade.quantity}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <p className="font-medium font-mono">{formatCurrency(trade.price_per_share)}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <p className="font-semibold font-mono">{formatCurrency(trade.total_amount)}</p>
                        {trade.market_cap_before !== undefined && trade.market_cap_after !== undefined && (
                          (() => {
                            const marketCapChange = Math.abs((trade.market_cap_after || 0) - (trade.market_cap_before || 0));
                            const hasMarketCapChange = marketCapChange > 0.01;
                            
                            if (hasMarketCapChange) {
                              return (
                                <p className="text-xs text-muted-foreground font-mono">
                                  MC: {formatCurrency(trade.market_cap_before || 0)} → {formatCurrency(trade.market_cap_after || 0)}
                                </p>
                              );
                            } else {
                              return (
                                <p className="text-xs text-muted-foreground" title="Market cap only changes on match results, not trades">
                                  MC: No change
                                </p>
                              );
                            }
                          })()
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(trade.status)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {sortedTrades.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No trades found matching your filters.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};




