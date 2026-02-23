// Enhanced dashboard overview component
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  Calendar,
  Wallet,
  Activity,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Database,
  Download,
  PlayCircle
} from 'lucide-react';
import { adminService } from '@/shared/lib/services/admin.service';
import { matchProcessingService } from '@/shared/lib/match-processing';
import { footballIntegrationService } from '@/shared/lib/football-api';
import { useToast } from '@/shared/hooks/use-toast';
import { formatCurrency } from '@/shared/lib/formatters';
import { SystemActivityCard } from './SystemActivityCard';
import { supabase } from '@/shared/lib/supabase';

interface DashboardMetrics {
  totalPlatformValue: number;
  totalUserWallets: number;
  activeUsers: number;
  totalTrades: number;
  totalDeposits: number;
  pendingFixtures: number;
}

export const DashboardOverview: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [systemActivity, setSystemActivity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processingMatches, setProcessingMatches] = useState(false);
  const [syncingFixtures, setSyncingFixtures] = useState(false);
  const { toast } = useToast();

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load metrics - increased activity limit to show more comprehensive feed
      const [stats, financial, activity, system] = await Promise.all([
        adminService.getSystemStats(),
        adminService.getFinancialOverview(),
        adminService.getRecentActivity(50), // Show more activities including deposits
        adminService.getSystemActivity()
      ]);      // Get pending fixtures count (matches Fixtures page "Upcoming" count exactly)
      // Includes: scheduled matches + future postponed matches
      const { data: allFixtures, error: fixturesError } = await supabase
        .from('fixtures')
        .select('status, kickoff_at')
        .in('status', ['scheduled', 'postponed']);

      const now = new Date();
      const pendingFixtures = fixturesError ? 0 : (allFixtures || []).filter(f => {
        if (f.status === 'scheduled') return true;
        if (f.status === 'postponed') {
          const kickoffDate = new Date(f.kickoff_at);
          return kickoffDate >= now; // Future postponed matches count as upcoming
        }
        return false;
      }).length;

      setMetrics({
        totalPlatformValue: financial.totalPlatformValue,
        totalUserWallets: financial.totalUserWallets,
        activeUsers: stats.totalActiveUsers,
        totalTrades: stats.totalTradesExecuted,
        totalDeposits: financial.totalUserDeposits,
        pendingFixtures
      });

      setRecentActivity(activity);
      setSystemActivity(system);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load dashboard data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    // Refresh every 30 seconds
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleProcessMatches = async () => {
    setProcessingMatches(true);
    try {
      const result = await matchProcessingService.processAllCompletedFixturesForMarketCap();
      toast({
        title: 'Processing Complete',
        description: `Processed: ${result.processed}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`,
        variant: result.errors.length > 0 ? 'destructive' : 'default'
      });
      await loadDashboardData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to process matches',
        variant: 'destructive'
      });
    } finally {
      setProcessingMatches(false);
    }
  };

  const handleSyncFixtures = async () => {
    setSyncingFixtures(true);
    try {
      await footballIntegrationService.syncPremierLeagueFixtures();
      toast({
        title: 'Success',
        description: 'Fixtures synced successfully'
      });
      await loadDashboardData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to sync fixtures',
        variant: 'destructive'
      });
    } finally {
      setSyncingFixtures(false);
    }
  };

  const handleExportAllData = () => {
    toast({
      title: 'Export Started',
      description: 'Data export functionality will be implemented'
    });
  };

  const handleSystemHealthCheck = async () => {
    try {
      const activity = await adminService.getSystemActivity();
      toast({
        title: 'System Health',
        description: `Status: ${activity.systemStatus}, Response Time: ${activity.dbResponseTime}ms, Active Users: ${activity.activeUsers}`,
        variant: activity.systemStatus === 'error' ? 'destructive' : 'default'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to check system health',
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
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

  const metricsCards = [
    {
      title: 'Platform Value',
      value: formatCurrency(metrics?.totalPlatformValue || 0),
      icon: DollarSign,
      description: 'Total market cap'
    },
    {
      title: 'User Wallets',
      value: formatCurrency(metrics?.totalUserWallets || 0),
      icon: Wallet,
      description: 'Total balances'
    },
    {
      title: 'Active Users',
      value: metrics?.activeUsers.toLocaleString() || '0',
      icon: Users,
      description: 'With positions'
    },
    {
      title: 'Total Trades',
      value: metrics?.totalTrades.toLocaleString() || '0',
      icon: TrendingUp,
      description: 'BUY + SELL'
    },
    {
      title: 'Total Deposits',
      value: formatCurrency(metrics?.totalDeposits || 0),
      icon: DollarSign,
      description: 'User deposits'
    },
    {
      title: 'Pending Fixtures',
      value: metrics?.pendingFixtures.toString() || '0',
      icon: Calendar,
      description: 'Scheduled matches'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {metricsCards.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{metric.title}</p>
                </div>
                <p className="text-2xl font-bold">{metric.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{metric.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={handleProcessMatches}
              disabled={processingMatches}
            >
              {processingMatches ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-2" />
              )}
              {processingMatches ? 'Processing...' : 'Process Match Results'}
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={handleSyncFixtures}
              disabled={syncingFixtures}
            >
              {syncingFixtures ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {syncingFixtures ? 'Syncing...' : 'Sync Fixtures from API'}
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={handleExportAllData}
            >
              <Download className="h-4 w-4 mr-2" />
              Export All Data
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={handleSystemHealthCheck}
            >
              <Database className="h-4 w-4 mr-2" />
              System Health Check
            </Button>
          </CardContent>
        </Card>

        {/* System Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SystemActivityCard />
          </CardContent>
        </Card>

        {/* Recent Activity Feed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
              ) : (
                recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                    <div className="mt-1">
                      {activity.type === 'trade' && <TrendingUp className="h-4 w-4 text-blue-500" />}
                      {activity.type === 'deposit' && <DollarSign className="h-4 w-4 text-green-500" />}
                      {activity.type === 'registration' && <Users className="h-4 w-4 text-green-500" />}
                      {activity.type === 'match' && <Calendar className="h-4 w-4 text-purple-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(activity.timestamp).toLocaleString()}
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








