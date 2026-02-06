import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/shared/components/ui/card';
import { formatPercent } from '@/shared/lib/formatters';
import { ArrowUpDown, ArrowUp, ArrowDown, Trophy } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { LeaderboardInfoWidget } from './LeaderboardInfoWidget';
import { LeaderboardInfoWidgetCompact } from './LeaderboardInfoWidgetCompact';
import { LEADERBOARD_WIDGET_CONFIG } from '../config/leaderboard-widget.config';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  weeklyReturn: number;
  isCurrentUser: boolean;
}

const LeaderboardPage: React.FC = () => {
  const { user } = useAuth();
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<'rank' | 'userName' | 'weeklyReturn'>('rank');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    loadLeaderboardData();
  }, [user]);
  const loadLeaderboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch leaderboard via RPC (returns full_name, bypasses join RLS)
      const { data: leaderboardRecords, error: leaderboardError } = await supabase.rpc(
        'get_weekly_leaderboard_current'
      );

      if (leaderboardError) {
        console.error('Error fetching leaderboard:', leaderboardError);
        throw leaderboardError;
      }

      // If we have real data, use it
      if (leaderboardRecords && leaderboardRecords.length > 0) {
        const transformedData: LeaderboardEntry[] = leaderboardRecords.map((record: { user_id: string; full_name: string | null; rank: number; weekly_return: number }) => {
          const rawName = record.full_name?.trim() ?? (record as { fullName?: string }).fullName?.trim();
          const userName = rawName && !/^User [0-9a-fA-F]{8}$/.test(rawName)
            ? rawName
            : 'Unknown User';
          return {
          rank: record.rank,
          userId: record.user_id,
          userName,
          weeklyReturn: parseFloat(String(record.weekly_return)) * 100, // Convert to percentage
          isCurrentUser: user?.id === record.user_id
        };
        });

        setLeaderboardData(transformedData);
      } else {
        // Fallback to mock data if no real data exists yet
        console.log('No leaderboard data found, using mock data');
        const mockData: LeaderboardEntry[] = [
          { rank: 1, userId: '1', userName: 'Alex Johnson', weeklyReturn: 12.45, isCurrentUser: false },
          { rank: 2, userId: '2', userName: 'Sam Williams', weeklyReturn: 8.21, isCurrentUser: false },
          { rank: 3, userId: '3', userName: 'Jordan Lee', weeklyReturn: 5.02, isCurrentUser: false },
          { rank: 4, userId: '4', userName: 'Chris Patel', weeklyReturn: 3.11, isCurrentUser: false },
          { rank: 5, userId: '5', userName: 'Pat Morgan', weeklyReturn: 1.04, isCurrentUser: false },
          { rank: 6, userId: '6', userName: 'Taylor Swift', weeklyReturn: 0.00, isCurrentUser: false },
          { rank: 7, userId: '7', userName: 'Morgan Freeman', weeklyReturn: 0.00, isCurrentUser: false },
          { rank: 8, userId: '8', userName: 'Casey Brown', weeklyReturn: -1.23, isCurrentUser: false },
          { rank: 9, userId: '9', userName: 'Drew Davis', weeklyReturn: -2.45, isCurrentUser: false },
          { rank: 10, userId: '10', userName: 'Jamie Wilson', weeklyReturn: -4.67, isCurrentUser: false },
        ];

        const dataWithCurrentUser = mockData.map(entry => ({
          ...entry,
          isCurrentUser: user?.id === entry.userId
        }));

        setLeaderboardData(dataWithCurrentUser);
      }
    } catch (error) {
      console.error('Error loading leaderboard data:', error);
      
      // Fallback to mock data on error
      const mockData: LeaderboardEntry[] = [
        { rank: 1, userId: '1', userName: 'Alex Johnson', weeklyReturn: 12.45, isCurrentUser: false },
        { rank: 2, userId: '2', userName: 'Sam Williams', weeklyReturn: 8.21, isCurrentUser: false },
        { rank: 3, userId: '3', userName: 'Jordan Lee', weeklyReturn: 5.02, isCurrentUser: false },
        { rank: 4, userId: '4', userName: 'Chris Patel', weeklyReturn: 3.11, isCurrentUser: false },
        { rank: 5, userId: '5', userName: 'Pat Morgan', weeklyReturn: 1.04, isCurrentUser: false },
        { rank: 6, userId: '6', userName: 'Taylor Swift', weeklyReturn: 0.00, isCurrentUser: false },
        { rank: 7, userId: '7', userName: 'Morgan Freeman', weeklyReturn: 0.00, isCurrentUser: false },
        { rank: 8, userId: '8', userName: 'Casey Brown', weeklyReturn: -1.23, isCurrentUser: false },
        { rank: 9, userId: '9', userName: 'Drew Davis', weeklyReturn: -2.45, isCurrentUser: false },
        { rank: 10, userId: '10', userName: 'Jamie Wilson', weeklyReturn: -4.67, isCurrentUser: false },
      ];

      const dataWithCurrentUser = mockData.map(entry => ({
        ...entry,
        isCurrentUser: user?.id === entry.userId
      }));

      setLeaderboardData(dataWithCurrentUser);
    } finally {
      setLoading(false);
    }
  };

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return <span className="text-yellow-400 text-lg">🥇</span>;
    if (rank === 2) return <span className="text-gray-300 text-lg">🥈</span>;
    if (rank === 3) return <span className="text-orange-400 text-lg">🥉</span>;
    return <span className="text-gray-400 font-medium">{rank}</span>;
  };

  const sortedData = useMemo(() => {
    return [...leaderboardData].sort((a, b) => {
      switch (sortField) {
        case 'userName':
          const aName = a.userName.toLowerCase();
          const bName = b.userName.toLowerCase();
          return sortDirection === 'asc' 
            ? aName.localeCompare(bName)
            : bName.localeCompare(aName);
        case 'weeklyReturn':
          return sortDirection === 'asc' 
            ? a.weeklyReturn - b.weeklyReturn 
            : b.weeklyReturn - a.weeklyReturn;
        case 'rank':
        default:
          return sortDirection === 'asc' 
            ? a.rank - b.rank 
            : b.rank - a.rank;
      }
    });
  }, [leaderboardData, sortField, sortDirection]);

  if (loading) {
    return (
      <div className="md:p-3 sm:p-4 md:p-5 lg:p-6 space-y-3 sm:space-y-4 md:space-y-6 w-full max-w-full overflow-x-hidden">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-trading-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="md:p-3 sm:p-4 md:p-5 lg:p-6 space-y-3 sm:space-y-4 md:space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Header Section */}
      <div className="flex items-center justify-between px-3 md:px-0">
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-400" />
            Weekly Leaderboard
          </h1>
          <p className="text-sm text-gray-400 mt-1">Top performers this week</p>
        </div>
      </div>      {/* Main Leaderboard Table */}
      <Card className="trading-card border-0 md:rounded-lg">
        <CardContent className="p-0">
          {/* Desktop/Tablet Table */}
          <div className="hidden md:block overflow-x-auto w-full max-w-full">
            <table className="trading-table w-full">
              <thead>
                <tr>
                  <th className="text-center w-20 px-3">
                    <button
                      onClick={() => {
                        if (sortField === 'rank') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('rank');
                          setSortDirection('asc');
                        }
                      }}
                      className="flex items-center justify-center gap-1.5 hover:text-foreground transition-colors mx-auto"
                    >
                      <span>Rank</span>
                      {sortField === 'rank' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-20" />
                      )}
                    </button>
                  </th>
                  <th className="text-left px-3">
                    <button
                      onClick={() => {
                        if (sortField === 'userName') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('userName');
                          setSortDirection('asc');
                        }
                      }}
                      className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                    >
                      <span>User</span>
                      {sortField === 'userName' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-20" />
                      )}
                    </button>
                  </th>                  <th className="text-right px-3">
                    <button
                      onClick={() => {
                        if (sortField === 'weeklyReturn') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('weeklyReturn');
                          setSortDirection('desc');
                        }
                      }}
                      className="flex items-center justify-end gap-1.5 hover:text-foreground transition-colors ml-auto"
                    >
                      <span>Weekly Return</span>
                      {sortField === 'weeklyReturn' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-20" />
                      )}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((entry) => (
                  <tr
                    key={entry.userId}
                    className={`group ${entry.isCurrentUser ? 'bg-trading-primary/10' : ''}`}
                  >
                    <td className="px-3 text-center">
                      {getRankDisplay(entry.rank)}
                    </td>                    <td className="px-3">
                      <span className={`font-medium ${entry.isCurrentUser ? 'text-trading-primary' : ''}`}>
                        {entry.userName}
                        {entry.isCurrentUser && <span className="ml-2 text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>(You)</span>}
                      </span>
                    </td>
                    <td className={`px-3 text-right font-mono font-semibold ${
                      entry.weeklyReturn === 0 
                        ? 'price-neutral' 
                        : entry.weeklyReturn > 0 
                        ? 'price-positive' 
                        : 'price-negative'
                    }`}>
                      {entry.weeklyReturn > 0 ? '+' : ''}{formatPercent(entry.weeklyReturn)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>          {/* Mobile Table Layout - Matching Marketplace Style */}
          <div className="md:hidden -mx-3 sm:-mx-4">
            {/* Mobile Table Header */}
            <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700/50">
              <div className="grid grid-cols-[70px_1fr_110px] gap-2 px-4 py-2 text-[10px] font-semibold text-gray-400 items-center">
                <button
                  onClick={() => {
                    if (sortField === 'rank') {
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('rank');
                      setSortDirection('asc');
                    }
                  }}
                  className="flex items-center justify-center gap-1 hover:text-white transition-colors"
                >
                  <span>Rank</span>
                  {sortField === 'rank' ? (
                    sortDirection === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                  ) : (
                    <ArrowUpDown className="h-2.5 w-2.5 opacity-20" />
                  )}
                </button>
                <button
                  onClick={() => {
                    if (sortField === 'userName') {
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('userName');
                      setSortDirection('asc');
                    }
                  }}
                  className="flex items-center gap-1 hover:text-white transition-colors text-left"
                >
                  <span>User</span>
                  {sortField === 'userName' ? (
                    sortDirection === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                  ) : (
                    <ArrowUpDown className="h-2.5 w-2.5 opacity-20" />
                  )}
                </button>                <button
                  onClick={() => {
                    if (sortField === 'weeklyReturn') {
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('weeklyReturn');
                      setSortDirection('desc');
                    }
                  }}
                  className="flex items-center justify-end gap-1 hover:text-white transition-colors ml-auto"
                >
                  <span>Return</span>
                  {sortField === 'weeklyReturn' ? (
                    sortDirection === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                  ) : (
                    <ArrowUpDown className="h-2.5 w-2.5 opacity-20" />
                  )}
                </button>
              </div>
            </div>            {/* Mobile Table Rows */}
            <div className="space-y-0">
              {sortedData.map((entry) => (
                <div key={entry.userId} className="border-b border-gray-700/30 last:border-b-0">
                  <div className={`grid grid-cols-[70px_1fr_110px] gap-2 px-4 py-2.5 items-center active:bg-gray-700/30 transition-colors touch-manipulation ${
                    entry.isCurrentUser ? 'bg-trading-primary/10' : ''
                  }`}>
                    {/* Rank */}
                    <div className="text-center flex justify-center">
                      {getRankDisplay(entry.rank)}
                    </div>                    {/* User */}
                    <div className="flex items-center min-w-0 flex-1">
                      <span className={`text-[11px] font-medium truncate block ${
                        entry.isCurrentUser ? 'text-trading-primary' : 'text-white'
                      }`}>
                        {entry.userName}
                        {entry.isCurrentUser && (
                          <span className="ml-1 text-[9px] text-gray-400">(You)</span>
                        )}
                      </span>
                    </div>                    {/* Return */}
                    <div className={`text-right font-mono font-semibold text-[11px] ${
                      entry.weeklyReturn === 0 
                        ? 'text-gray-400' 
                        : entry.weeklyReturn > 0 
                        ? 'text-green-400' 
                        : 'text-red-400'
                    }`}>
                      {entry.weeklyReturn > 0 ? '+' : ''}{formatPercent(entry.weeklyReturn)}
                    </div>
                  </div>
                </div>
              ))}
            </div>          </div>
        </CardContent>
      </Card>

      {/* Info Widget - Can be easily removed via LEADERBOARD_WIDGET_CONFIG */}
      {LEADERBOARD_WIDGET_CONFIG.enabled && (
        LEADERBOARD_WIDGET_CONFIG.variant === 'full' ? (
          <LeaderboardInfoWidget position={LEADERBOARD_WIDGET_CONFIG.position} />
        ) : (
          <LeaderboardInfoWidgetCompact />
        )
      )}
    </div>
  );
};

export default LeaderboardPage;
