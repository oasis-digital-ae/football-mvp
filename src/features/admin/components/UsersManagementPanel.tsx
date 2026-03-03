// Users management panel component
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { 
  Users, 
  Search, 
  Eye, 
  DollarSign, 
  Download,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CreditCard
} from 'lucide-react';
import { usersService, type UserListItem, type UserDetails, type WalletTransactionEnriched } from '@/shared/lib/services/users.service';
import { adminService } from '@/shared/lib/services/admin.service';
import { formatCurrency } from '@/shared/lib/formatters';
import { useToast } from '@/shared/hooks/use-toast';
import { supabase } from '@/shared/lib/supabase';
import { calculateNetWorth } from '@/shared/hooks/useNetWorth';
import {
  calculatePercentChange,
  calculateAverageCost
} from '@/shared/lib/utils/calculations';

type SortField = 'username' | 'wallet_balance' | 'total_deposits' | 'credit_balance' | 'net_worth' | 'portfolio_value' | 'profit_loss' | 'return_percent' | 'positions_count' | 'reffered_by' | 'last_activity' | 'created_at';
type SortDirection = 'asc' | 'desc';

export const UsersManagementPanel: React.FC = () => {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
  const [userTransactions, setUserTransactions] = useState<WalletTransactionEnriched[]>([]);
  const [creditByUser, setCreditByUser] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('last_activity');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [crediting, setCrediting] = useState(false);
  const { toast } = useToast();
  const loadUsers = async () => {
    try {
      setLoading(true);
      const [userList, creditSummary] = await Promise.all([
        usersService.getUserList(),
        adminService.getCreditLoanSummary()
      ]);
      setUsers(userList);
      
      // Create a map of user_id -> total credit in dollars (not cents)
      const creditMap = new Map<string, number>();
      creditSummary.perUserBreakdown.forEach(user => {
        creditMap.set(user.user_id, user.total_credit_cents / 100);
      });
      setCreditByUser(creditMap);
    } catch (error) {
      console.error('Error loading users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleUserClick = async (userId: string) => {
    setLoadingDetails(true);
    setIsDetailModalOpen(true);
    try {
      const [details, transactions] = await Promise.all([
        usersService.getUserDetails(userId),
        usersService.getUserTransactionsEnriched(userId, 50)
      ]);
      setSelectedUser(details);
      setUserTransactions(transactions);
    } catch (error) {
      console.error('Error loading user details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load user details',
        variant: 'destructive'
      });
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCreditWallet = async () => {
    if (!selectedUser || !creditAmount) return;
    
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid positive amount',
        variant: 'destructive'
      });
      return;
    }

    setCrediting(true);
    try {
      await usersService.creditUserWalletLoan(selectedUser.id, amount);
      toast({
        title: 'Success',
        description: `Extended ${formatCurrency(amount)} credit to ${selectedUser.username}'s wallet`
      });
      setCreditAmount('');
      await loadUsers();
      // Reload user details
      const details = await usersService.getUserDetails(selectedUser.id);
      setSelectedUser(details);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to credit wallet',
        variant: 'destructive'
      });
    } finally {
      setCrediting(false);
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
  const filteredAndSortedUsers = useMemo(() => {
    let filtered = users.filter(user =>
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.first_name && user.first_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (user.last_name && user.last_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;      switch (sortField) {
        case 'username':
          aValue = a.username.toLowerCase();
          bValue = b.username.toLowerCase();
          break;
        case 'wallet_balance':
          aValue = a.wallet_balance;
          bValue = b.wallet_balance;
          break;        case 'total_deposits':
          aValue = a.total_deposits;
          bValue = b.total_deposits;
          break;        
        case 'credit_balance':
          aValue = creditByUser.get(a.id) || 0;
          bValue = creditByUser.get(b.id) || 0;
          break;
        case 'net_worth':
          // Use centralized Net Worth calculation with actual credit balance
          aValue = calculateNetWorth(a.portfolio_value, a.wallet_balance, creditByUser.get(a.id) || 0, a.total_deposits).netWorth;
          bValue = calculateNetWorth(b.portfolio_value, b.wallet_balance, creditByUser.get(b.id) || 0, b.total_deposits).netWorth;
          break;
        case 'portfolio_value':
          aValue = a.portfolio_value;
          bValue = b.portfolio_value;
          break;
        case 'profit_loss':
          // Use centralized P&L calculation with actual credit balance
          aValue = calculateNetWorth(a.portfolio_value, a.wallet_balance, creditByUser.get(a.id) || 0, a.total_deposits).pnl;
          bValue = calculateNetWorth(b.portfolio_value, b.wallet_balance, creditByUser.get(b.id) || 0, b.total_deposits).pnl;
          break;
        case 'return_percent':
          // Use centralized P&L percentage calculation with actual credit balance
          aValue = parseFloat(calculateNetWorth(a.portfolio_value, a.wallet_balance, creditByUser.get(a.id) || 0, a.total_deposits).pnlPercentage);
          bValue = parseFloat(calculateNetWorth(b.portfolio_value, b.wallet_balance, creditByUser.get(b.id) || 0, b.total_deposits).pnlPercentage);
          break;case 'positions_count':
          aValue = a.positions_count;
          bValue = b.positions_count;
          break;
        case 'reffered_by':
          aValue = (a.reffered_by || '').toLowerCase();
          bValue = (b.reffered_by || '').toLowerCase();
          break;
        case 'last_activity':
          aValue = new Date(a.last_activity).getTime();
          bValue = new Date(b.last_activity).getTime();
          break;
        case 'created_at':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [users, searchTerm, sortField, sortDirection, creditByUser]);const handleExportCSV = () => {    const headers = [
      'Username',
      'Name',
      'Email',
      'Wallet Balance',
      'Portfolio Value',
      'Net Worth',
      'Total Deposits',
      'Credit Balance',
      'Total P&L',
      'Return %',
      'Positions',
      'Referred By',
      'Last Activity',
      'Created'
    ];    const csvData = filteredAndSortedUsers.map(user => {
      const creditBalance = creditByUser.get(user.id) || 0;
      // Use centralized Net Worth calculation with actual credit balance
      const netWorthData = calculateNetWorth(
        user.portfolio_value,
        user.wallet_balance,
        creditBalance,
        user.total_deposits
      );
      
      return [
        user.username,
        `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'N/A',
        user.email || 'N/A',
        user.wallet_balance,
        user.portfolio_value,
        netWorthData.netWorth,
        user.total_deposits,
        creditBalance,
        netWorthData.pnl,
        netWorthData.pnlPercentage + '%',
        user.positions_count,
        user.reffered_by || 'N/A',
        new Date(user.last_activity).toLocaleString(),
        new Date(user.created_at).toLocaleString()
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
    link.setAttribute('download', `users-export-${new Date().toISOString().split('T')[0]}.csv`);
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

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Users & Wallets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <span className="text-base sm:text-lg">Users & Wallets</span>
              <Badge variant="secondary" className="text-xs">{filteredAndSortedUsers.length} users</Badge>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button variant="outline" size="sm" onClick={loadUsers} className="flex-1 sm:flex-none">
                <RefreshCw className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="flex-1 sm:flex-none">
                <Download className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-4">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>          {/* Table */}
          <div className="rounded-md border overflow-hidden">
            <div className="overflow-x-auto scrollbar-hide">
              <table className="trading-table w-full min-w-[1200px]">
                <thead>
                  <tr>
                    <th className="px-4 text-left min-w-[200px]">
                      <button
                        onClick={() => handleSort('username')}
                        className="flex items-center gap-2 hover:text-foreground transition-colors"
                      >
                        <span>User</span>
                        <SortIcon field="username" />
                      </button>
                    </th>                    <th className="px-4 text-center min-w-[120px]">
                      <button
                        onClick={() => handleSort('wallet_balance')}
                        className="flex items-center justify-center gap-2 hover:text-foreground transition-colors mx-auto"
                      >
                        <span>Wallet</span>
                        <SortIcon field="wallet_balance" />
                      </button>
                    </th>
                    <th className="px-4 text-center min-w-[140px]">
                      <button
                        onClick={() => handleSort('portfolio_value')}
                        className="flex items-center justify-center gap-2 hover:text-foreground transition-colors mx-auto"
                      >
                        <span>Portfolio</span>
                        <SortIcon field="portfolio_value" />
                      </button>
                    </th>
                    <th className="px-4 text-center min-w-[120px]">
                      <button
                        onClick={() => handleSort('net_worth')}
                        className="flex items-center justify-center gap-2 hover:text-foreground transition-colors mx-auto"
                      >
                        <span>Net Worth</span>
                        <SortIcon field="net_worth" />
                      </button>
                    </th>                    <th className="px-4 text-center min-w-[140px]">
                      <button
                        onClick={() => handleSort('total_deposits')}
                        className="flex items-center justify-center gap-2 hover:text-foreground transition-colors mx-auto"
                      >
                        <span>Deposits</span>
                        <SortIcon field="total_deposits" />
                      </button>
                    </th>
                    <th className="px-4 text-center min-w-[120px]">
                      <button
                        onClick={() => handleSort('credit_balance')}
                        className="flex items-center justify-center gap-2 hover:text-foreground transition-colors mx-auto"
                      >
                        <span>Credit</span>
                        <SortIcon field="credit_balance" />
                      </button>
                    </th>
                    <th className="px-4 text-center min-w-[130px]">
                      <button
                        onClick={() => handleSort('profit_loss')}
                        className="flex items-center justify-center gap-2 hover:text-foreground transition-colors mx-auto"
                      >
                        <span>Total P&L</span>
                        <SortIcon field="profit_loss" />
                      </button>
                    </th>
                    <th className="px-4 text-center min-w-[110px]">
                      <button
                        onClick={() => handleSort('return_percent')}
                        className="flex items-center justify-center gap-2 hover:text-foreground transition-colors mx-auto"
                      >
                        <span>Return %</span>
                        <SortIcon field="return_percent" />
                      </button>
                    </th>
                    <th className="px-4 text-center min-w-[110px]">
                      <button
                        onClick={() => handleSort('positions_count')}
                        className="flex items-center justify-center gap-2 hover:text-foreground transition-colors mx-auto"
                      >
                        <span>Positions</span>
                        <SortIcon field="positions_count" />
                      </button>
                    </th>
                    <th className="px-4 text-left min-w-[130px]">
                      <button
                        onClick={() => handleSort('last_activity')}
                        className="flex items-center gap-2 hover:text-foreground transition-colors"
                      >
                        <span>Last Activity</span>
                        <SortIcon field="last_activity" />
                      </button>
                    </th>
                    <th className="px-4 text-left min-w-[130px]">
                      <button
                        onClick={() => handleSort('reffered_by')}
                        className="flex items-center gap-2 hover:text-foreground transition-colors"
                      >
                        <span>Referred By</span>
                        <SortIcon field="reffered_by" />
                      </button>
                    </th>                    <th className="px-4 text-left min-w-[100px]">Actions</th>
                  </tr>
                </thead>                <tbody>                  {filteredAndSortedUsers.map((user) => {
                    const creditBalance = creditByUser.get(user.id) || 0;
                    // Use centralized Net Worth calculation with actual credit balance
                    const netWorthData = calculateNetWorth(
                      user.portfolio_value,
                      user.wallet_balance,
                      creditBalance,
                      user.total_deposits
                    );
                    
                    return (
                      <tr key={user.id}>
                        <td className="px-4">
                          <div className="space-y-1">
                            <p className="font-medium">{user.username}</p>
                            {(user.first_name || user.last_name) && (
                              <p className="text-sm text-muted-foreground">
                                {user.first_name} {user.last_name}
                              </p>
                            )}
                            {user.email && (
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            )}
                          </div>
                        </td>                        <td className="px-4 text-center">
                          <div className="font-medium font-mono text-sm">{formatCurrency(user.wallet_balance)}</div>
                        </td>
                        <td className="px-4 text-center">
                          <div className="font-medium font-mono text-sm">{formatCurrency(user.portfolio_value)}</div>
                        </td>
                        <td className="px-4 text-center">
                          <div className="font-medium font-mono text-sm">{formatCurrency(netWorthData.netWorth)}</div>
                        </td>                        <td className="px-4 text-center">
                          <div className="font-medium font-mono text-sm">{formatCurrency(user.total_deposits)}</div>
                        </td>
                        <td className="px-4 text-center">
                          <div className="font-medium font-mono text-sm">{formatCurrency(creditBalance)}</div>
                        </td>
                        <td className="px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {netWorthData.pnl >= 0 ? (
                              <TrendingUp className="h-4 w-4 text-green-600" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-600" />
                            )}
                            <span className={`font-mono text-sm ${netWorthData.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {netWorthData.pnl >= 0 ? '+' : ''}
                              {formatCurrency(netWorthData.pnl)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 text-center">
                          <div className={`font-mono font-semibold text-sm ${netWorthData.isProfit ? 'text-green-600' : netWorthData.isLoss ? 'text-red-600' : 'text-gray-600'}`}>
                            {netWorthData.isProfit ? '+' : ''}{netWorthData.pnlPercentage}%
                          </div>
                        </td>
                        <td className="px-4 text-center">
                          <Badge variant="secondary">{user.positions_count}</Badge>
                        </td>
                        <td className="px-4">
                          <p className="text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(user.last_activity).toLocaleDateString()}
                          </p>
                        </td>
                        <td className="px-4">
                          <p className="text-sm text-muted-foreground whitespace-nowrap">
                            {user.reffered_by 
                              ? user.reffered_by
                                  .split('_')
                                  .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                                  .join(' ')
                              : 'N/A'
                            }
                          </p>
                        </td>
                        <td className="px-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUserClick(user.id)}
                            className="whitespace-nowrap"
                          >
                            <Eye className="h-4 w-4 sm:mr-1" />
                            <span className="hidden sm:inline">View</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {filteredAndSortedUsers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'No users found matching your search.' : 'No users found.'}
            </div>
          )}
        </CardContent>
      </Card>      {/* User Detail Modal */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="!max-w-[95vw] sm:!max-w-4xl md:!max-w-5xl lg:!max-w-6xl max-h-[90vh] max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Users className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="truncate">User Details: {selectedUser?.username || 'Loading...'}</span>
            </DialogTitle>
          </DialogHeader>

          {loadingDetails ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>          
            ) : selectedUser ? (
            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="w-full grid grid-cols-4 h-auto">
                <TabsTrigger value="profile" className="text-xs sm:text-sm">Profile</TabsTrigger>
                <TabsTrigger value="wallet" className="text-xs sm:text-sm">Wallet</TabsTrigger>
                <TabsTrigger value="positions" className="text-xs sm:text-sm">Portfolio</TabsTrigger>
                <TabsTrigger value="orders" className="text-xs sm:text-sm">Orders</TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Username</p>
                    <p className="font-medium">{selectedUser.username}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{selectedUser.email || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-medium">
                      {selectedUser.first_name || ''} {selectedUser.last_name || ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Country</p>
                    <p className="font-medium">{selectedUser.country || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{selectedUser.phone || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Birthday</p>
                    <p className="font-medium">
                      {selectedUser.birthday ? new Date(selectedUser.birthday).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Member Since</p>
                    <p className="font-medium">
                      {new Date(selectedUser.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </TabsContent>              <TabsContent value="wallet" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <span className="text-base sm:text-lg">Wallet Balance</span>
                      <span className="text-xl sm:text-2xl font-bold">{formatCurrency(selectedUser.wallet_balance)}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm font-medium mb-2">Extend Credit (Loan)</p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          type="number"
                          placeholder="Amount"
                          value={creditAmount}
                          onChange={(e) => setCreditAmount(e.target.value)}
                          className="w-full sm:max-w-xs"
                        />
                        <Button onClick={handleCreditWallet} disabled={crediting || !creditAmount} className="w-full sm:w-auto">
                          {crediting ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <CreditCard className="h-4 w-4 mr-2" />
                          )}
                          Credit
                        </Button>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-medium">Transaction History</p>
                          <p className="text-xs text-muted-foreground">
                            Purchase/sale details show team, quantity, and price for easier leaderboard tracing
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const headers = ['Date', 'Type', 'Amount', 'Team', 'Quantity', 'Price/Share', 'Order ID', 'Ref'];
                            const rows = userTransactions.map((tx) => [
                              new Date(tx.created_at).toISOString(),
                              tx.type,
                              (tx.amount_cents / 100).toFixed(2),
                              tx.team_name ?? '',
                              tx.quantity ?? '',
                              tx.price_per_share_cents != null ? (tx.price_per_share_cents / 100).toFixed(2) : '',
                              tx.order_id ?? '',
                              tx.ref ?? ''
                            ]);
                            const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
                            const blob = new Blob([csv], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `transactions-${selectedUser?.username ?? 'user'}-${new Date().toISOString().slice(0, 10)}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          disabled={userTransactions.length === 0}
                        >
                          <Download className="h-4 w-4 mr-1.5" />
                          Export CSV
                        </Button>
                      </div>
                      <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-hide">                        
                        {userTransactions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No transactions</p>
                        ) : (
                          userTransactions.map((tx) => {
                            const isPositive = ['deposit', 'sale', 'refund', 'credit_loan'].includes(tx.type.toLowerCase());
                            const amount = tx.amount_cents / 100;
                            const displayType = tx.type === 'credit_loan' ? 'Platform Credit' : tx.type === 'credit_loan_reversal' ? 'Credit Reversal' : tx.type;
                            
                            let description: string;
                            if (tx.type === 'purchase' && tx.team_name != null) {
                              const price = (tx.price_per_share_cents ?? 0) / 100;
                              description = `${tx.quantity ?? '?'} shares of ${tx.team_name} @ ${formatCurrency(price)}`;
                            } else if (tx.type === 'sale' && tx.team_name != null) {
                              const price = (tx.price_per_share_cents ?? 0) / 100;
                              description = `${tx.quantity ?? '?'} shares of ${tx.team_name} @ ${formatCurrency(price)}`;
                            } else if (tx.ref) {
                              description = tx.ref;
                            } else {
                              description = new Date(tx.created_at).toLocaleString();
                            }
                            
                            return (
                              <div key={tx.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-2.5 border rounded text-sm">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium capitalize">{displayType}</p>
                                  <p className="text-xs text-muted-foreground break-words" title={description}>
                                    {description}
                                  </p>
                                  <p className="text-xs text-muted-foreground/80 mt-0.5">
                                    {new Date(tx.created_at).toLocaleString()}
                                    {tx.order_id != null && (
                                      <span className="ml-1.5 font-mono">#{tx.order_id}</span>
                                    )}
                                  </p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className={`text-sm font-medium font-mono whitespace-nowrap ${
                                    isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                  }`}>
                                    {isPositive ? '+' : '-'}{formatCurrency(Math.abs(amount))}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="positions" className="space-y-4 mt-4">
                {selectedUser.positions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No positions</p>
                ) : (
                  (() => {
                    // Total portfolio value for % Portfolio column (matches user portfolio tab)
                    const totalPortfolioValue = selectedUser.positions.reduce((sum, p) => sum + p.current_value, 0);
                    return (
                      <div className="rounded-md border overflow-hidden w-full">
                        <div className="w-full overflow-x-auto scrollbar-hide">
                          <table className="w-full caption-bottom text-sm min-w-[800px]">
                            <colgroup>
                              <col className="w-[20%]" />
                              <col className="w-[10%]" />
                              <col className="w-[12%]" />
                              <col className="w-[12%]" />
                              <col className="w-[10%]" />
                              <col className="w-[12%]" />
                              <col className="w-[12%]" />
                              <col className="w-[12%]" />
                            </colgroup>
                            <thead className="[&_tr]:border-b">
                              <tr className="border-b transition-colors hover:bg-muted/50">
                                <th className="h-12 px-2 sm:px-3 md:px-4 text-left align-middle font-medium text-muted-foreground">Team</th>
                                <th className="h-12 px-2 sm:px-3 md:px-4 text-right align-middle font-medium text-muted-foreground">Quantity</th>
                                <th className="h-12 px-2 sm:px-3 md:px-4 text-right align-middle font-medium text-muted-foreground">Avg Price</th>
                                <th className="h-12 px-2 sm:px-3 md:px-4 text-right align-middle font-medium text-muted-foreground">Current Price</th>
                                <th className="h-12 px-2 sm:px-3 md:px-4 text-right align-middle font-medium text-muted-foreground">% Change</th>
                                <th className="h-12 px-2 sm:px-3 md:px-4 text-right align-middle font-medium text-muted-foreground">Total Value</th>
                                <th className="h-12 px-2 sm:px-3 md:px-4 text-right align-middle font-medium text-muted-foreground">% Portfolio</th>
                                <th className="h-12 px-2 sm:px-3 md:px-4 text-right align-middle font-medium text-muted-foreground">Total P&L</th>
                              </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-0">
                              {selectedUser.positions.map((pos, index) => {
                                const pricePerShare = pos.price_per_share ?? (pos.quantity > 0 ? pos.current_value / pos.quantity : 0);
                                const percentChange = pos.percent_change_from_purchase;
                                const percentPortfolio = totalPortfolioValue > 0
                                  ? (pos.current_value / totalPortfolioValue) * 100
                                  : 0;
                                return (
                                  <tr key={index} className="border-b transition-colors hover:bg-muted/50">
                                    <td className="p-2 sm:p-3 md:p-4 align-middle">
                                      <p className="font-medium truncate">{pos.team_name}</p>
                                    </td>
                                    <td className="p-2 sm:p-3 md:p-4 text-right font-mono align-middle text-sm">
                                      {pos.quantity}
                                    </td>
                                    <td className="p-2 sm:p-3 md:p-4 text-right font-mono align-middle text-sm">
                                      {formatCurrency(pos.avg_price ?? 0)}
                                    </td>
                                    <td className="p-2 sm:p-3 md:p-4 text-right font-mono align-middle text-sm">
                                      {formatCurrency(pricePerShare)}
                                    </td>
                                    <td className={`p-2 sm:p-3 md:p-4 text-right font-mono align-middle text-sm ${
                                      percentChange >= 0 ? 'text-green-600' : 'text-red-600'
                                    }`}>
                                      {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(2)}%
                                    </td>
                                    <td className="p-2 sm:p-3 md:p-4 text-right font-mono font-semibold align-middle text-sm">
                                      {formatCurrency(pos.current_value)}
                                    </td>
                                    <td className="p-2 sm:p-3 md:p-4 text-right font-mono align-middle text-sm">
                                      {percentPortfolio.toFixed(2)}%
                                    </td>
                                    <td className={`p-2 sm:p-3 md:p-4 text-right font-mono font-semibold align-middle text-sm ${
                                      pos.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'
                                    }`}>
                                      {pos.profit_loss >= 0 ? '+' : ''}{formatCurrency(pos.profit_loss)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()
                )}              </TabsContent>

              <TabsContent value="orders" className="space-y-4 mt-4">
                <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-hide">
                  {selectedUser.orders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No orders</p>
                  ) : (
                    selectedUser.orders.map((order) => (
                      <Card key={order.id}>
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div className="min-w-0 flex-1 w-full">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={order.order_type === 'BUY' ? 'default' : 'destructive'} className="text-xs">
                                  {order.order_type}
                                </Badge>
                                <p className="font-medium truncate">{order.team_name}</p>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {order.quantity} shares @ {formatCurrency(order.price_per_share)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(order.executed_at).toLocaleString()}                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="font-medium whitespace-nowrap">{formatCurrency(order.total_amount)}</p>
                              <Badge variant="outline" className="text-xs mt-1">{order.status}</Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};






