// Users management panel component
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
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
  Wallet,
  CreditCard
} from 'lucide-react';
import { usersService, type UserListItem, type UserDetails, type WalletTransaction } from '@/shared/lib/services/users.service';
import { formatCurrency } from '@/shared/lib/formatters';
import { useToast } from '@/shared/hooks/use-toast';
import { supabase } from '@/shared/lib/supabase';
import {
  calculatePercentChange,
  calculateAverageCost
} from '@/shared/lib/utils/calculations';

type SortField = 'username' | 'wallet_balance' | 'total_invested' | 'portfolio_value' | 'profit_loss' | 'positions_count' | 'last_activity' | 'created_at';
type SortDirection = 'asc' | 'desc';

export const UsersManagementPanel: React.FC = () => {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
  const [userTransactions, setUserTransactions] = useState<WalletTransaction[]>([]);
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
      const userList = await usersService.getUserList();
      setUsers(userList);
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
        usersService.getUserTransactions(userId, 50)
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
      await usersService.creditUserWallet(selectedUser.id, amount);
      toast({
        title: 'Success',
        description: `Credited ${formatCurrency(amount)} to ${selectedUser.username}'s wallet`
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
      let bValue: any;

      switch (sortField) {
        case 'username':
          aValue = a.username.toLowerCase();
          bValue = b.username.toLowerCase();
          break;
        case 'wallet_balance':
          aValue = a.wallet_balance;
          bValue = b.wallet_balance;
          break;
        case 'total_invested':
          aValue = a.total_invested;
          bValue = b.total_invested;
          break;
        case 'portfolio_value':
          aValue = a.portfolio_value;
          bValue = b.portfolio_value;
          break;
        case 'profit_loss':
          aValue = a.profit_loss;
          bValue = b.profit_loss;
          break;
        case 'positions_count':
          aValue = a.positions_count;
          bValue = b.positions_count;
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

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [users, searchTerm, sortField, sortDirection]);

  const handleExportCSV = () => {
    const headers = [
      'Username',
      'Name',
      'Email',
      'Wallet Balance',
      'Total Invested',
      'Portfolio Value',
      'P&L',
      'Positions',
      'Last Activity',
      'Created'
    ];

    const csvData = filteredAndSortedUsers.map(user => [
      user.username,
      `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'N/A',
      user.email || 'N/A',
      user.wallet_balance,
      user.total_invested,
      user.portfolio_value,
      user.profit_loss,
      user.positions_count,
      new Date(user.last_activity).toLocaleString(),
      new Date(user.created_at).toLocaleString()
    ]);

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
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Users & Wallets
              <Badge variant="secondary">{filteredAndSortedUsers.length} users</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadUsers}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name or email..."
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
                    <Button variant="ghost" onClick={() => handleSort('username')} className="h-auto p-0 font-medium">
                      User <SortIcon field="username" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button variant="ghost" onClick={() => handleSort('wallet_balance')} className="h-auto p-0 font-medium">
                      Wallet <SortIcon field="wallet_balance" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button variant="ghost" onClick={() => handleSort('total_invested')} className="h-auto p-0 font-medium">
                      Invested <SortIcon field="total_invested" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button variant="ghost" onClick={() => handleSort('portfolio_value')} className="h-auto p-0 font-medium">
                      Portfolio Value <SortIcon field="portfolio_value" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <span className="font-medium">Unrealized P&L</span>
                  </TableHead>
                  <TableHead className="text-center">
                    <span className="font-medium">Realized P&L</span>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button variant="ghost" onClick={() => handleSort('profit_loss')} className="h-auto p-0 font-medium">
                      Total P&L <SortIcon field="profit_loss" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button variant="ghost" onClick={() => handleSort('positions_count')} className="h-auto p-0 font-medium">
                      Positions <SortIcon field="positions_count" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" onClick={() => handleSort('last_activity')} className="h-auto p-0 font-medium">
                      Last Activity <SortIcon field="last_activity" />
                    </Button>
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
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
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="font-medium font-mono">{formatCurrency(user.wallet_balance)}</div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="font-medium font-mono">{formatCurrency(user.total_invested)}</div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="font-medium font-mono">{formatCurrency(user.portfolio_value)}</div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-mono text-sm ${(user.unrealized_pnl ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(user.unrealized_pnl ?? 0) >= 0 ? '+' : ''}{formatCurrency(user.unrealized_pnl ?? 0)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-mono text-sm ${(user.realized_pnl ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(user.realized_pnl ?? 0) >= 0 ? '+' : ''}{formatCurrency(user.realized_pnl ?? 0)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {user.profit_loss >= 0 ? (
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        )}
                        <span className={`font-mono ${user.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {user.profit_loss >= 0 ? '+' : ''}{formatCurrency(user.profit_loss)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{user.positions_count}</Badge>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-muted-foreground">
                        {new Date(user.last_activity).toLocaleDateString()}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUserClick(user.id)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredAndSortedUsers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'No users found matching your search.' : 'No users found.'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Detail Modal */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="!max-w-[95vw] sm:!max-w-4xl md:!max-w-5xl lg:!max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Details: {selectedUser?.username || 'Loading...'}
            </DialogTitle>
          </DialogHeader>

          {loadingDetails ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>          
            ) : selectedUser ? (
            <Tabs defaultValue="profile" className="w-full">
              <TabsList>
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="wallet">Wallet</TabsTrigger>
                <TabsTrigger value="positions">Portfolio</TabsTrigger>
                <TabsTrigger value="orders">Orders</TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
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
              </TabsContent>

              <TabsContent value="wallet" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Wallet Balance</span>
                      <span className="text-2xl font-bold">{formatCurrency(selectedUser.wallet_balance)}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm font-medium mb-2">Credit Wallet</p>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Amount"
                          value={creditAmount}
                          onChange={(e) => setCreditAmount(e.target.value)}
                          className="max-w-xs"
                        />
                        <Button onClick={handleCreditWallet} disabled={crediting || !creditAmount}>
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
                      <p className="text-sm font-medium mb-2">Transaction History</p>
                      <div className="space-y-2 max-h-64 overflow-y-auto">                        
                        {userTransactions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No transactions</p>
                        ) : (
                          userTransactions.map((tx) => {
                            // Types that add money to wallet (positive/green): deposit, sale, refund
                            const isPositive = ['deposit', 'sale', 'refund'].includes(tx.type.toLowerCase());
                            const amount = tx.amount_cents / 100;
                            
                            return (
                              <div key={tx.id} className="flex items-center justify-between p-2 border rounded">
                                <div>
                                  <p className="text-sm font-medium capitalize">{tx.type}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(tx.created_at).toLocaleString()}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className={`text-sm font-medium ${
                                    isPositive ? 'text-green-600' : 'text-red-600'
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
                  <div className="rounded-md border overflow-hidden w-full">
                    <div className="w-full overflow-x-visible">
                      <table className="w-full caption-bottom text-sm table-fixed">
                        <colgroup>
                          <col className="w-[25%]" />
                          <col className="w-[12%]" />
                          <col className="w-[15%]" />
                          <col className="w-[13%]" />
                          <col className="w-[17%]" />
                          <col className="w-[18%]" />
                        </colgroup>
                        <thead className="[&_tr]:border-b">
                          <tr className="border-b transition-colors hover:bg-muted/50">
                            <th className="h-12 px-2 sm:px-3 md:px-4 text-left align-middle font-medium text-muted-foreground">Team</th>
                            <th className="h-12 px-2 sm:px-3 md:px-4 text-center align-middle font-medium text-muted-foreground">Quantity</th>
                            <th className="h-12 px-2 sm:px-3 md:px-4 text-center align-middle font-medium text-muted-foreground">Price/Share</th>
                            <th className="h-12 px-2 sm:px-3 md:px-4 text-center align-middle font-medium text-muted-foreground">% Change</th>
                            <th className="h-12 px-2 sm:px-3 md:px-4 text-center align-middle font-medium text-muted-foreground">Total Value</th>
                            <th className="h-12 px-2 sm:px-3 md:px-4 text-center align-middle font-medium text-muted-foreground">Unrealized</th>
                            <th className="h-12 px-2 sm:px-3 md:px-4 text-center align-middle font-medium text-muted-foreground">Realized</th>
                            <th className="h-12 px-2 sm:px-3 md:px-4 text-center align-middle font-medium text-muted-foreground">Total P&L</th>
                          </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                          {selectedUser.positions.map((pos, index) => {
                            // Use price_per_share from service (calculated from market cap / total shares)
                            // This ensures consistency: quantity * price_per_share = current_value
                            const pricePerShare = pos.price_per_share || (pos.quantity > 0 ? pos.current_value / pos.quantity : 0);
                            // Use percent_change_from_purchase which is calculated using market cap directly
                            // This ensures it matches latest match change when shares were bought before the match
                            const percentChange = pos.percent_change_from_purchase;
                            
                            return (
                              <tr key={index} className="border-b transition-colors hover:bg-muted/50">
                                <td className="p-2 sm:p-3 md:p-4 align-middle">
                                  <p className="font-medium truncate">{pos.team_name}</p>
                                </td>
                                <td className="p-2 sm:p-3 md:p-4 text-center font-mono align-middle text-sm">
                                  {pos.quantity}
                                </td>
                                <td className="p-2 sm:p-3 md:p-4 text-center font-mono align-middle text-sm">
                                  {formatCurrency(pricePerShare)}
                                </td>
                                <td className={`p-2 sm:p-3 md:p-4 text-center font-mono align-middle text-sm ${
                                  percentChange >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(2)}%
                                </td>
                                <td className="p-2 sm:p-3 md:p-4 text-center font-mono font-semibold align-middle text-sm">
                                  {formatCurrency(pos.current_value)}
                                </td>
                                <td className={`p-2 sm:p-3 md:p-4 text-center font-mono font-semibold align-middle text-sm ${
                                  (pos.unrealized_pnl ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {(pos.unrealized_pnl ?? 0) >= 0 ? '+' : ''}{formatCurrency(pos.unrealized_pnl ?? 0)}
                                </td>
                                <td className={`p-2 sm:p-3 md:p-4 text-center font-mono font-semibold align-middle text-sm ${
                                  (pos.realized_pnl ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {(pos.realized_pnl ?? 0) >= 0 ? '+' : ''}{formatCurrency(pos.realized_pnl ?? 0)}
                                </td>
                                <td className={`p-2 sm:p-3 md:p-4 text-center font-mono font-semibold align-middle text-sm ${
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
                )}
              </TabsContent>

              <TabsContent value="orders" className="space-y-4 mt-4">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {selectedUser.orders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No orders</p>
                  ) : (
                    selectedUser.orders.map((order) => (
                      <Card key={order.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <Badge variant={order.order_type === 'BUY' ? 'default' : 'destructive'}>
                                  {order.order_type}
                                </Badge>
                                <p className="font-medium">{order.team_name}</p>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {order.quantity} shares @ {formatCurrency(order.price_per_share)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(order.executed_at).toLocaleString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">{formatCurrency(order.total_amount)}</p>
                              <Badge variant="outline">{order.status}</Badge>
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






