// Trade history table component for admin dashboard
import React, { useState } from 'react';
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
  ArrowDown
} from 'lucide-react';
import { useTradeHistory } from '../hooks/useTradeHistory';
import { TradeFilters } from './TradeFilters';
import { formatCurrency } from '@/shared/lib/formatters';
import type { TradeHistoryFilters } from '../types/admin.types';

type SortField = 'executed_at' | 'username' | 'teamName' | 'order_type' | 'quantity' | 'price_per_share' | 'total_amount';
type SortDirection = 'asc' | 'desc';

export const TradeHistoryTable: React.FC = () => {
  const [filters, setFilters] = useState<TradeHistoryFilters>({});
  const [sortField, setSortField] = useState<SortField>('executed_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { trades, loading, error, updateFilters, clearFilters } = useTradeHistory(filters);

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
          aValue = new Date((a as any).executed_at || (a as any).created_at).getTime();
          bValue = new Date((b as any).executed_at || (b as any).created_at).getTime();
          break;
        case 'username':
          aValue = (a as any).username.toLowerCase();
          bValue = (b as any).username.toLowerCase();
          break;
        case 'teamName':
          aValue = (a as any).teamName.toLowerCase();
          bValue = (b as any).teamName.toLowerCase();
          break;
        case 'order_type':
          aValue = (a as any).order_type;
          bValue = (b as any).order_type;
          break;
        case 'quantity':
          aValue = (a as any).quantity;
          bValue = (b as any).quantity;
          break;
        case 'price_per_share':
          aValue = (a as any).price_per_share;
          bValue = (b as any).price_per_share;
          break;
        case 'total_amount':
          aValue = (a as any).total_amount;
          bValue = (b as any).total_amount;
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

    const csvData = trades.map(trade => {
      const t = trade as any;
      return [
        new Date(t.executed_at || t.created_at).toISOString(),
        t.username,
        t.teamName,
        t.order_type,
        t.quantity,
        t.price_per_share,
        t.total_amount,
        t.status,
        t.market_cap_before || '',
        t.market_cap_after || '',
        (() => {
          const change = (t.market_cap_after || 0) - (t.market_cap_before || 0);
          return Math.abs(change) > 0.01 ? change.toFixed(2) : '0.00';
        })()
      ];
    });

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `trade-history-${new Date().toISOString().split('T')[0]}.csv`);
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
              <CardTitle>Trade History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-24" />
                  </div>
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
          <CardTitle>Trade History</CardTitle>
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

      {/* Trade History Table */}
      <div className="lg:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span>Trade History</span>
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
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('executed_at')}
                        className="h-auto p-0 font-medium"
                      >
                        Date
                        <SortIcon field="executed_at" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('username')}
                        className="h-auto p-0 font-medium"
                      >
                        User
                        <SortIcon field="username" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('teamName')}
                        className="h-auto p-0 font-medium"
                      >
                        Team
                        <SortIcon field="teamName" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('order_type')}
                        className="h-auto p-0 font-medium"
                      >
                        Type
                        <SortIcon field="order_type" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('quantity')}
                        className="h-auto p-0 font-medium"
                      >
                        Quantity
                        <SortIcon field="quantity" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('price_per_share')}
                        className="h-auto p-0 font-medium"
                      >
                        Price
                        <SortIcon field="price_per_share" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('total_amount')}
                        className="h-auto p-0 font-medium"
                      >
                        Total
                        <SortIcon field="total_amount" />
                      </Button>
                    </TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTrades.map((trade) => {
                    const t = trade as any;
                    return (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div className="text-sm">
                            {new Date(t.executed_at || t.created_at).toLocaleDateString()}
                            <br />
                            <span className="text-muted-foreground">
                              {new Date(t.executed_at || t.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{t.username}</p>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{t.teamName}</p>
                        </TableCell>
                        <TableCell>
                          {getOrderTypeBadge(t.order_type)}
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{t.quantity}</p>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{formatCurrency(t.price_per_share)}</p>
                        </TableCell>
                        <TableCell>
                          <p className="font-semibold">{formatCurrency(t.total_amount)}</p>
                          {t.market_cap_before !== undefined && t.market_cap_after !== undefined && (
                            (() => {
                              // Fixed Shares Model: Market cap doesn't change on purchases/sales
                              const marketCapChange = Math.abs((t.market_cap_after || 0) - (t.market_cap_before || 0));
                              const hasMarketCapChange = marketCapChange > 0.01; // Only show if actually changed (> 1 cent)
                              
                              if (hasMarketCapChange) {
                                return (
                                  <p className="text-xs text-muted-foreground">
                                    MC: {formatCurrency(t.market_cap_before || 0)} → {formatCurrency(t.market_cap_after || 0)}
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
                          {getStatusBadge(t.status)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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

