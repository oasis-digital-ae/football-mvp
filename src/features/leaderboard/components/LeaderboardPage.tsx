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
        // No leaderboard data found
        setLeaderboardData([]);
      }
    } catch (error) {
      console.error('Error loading leaderboard data:', error);      
      setLeaderboardData([]);
    } finally {
      setLoading(false);
    }
  };
  const getRankDisplay = (rank: number) => {
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
      </div>      
      
      {/* Main Leaderboard Table */}
      <Card className="trading-card border-0 md:rounded-lg max-w-3xl mx-auto">
        <CardContent className="p-0">
          
          {/* Desktop/Tablet Table */}
          <div className="hidden md:block overflow-x-auto w-auto min-w-[700px] max-w-full">
            <table className="trading-table table-fixed border-collapse w-auto min-w-[700px]">
              <thead>
                <tr>
                  <th className="text-center w-[60px] px-1">
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
                  <th className="text-left w-[45%] px-2">
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
                  </th>                  
                  <th className="text-center w-[25%] px-2">
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
                {/* If no data, show a friendly message */}
                {sortedData.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center py-10 text-gray-400">
                      No Rankings Displayed Yet.
                    </td>
                  </tr>
                )}

                {sortedData.map((entry) => (
                  <tr
                    key={entry.userId}
                    className={`group ${entry.isCurrentUser ? 'bg-trading-primary/10' : ''}`}
                  >
                    <td className="px-2 text-center">
                      {getRankDisplay(entry.rank)}
                    </td>
                    <td className="px-2">
                      <span className={`font-medium ${entry.isCurrentUser ? 'text-trading-primary' : ''}`}>
                        {entry.userName}
                        {entry.isCurrentUser && <span className="ml-2 text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>(You)</span>}
                      </span>
                    </td>
                    <td className={`px-2 text-right font-mono font-semibold ${
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
          </div>          
          
          {/* Mobile Table Layout - Matching Marketplace Style */}
          <div className="md:hidden -mx-3 sm:-mx-4">
            
            {/* Mobile Table Header */}
            <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700/50">
              <div className="grid grid-cols-[70px_0.9fr_80px] gap-2 px-3 py-2 text-[10px] font-semibold text-gray-400 items-center">
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
            </div>            
            
            {/* Mobile Table Rows */}
            <div className="space-y-0">
              {sortedData.map((entry) => (
                <div key={entry.userId} className="border-b border-gray-700/30 last:border-b-0">
                  <div className={`grid grid-cols-[70px_0.9fr_80px] gap-2 px-3 py-2 items-center active:bg-gray-700/30 transition-colors touch-manipulation ${
                    entry.isCurrentUser ? 'bg-trading-primary/10' : ''
                  }`}>
                    
                    {/* Rank */}
                    <div className="text-center flex justify-center text-[10px] font-medium">
                      {getRankDisplay(entry.rank)}
                    </div>                    
                    
                    {/* User */}
                    <div className="flex items-center min-w-0 flex-1">
                      <span className={`text-[10px] font-medium truncate block ${
                        entry.isCurrentUser ? 'text-trading-primary' : 'text-white'
                      }`}>
                        {entry.userName}
                        {entry.isCurrentUser && (
                          <span className="ml-1 text-[9px] text-gray-400">(You)</span>
                        )}
                      </span>
                    </div>                    
                    
                    {/* Return */}
                    <div className={`text-right font-mono font-semibold text-[10px] ${
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
            </div>          
          </div>
        </CardContent>
      </Card>

      {/* Info Widget for Leaderboard */}
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
