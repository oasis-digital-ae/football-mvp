// Team order timeline component for public order history
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { 
  Trophy, 
  DollarSign, 
  Calendar, 
  TrendingUp, 
  TrendingDown,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { useTimelineEvents } from '@/features/admin/hooks/useTimelineEvents';
import { formatCurrency } from '@/shared/lib/formatters';
import { supabase } from '@/shared/lib/supabase';
import type { TimelineEvent } from '@/features/admin/types/admin.types';

interface Team {
  id: number;
  name: string;
}

interface TeamOrderTimelineProps {
  teamId?: number;
  className?: string;
}

export const TeamOrderTimeline: React.FC<TeamOrderTimelineProps> = ({ 
  teamId: initialTeamId, 
  className 
}) => {
  const [selectedTeamId, setSelectedTeamId] = useState<number | undefined>(initialTeamId);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  
  const { events, loading, error, refetch } = useTimelineEvents(selectedTeamId);

  // Load teams for dropdown
  React.useEffect(() => {
    const loadTeams = async () => {
      try {
        const { data: teamsData } = await supabase
          .from('teams')
          .select('id, name')
          .order('name');
        
        setTeams(teamsData || []);
      } catch (error) {
        console.error('Error loading teams:', error);
      } finally {
        setLoadingTeams(false);
      }
    };

    loadTeams();
  }, []);

  const formatEventDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatEventTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMarketCapChangeColor = (change: number) => {
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getMarketCapChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (change < 0) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return null;
  };

  if (loadingTeams) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Order History Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start space-x-4">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>Order History Timeline</span>
          </div>
          <div className="flex items-center space-x-2">
            {selectedTeamId && (
              <Button variant="outline" size="sm" onClick={refetch}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Team Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Select Team</label>
          <Select
            value={selectedTeamId?.toString() || 'all'}
            onValueChange={(value) => setSelectedTeamId(value === 'all' ? undefined : parseInt(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a team to view timeline" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id.toString()}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Timeline */}
        {!selectedTeamId ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Select a team to view their order history timeline</p>
          </div>
        ) : loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start space-x-4">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center space-x-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No activity found for this team</p>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((event, index) => (
              <div key={`${event.type}-${event.data.id}-${index}`} className="flex items-start space-x-4">
                {/* Timeline Icon */}
                <div className="flex-shrink-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    event.type === 'fixture' 
                      ? 'bg-blue-100 text-blue-600' 
                      : 'bg-green-100 text-green-600'
                  }`}>
                    {event.type === 'fixture' ? (
                      <Trophy className="h-4 w-4" />
                    ) : (
                      <DollarSign className="h-4 w-4" />
                    )}
                  </div>
                </div>

                {/* Event Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <Badge variant={event.type === 'fixture' ? 'default' : 'secondary'}>
                      {event.type === 'fixture' ? 'Match' : 'Trade'}
                    </Badge>
                    <span className="text-sm font-medium">
                      {formatEventDate(event.timestamp)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatEventTime(event.timestamp)}
                    </span>
                  </div>

                  {event.type === 'fixture' ? (
                    <div className="space-y-2">
                      <p className="text-sm">
                        <span className="font-medium">{event.data.homeTeam}</span>
                        {' vs '}
                        <span className="font-medium">{event.data.awayTeam}</span>
                        {' - '}
                        <span className="font-semibold">
                          {event.data.homeScore} - {event.data.awayScore}
                        </span>
                      </p>
                      <div className="flex items-center space-x-2">
                        {getMarketCapChangeIcon(event.data.marketCapChange)}
                        <span className={`text-sm font-medium ${getMarketCapChangeColor(event.data.marketCapChange)}`}>
                          Market Cap: {formatCurrency(event.data.marketCapBefore)} → {formatCurrency(event.data.marketCapAfter)}
                          {' '}
                          ({event.data.marketCapChangePercent > 0 ? '+' : ''}{event.data.marketCapChangePercent.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm">
                        <span className="font-medium">{event.data.username}</span>
                        {' '}
                        <Badge variant={event.data.orderType === 'BUY' ? 'default' : 'destructive'} className="text-xs">
                          {event.data.orderType}
                        </Badge>
                        {' '}
                        <span className="font-semibold">{event.data.quantity}</span>
                        {' shares of '}
                        <span className="font-medium">{event.data.teamName}</span>
                        {' at '}
                        <span className="font-semibold">{formatCurrency(event.data.pricePerShare)}</span>
                        {' each'}
                      </p>
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                        <span>Total: {formatCurrency(event.data.totalAmount)}</span>
                        {event.data.marketCapBefore && event.data.marketCapAfter && (
                          <span>
                            Market Cap: {formatCurrency(event.data.marketCapBefore)} → {formatCurrency(event.data.marketCapAfter)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

