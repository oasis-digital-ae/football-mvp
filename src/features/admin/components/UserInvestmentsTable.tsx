// User investments table component for admin dashboard
import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Search, 
  Users, 
  AlertCircle,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { useUserInvestments } from '../hooks/useUserInvestments';
import { formatCurrency } from '@/shared/lib/formatters';
import type { UserInvestment } from '../types/admin.types';

type SortField = 'username' | 'totalInvested' | 'teamName' | 'shares' | 'pricePerShare' | 'firstInvestmentDate' | 'profitLoss' | 'orderType' | 'currentSharePrice' | 'marketCapChange';
type SortDirection = 'asc' | 'desc';

export const UserInvestmentsTable: React.FC = () => {
  const { investments, loading, error, refetch } = useUserInvestments();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('totalInvested');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredAndSortedInvestments = useMemo(() => {
    if (!investments) return [];

    // Filter by search term
    let filtered = investments.filter(investment =>
      investment.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (investment.fullName && investment.fullName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (investment.teamName && investment.teamName.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Sort
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'username':
          aValue = a.username.toLowerCase();
          bValue = b.username.toLowerCase();
          break;
        case 'totalInvested':
          aValue = a.totalInvested;
          bValue = b.totalInvested;
          break;
        case 'teamName':
          aValue = (a.teamName || '').toLowerCase();
          bValue = (b.teamName || '').toLowerCase();
          break;
        case 'shares':
          aValue = a.shares || 0;
          bValue = b.shares || 0;
          break;
        case 'pricePerShare':
          aValue = a.pricePerShare || 0;
          bValue = b.pricePerShare || 0;
          break;
        case 'firstInvestmentDate':
          aValue = a.firstInvestmentDate ? new Date(a.firstInvestmentDate).getTime() : 0;
          bValue = b.firstInvestmentDate ? new Date(b.firstInvestmentDate).getTime() : 0;
          break;
        case 'profitLoss':
          aValue = a.profitLoss;
          bValue = b.profitLoss;
          break;
        case 'orderType':
          aValue = (a.orderType || '').toLowerCase();
          bValue = (b.orderType || '').toLowerCase();
          break;
        case 'currentSharePrice':
          aValue = a.currentSharePrice || 0;
          bValue = b.currentSharePrice || 0;
          break;
        case 'marketCapChange':
          const aChange = a.marketCapAfter && a.marketCapBefore ? a.marketCapAfter - a.marketCapBefore : 0;
          const bChange = b.marketCapAfter && b.marketCapBefore ? b.marketCapAfter - b.marketCapBefore : 0;
          aValue = aChange;
          bValue = bChange;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [investments, searchTerm, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4" />;
    }
    return sortDirection === 'asc' ? 
      <ArrowUp className="h-4 w-4" /> : 
      <ArrowDown className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>User Investments</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
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
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>User Investments</span>
          </CardTitle>
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>User Investments</span>
            <Badge variant="secondary">{filteredAndSortedInvestments.length} purchases</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={refetch}>
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className="flex items-center space-x-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users or teams..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
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
                    onClick={() => handleSort('orderType')}
                    className="h-auto p-0 font-medium"
                  >
                    Type
                    <SortIcon field="orderType" />
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
                    onClick={() => handleSort('shares')}
                    className="h-auto p-0 font-medium"
                  >
                    Shares
                    <SortIcon field="shares" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort('pricePerShare')}
                    className="h-auto p-0 font-medium"
                  >
                    Price/Share
                    <SortIcon field="pricePerShare" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort('totalInvested')}
                    className="h-auto p-0 font-medium"
                  >
                    Total Amount
                    <SortIcon field="totalInvested" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort('profitLoss')}
                    className="h-auto p-0 font-medium"
                  >
                    P&L
                    <SortIcon field="profitLoss" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort('currentSharePrice')}
                    className="h-auto p-0 font-medium"
                  >
                    Current Price
                    <SortIcon field="currentSharePrice" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort('marketCapChange')}
                    className="h-auto p-0 font-medium"
                  >
                    Market Impact
                    <SortIcon field="marketCapChange" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort('firstInvestmentDate')}
                    className="h-auto p-0 font-medium"
                  >
                    Purchase Date
                    <SortIcon field="firstInvestmentDate" />
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedInvestments.map((investment) => (
                <TableRow key={`${investment.userId}-${investment.orderId || investment.teamName}`}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium">{investment.username}</p>
                      {investment.fullName && (
                        <p className="text-sm text-muted-foreground">{investment.fullName}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={investment.orderType === 'BUY' ? 'default' : 'destructive'}>
                      {investment.orderType || 'BUY'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{investment.teamName || 'Unknown'}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{investment.shares || 0}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{formatCurrency(investment.pricePerShare || 0)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold">{formatCurrency(investment.totalInvested)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-1">
                      {investment.profitLoss >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-600" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      )}
                      <span className={investment.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatCurrency(investment.profitLoss)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{formatCurrency(investment.currentSharePrice || 0)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-1">
                      {investment.marketCapBefore && investment.marketCapAfter && (
                        <>
                          {investment.marketCapAfter > investment.marketCapBefore ? (
                            <TrendingUp className="h-3 w-3 text-green-600" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-red-600" />
                          )}
                          <span className={`text-xs ${
                            investment.marketCapAfter > investment.marketCapBefore ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {formatCurrency(investment.marketCapAfter - investment.marketCapBefore)}
                          </span>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">
                      {investment.firstInvestmentDate 
                        ? new Date(investment.firstInvestmentDate).toLocaleDateString()
                        : 'N/A'
                      }
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {filteredAndSortedInvestments.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            {searchTerm ? 'No purchases found matching your search.' : 'No purchases found.'}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

