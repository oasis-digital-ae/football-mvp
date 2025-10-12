import React, { useState, useEffect } from 'react';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { AlertCircle, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { adminService } from '@/shared/lib/services/admin.service';

interface ActivityData {
  recentTrades: number;
  systemStatus: 'normal' | 'high_volume' | 'error';
  lastCheck: string;
  dbResponseTime: number;
  activeUsers: number;
}

export const SystemActivityCard: React.FC = () => {
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const activityData = await adminService.getSystemActivity();
      setActivity(activityData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch activity data');
      console.error('Error fetching system activity:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
    // Refresh every 30 seconds
    const interval = setInterval(fetchActivity, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center space-x-3">
            <Skeleton className="w-2 h-2 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center space-x-2 text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">Error loading activity: {error}</span>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        <p>No activity data available</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'normal': return 'text-green-600';
      case 'high_volume': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'normal': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'high_volume': return <TrendingUp className="h-4 w-4 text-yellow-600" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-3">
        {getStatusIcon(activity.systemStatus)}
        <div className="flex-1">
          <p className="text-sm font-medium">
            System Status: <span className={getStatusColor(activity.systemStatus)}>
              {activity.systemStatus === 'normal' ? 'Normal' : 
               activity.systemStatus === 'high_volume' ? 'High Volume' : 'Error'}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Last checked: {new Date(activity.lastCheck).toLocaleTimeString()}
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
        <div className="flex-1">
          <p className="text-sm font-medium">Database Performance</p>
          <p className="text-xs text-muted-foreground">
            Response time: {activity.dbResponseTime}ms
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
        <div className="flex-1">
          <p className="text-sm font-medium">
            Recent Activity: {activity.recentTrades} trades in last hour
          </p>
          <p className="text-xs text-muted-foreground">
            {activity.activeUsers} active users
          </p>
        </div>
      </div>

      {activity.systemStatus === 'high_volume' && (
        <div className="flex items-center space-x-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
          <TrendingUp className="h-4 w-4 text-yellow-600" />
          <p className="text-sm text-yellow-800">
            High trading volume detected - {activity.recentTrades} trades in the last hour
          </p>
        </div>
      )}
    </div>
  );
};
