// System statistics card component for admin dashboard
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  BarChart3,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { useAdminStats } from '../hooks/useAdminStats';
import { formatCurrency } from '@/shared/lib/formatters';

export const SystemStatsCard: React.FC = () => {
  const { stats, loading, error, refetch } = useAdminStats();
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    setRetryCount(prev => prev + 1);
    try {
      await refetch();
    } finally {
      setIsRetrying(false);
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">System Overview</CardTitle>
          <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">System Overview</CardTitle>
          <AlertCircle className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 text-destructive mb-4">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRetry}
            disabled={isRetrying}
            className="w-full"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? 'Retrying...' : `Retry ${retryCount > 0 ? `(${retryCount})` : ''}`}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return null;
  }

  const statsItems = [
    {
      title: 'Total Cash Injected',
      value: formatCurrency(stats.totalCashInjected),
      icon: DollarSign,
      description: 'All user investments'
    },
    {
      title: 'Active Users',
      value: stats.totalActiveUsers.toLocaleString(),
      icon: Users,
      description: 'Users with positions'
    },
    {
      title: 'Trades Executed',
      value: stats.totalTradesExecuted.toLocaleString(),
      icon: TrendingUp,
      description: 'Total filled orders'
    },
    {
      title: 'Avg Trade Size',
      value: formatCurrency(stats.averageTradeSize),
      icon: BarChart3,
      description: 'Average order value'
    }
  ];

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">System Overview</CardTitle>
        <div className="flex items-center space-x-2">
          <Badge variant="secondary" className="text-xs">
            Updated: {new Date(stats.lastUpdated).toLocaleTimeString()}
          </Badge>
          <button
            onClick={refetch}
            className="p-1 hover:bg-muted rounded-md transition-colors"
            title="Refresh data"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statsItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={index} className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{item.title}</p>
                </div>
                <p className="text-2xl font-bold">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            );
          })}
        </div>

        {/* Market Cap Overview */}
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-medium">Market Cap Overview</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.marketCapOverview.slice(0, 6).map((team) => (
              <div key={team.teamId} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{team.teamName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(team.sharePrice)} per share
                  </p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-sm font-semibold">
                    {formatCurrency(team.currentMarketCap)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {team.sharesOutstanding} shares
                  </p>
                </div>
              </div>
            ))}
          </div>
          {stats.marketCapOverview.length > 6 && (
            <p className="text-xs text-muted-foreground text-center">
              +{stats.marketCapOverview.length - 6} more teams
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
