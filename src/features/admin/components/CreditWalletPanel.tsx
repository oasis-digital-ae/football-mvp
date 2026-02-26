// Credit Wallet panel - admin loans to users, tracked separately
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/shared/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/shared/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/shared/components/ui/popover';
import {
  Wallet,
  RefreshCw,
  AlertCircle,
  DollarSign,
  Users,
  CreditCard,
  Trash2,
  ChevronsUpDown,
  Check
} from 'lucide-react';
import { adminService } from '@/shared/lib/services/admin.service';
import { usersService, type UserListItem } from '@/shared/lib/services/users.service';
import { formatCurrency } from '@/shared/lib/formatters';
import { useToast } from '@/shared/hooks/use-toast';
import { cn } from '@/shared/lib/utils';

type CreditLoan = {
  id: number;
  user_id: string;
  username: string;
  amount_cents: number;
  currency: string;
  type: string;
  ref?: string;
  created_at: string;
  is_reversed: boolean;
};

type CreditSummary = {
  totalCreditExtended: number;
  usersWithCredit: number;
  perUserBreakdown: Array<{
    user_id: string;
    username: string;
    total_credit_cents: number;
    count: number;
  }>;
};

export const CreditWalletPanel: React.FC = () => {
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [creditLoans, setCreditLoans] = useState<CreditLoan[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');  const [submitting, setSubmitting] = useState(false);
  const [reversing, setReversing] = useState<number | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [openUserSelect, setOpenUserSelect] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    try {
      setLoading(true);
      const [summaryData, loansData, usersData] = await Promise.all([
        adminService.getCreditLoanSummary(),
        adminService.getCreditLoans(500),
        usersService.getUserList()
      ]);
      setSummary(summaryData);
      setCreditLoans(loansData);
      setUsers(usersData);
    } catch (error: any) {
      console.error('Error loading credit wallet data:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to load credit wallet data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadData();
  }, []);

  // Sort users alphabetically by display name
  const sortedUsers = [...users].sort((a, b) => {
    const getDisplayName = (user: UserListItem) => {
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
      return fullName || user.username || user.email || 'Unknown';
    };
    return getDisplayName(a).localeCompare(getDisplayName(b));
  });

  // Filter users based on search query
  const filteredUsers = sortedUsers.filter((user) => {
    if (!userSearchQuery) return true;
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    const displayName = fullName || user.username || user.email || '';
    const email = user.email || '';
    const searchLower = userSearchQuery.toLowerCase();
    return displayName.toLowerCase().includes(searchLower) || email.toLowerCase().includes(searchLower);
  });

  // Calculate active and reversed loan counts
  const activeLoansCount = creditLoans.filter(loan => !loan.is_reversed).length;
  const reversedLoansCount = creditLoans.filter(loan => loan.is_reversed).length;

  const handleLoanSubmit = async () => {
    if (!selectedUserId || !amount) {
      toast({
        title: 'Invalid Input',
        description: 'Please select a user and enter an amount',
        variant: 'destructive'
      });
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid positive amount',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      await usersService.creditUserWalletLoan(
        selectedUserId,
        amountNum,
        note || undefined
      );
      const user = users.find(u => u.id === selectedUserId);
      toast({
        title: 'Success',
        description: `Loaned ${formatCurrency(amountNum)} to ${user?.username || 'user'}`
      });
      setAmount('');
      setNote('');
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to process loan',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReverseLoan = async (transactionId: number, username: string, amount: number) => {
    if (!confirm(`Are you sure you want to reverse this credit loan of ${formatCurrency(amount)} to ${username}? This will deduct the amount from their wallet.`)) {
      return;
    }

    setReversing(transactionId);
    try {
      await adminService.reverseCreditLoan(transactionId);
      toast({
        title: 'Success',
        description: `Reversed credit loan of ${formatCurrency(amount)} to ${username}`
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to reverse credit loan',
        variant: 'destructive'
      });
    } finally {
      setReversing(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 mb-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Total Credit Extended</p>
            </div>
            <p className="text-2xl font-bold">
              {formatCurrency(summary?.totalCreditExtended ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Platform loans to users
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Users with Credit</p>
            </div>
            <p className="text-2xl font-bold">{summary?.usersWithCredit ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Active credit recipients
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 mb-2">
              <CreditCard className="h-4 w-4 text-blue-600" />
              <p className="text-xs text-muted-foreground">Total Transactions</p>
            </div>
            <p className="text-2xl font-bold text-blue-600">{creditLoans.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              All credit operations
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 mb-2">
              <CreditCard className="h-4 w-4 text-green-600" />
              <p className="text-xs text-muted-foreground">Active Loans</p>
            </div>
            <p className="text-2xl font-bold text-green-600">{activeLoansCount}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Currently active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 mb-2">
              <RefreshCw className="h-4 w-4 text-amber-600" />
              <p className="text-xs text-muted-foreground">Reversed Loans</p>
            </div>
            <p className="text-2xl font-bold text-amber-600">{reversedLoansCount}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Transactions reversed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Loan Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Extend Credit (Loan to User)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Loan amount will be added to the user&apos;s wallet and tracked here separately.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">User</label>
              <Popover open={openUserSelect} onOpenChange={setOpenUserSelect}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openUserSelect}
                    className="w-full justify-between"
                  >
                    {selectedUserId
                      ? (() => {
                          const user = users.find(u => u.id === selectedUserId);
                          if (!user) return "Select user...";
                          const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
                          const displayName = fullName || user.username || user.email || 'Unknown';
                          return displayName;
                        })()
                      : "Select user..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput 
                      placeholder="Search users..." 
                      value={userSearchQuery}
                      onValueChange={setUserSearchQuery}
                    />
                    <CommandList>
                      <CommandEmpty>No user found.</CommandEmpty>
                      <CommandGroup>
                        {filteredUsers.map((user) => {
                          const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
                          const displayName = fullName || user.username || user.email || 'Unknown';
                          return (
                            <CommandItem
                              key={user.id}
                              value={`${displayName} ${user.email || ''}`}
                              onSelect={() => {
                                setSelectedUserId(user.id);
                                setOpenUserSelect(false);
                                setUserSearchQuery('');
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedUserId === user.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col">
                                <span className="font-medium">{displayName}</span>
                                {user.email && (
                                  <span className="text-xs text-muted-foreground">{user.email}</span>
                                )}
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount ($)</label>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Note (optional)</label>
              <Input
                placeholder="Reference or note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleLoanSubmit}
              disabled={submitting || !selectedUserId || !amount}
            >
              {submitting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Extend Credit
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Per-User Breakdown */}
      {summary && summary.perUserBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Credit by User
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium">User</th>
                    <th className="px-4 py-2 text-right font-medium">Total Credit</th>
                    <th className="px-4 py-2 text-right font-medium">Loans</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.perUserBreakdown.map((row) => (
                    <tr key={row.user_id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2">{row.username}</td>
                      <td className="px-4 py-2 text-right font-mono">
                        {formatCurrency(row.total_credit_cents / 100)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Badge variant="secondary">{row.count}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credit Loan History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Credit Loan History</span>
            <Button variant="outline" size="sm" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {creditLoans.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No credit loans yet. Use the form above to extend credit to users.</p>
            </div>
          ) : (            <div className="rounded-md border overflow-hidden">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead className="sticky top-0 bg-muted/50 z-10">
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left font-medium">User</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                      <th className="px-4 py-2 text-left font-medium">Ref</th>
                      <th className="px-4 py-2 text-left font-medium">Date</th>
                      <th className="px-4 py-2 text-center font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditLoans.map((tx) => (
                      <tr key={tx.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-2">{tx.username}</td>
                        <td className="px-4 py-2 text-right font-mono text-green-600">
                          +{formatCurrency(tx.amount_cents / 100)}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground truncate max-w-[150px]">
                          {tx.ref || '-'}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                          {new Date(tx.created_at).toLocaleString()}
                        </td>                        <td className="px-4 py-2 text-center">
                          {tx.is_reversed ? (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              Reversed
                            </Badge>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReverseLoan(tx.id, tx.username, tx.amount_cents / 100)}
                              disabled={reversing === tx.id}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Reverse this credit loan"
                            >
                              {reversing === tx.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
