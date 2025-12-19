// Financial overview panel component
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { 
  DollarSign, 
  Wallet,
  TrendingUp,
  Download,
  RefreshCw,
  AlertCircle,
  BarChart3
} from 'lucide-react';
import { adminService } from '@/shared/lib/services/admin.service';
import { formatCurrency } from '@/shared/lib/formatters';
import { useToast } from '@/shared/hooks/use-toast';

interface FinancialOverview {
  totalPlatformValue: number;
  totalUserDeposits: number;
  totalUserWallets: number;
  totalInvested: number;
  platformRevenue: number;
}

export const FinancialOverviewPanel: React.FC = () => {
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadFinancialData = async () => {
    try {
      setLoading(true);
      const [financial, transactions] = await Promise.all([
        adminService.getFinancialOverview(),
        adminService.getAllWalletTransactions(100)
      ]);
      setOverview(financial);
      setWalletTransactions(transactions);
    } catch (error: any) {
      console.error('Error loading financial data:', error);
      const errorMessage = error?.message || 'Failed to load financial data';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
      // Set overview to null to show error state
      setOverview(null);
      setWalletTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinancialData();
  }, []);

  const handleExportCSV = () => {
    if (!overview) return;

    const headers = [
      'Metric',
      'Value'
    ];

    const csvData = [
      ['Total Platform Value', overview.totalPlatformValue],
      ['Total User Deposits', overview.totalUserDeposits],
      ['Total User Wallets', overview.totalUserWallets],
      ['Total Invested', overview.totalInvested],
      ['Platform Revenue', overview.platformRevenue]
    ];

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `financial-overview-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-4">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
          <p className="text-muted-foreground mb-4">Failed to load financial data</p>
          <Button onClick={loadFinancialData} disabled={loading}>
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const summaryCards = [
    {
      title: 'Platform Value',
      value: formatCurrency(overview.totalPlatformValue),
      icon: DollarSign,
      description: 'Total market cap'
    },
    {
      title: 'User Deposits',
      value: formatCurrency(overview.totalUserDeposits),
      icon: TrendingUp,
      description: 'Total deposits'
    },
    {
      title: 'User Wallets',
      value: formatCurrency(overview.totalUserWallets),
      icon: Wallet,
      description: 'Total balances'
    },
    {
      title: 'Total Invested',
      value: formatCurrency(overview.totalInvested),
      icon: BarChart3,
      description: 'In positions'
    },
    {
      title: 'Platform Revenue',
      value: formatCurrency(overview.platformRevenue),
      icon: DollarSign,
      description: 'Deposits - Wallets',
      variant: overview.platformRevenue >= 0 ? 'default' : 'destructive'
    }
  ];

  // Calculate transaction summary
  const deposits = walletTransactions.filter(tx => tx.type === 'deposit');
  const purchases = walletTransactions.filter(tx => tx.type === 'purchase');
  const totalDepositAmount = deposits.reduce((sum, tx) => sum + (tx.amount_cents / 100), 0);
  const totalPurchaseAmount = purchases.reduce((sum, tx) => sum + (tx.amount_cents / 100), 0);

  return (
    <div className="space-y-6">
      {/* Financial Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {summaryCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                </div>
                <p className={`text-2xl font-bold ${card.variant === 'destructive' ? 'text-red-600' : ''}`}>
                  {card.value}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Transaction Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="text-lg">Transaction Summary</span>
              <Button variant="outline" size="sm" onClick={loadFinancialData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Deposits</span>
              <span className="font-medium text-green-600">
                {formatCurrency(totalDepositAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Purchases</span>
              <span className="font-medium text-red-600">
                {formatCurrency(totalPurchaseAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm font-medium">Net Flow</span>
              <span className={`font-bold ${
                (totalDepositAmount - totalPurchaseAmount) >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatCurrency(totalDepositAmount - totalPurchaseAmount)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="text-lg">Recent Transactions</span>
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {walletTransactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No transactions</p>
              ) : (
                walletTransactions.slice(0, 10).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <p className="text-sm font-medium">{tx.username}</p>
                      <p className="text-xs text-muted-foreground">{tx.type}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${
                        tx.type === 'deposit' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {tx.type === 'deposit' ? '+' : '-'}{formatCurrency(tx.amount_cents / 100)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
