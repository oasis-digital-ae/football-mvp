import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { ArrowUp, ArrowDown, ArrowUpDown, Trophy } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase';
import { formatCurrency } from '@/shared/lib/formatters';
import { useToast } from '@/shared/hooks/use-toast';

interface WeekOption {
  id: string;
  weekStart: string;
  weekEnd: string;
  label: string;
}

interface AdminLeaderboardRow {
  rank: number;
  userId: string;
  username: string;
  startWalletValue: number;
  startPortfolioValue: number;
  startAccountValue: number;
  endWalletValue: number;
  endPortfolioValue: number;
  endAccountValue: number;
  totalDeposits: number;
  weeklyReturn: number;
}

export const AdminWeeklyLeaderboardPanel: React.FC = () => {
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<WeekOption | null>(null);
  const [data, setData] = useState<AdminLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<'rank' | 'username' | 'weeklyReturn'>('rank');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const { toast } = useToast();

  /* -------------------- LOAD WEEKS -------------------- */
  useEffect(() => {
    const loadWeeks = async () => {
      try {
        const { data: weeksData, error } = await supabase
          .from('weekly_leaderboard')
          .select('week_start, week_end')
          .order('week_start', { ascending: false });

        if (error) throw error;

        const uniqueWeeks = Array.from(
          new Map(weeksData.map(w => [`${w.week_start}_${w.week_end}`, w])).values()
        );

        const formatted = uniqueWeeks.map((w, i) => {
          const startDate = new Date(w.week_start);
          const endDate = new Date(w.week_end);

          const formatDate = (date: Date) => {
            const day = date.getDate();
            const suffix =
              day === 1 || day === 21 || day === 31 ? 'st'
              : day === 2 || day === 22 ? 'nd'
              : day === 3 || day === 23 ? 'rd'
              : 'th';

            const month = date.toLocaleDateString('en-GB', { month: 'short' });
            const year = date.getFullYear();

            return `${day}${suffix} ${month} ${year}`;
          };

          return {
            id: `${w.week_start}_${w.week_end}`,
            weekStart: w.week_start,
            weekEnd: w.week_end,
            label: `Week ${uniqueWeeks.length - i}: ${formatDate(startDate)} - ${formatDate(endDate)}${i === 0 ? ' (Latest)' : ''}`
          };
        });

        setWeeks(formatted);
        setSelectedWeek(formatted[0]);
      } catch (error) {
        console.error(error);
        toast({
          title: 'Error',
          description: 'Failed to load weekly leaderboard weeks',
          variant: 'destructive'
        });
      }
    };

    loadWeeks();
  }, [toast]);

  /* -------------------- LOAD DATA -------------------- */
  useEffect(() => {
    if (!selectedWeek) return;

    const loadLeaderboard = async () => {
      setLoading(true);

      try {
        const { data: leaderboardData, error } = await supabase
          .from('weekly_leaderboard')
          .select(
            'user_id, rank, start_wallet_value, start_portfolio_value, start_account_value, end_wallet_value, end_portfolio_value, end_account_value, deposits_week, weekly_return, week_start, week_end'
          )
          .eq('week_start', selectedWeek.weekStart)
          .eq('week_end', selectedWeek.weekEnd)
          .order('rank', { ascending: true });

        if (error) throw error;

        const userIds = leaderboardData.map(row => row.user_id);

        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, first_name, last_name, username')
          .in('id', userIds);

        if (profilesError) throw profilesError;

        const userMap = new Map(
          profiles.map(p => [
            p.id,
            p.full_name?.trim() && !/^User [0-9a-fA-F]{8}$/.test(p.full_name)
              ? p.full_name.trim()
              : [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
                p.username ||
                'Unknown User'
          ])
        );

        const mappedData = leaderboardData.map(row => ({
          rank: row.rank,
          userId: row.user_id,
          username: userMap.get(row.user_id) || 'Unknown User',
          startWalletValue: row.start_wallet_value,
          startPortfolioValue: row.start_portfolio_value,
          startAccountValue: row.start_account_value,
          endWalletValue: row.end_wallet_value,
          endPortfolioValue: row.end_portfolio_value,
          endAccountValue: row.end_account_value,
          totalDeposits: row.deposits_week,
          weeklyReturn: Number(row.weekly_return)
        }));

        setData(mappedData);
      } catch (error) {
        console.error(error);
        toast({
          title: 'Error',
          description: 'Failed to load weekly leaderboard data',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };

    loadLeaderboard();
  }, [selectedWeek, toast]);

  /* -------------------- SORT -------------------- */
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case 'username':
          aVal = a.username.toLowerCase();
          bVal = b.username.toLowerCase();
          break;
        case 'weeklyReturn':
          aVal = a.weeklyReturn;
          bVal = b.weeklyReturn;
          break;
        default:
          aVal = a.rank;
          bVal = b.rank;
      }

      return sortDirection === 'asc'
        ? aVal > bVal ? 1 : -1
        : aVal < bVal ? 1 : -1;
    });
  }, [data, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />;
  };

  /* -------------------- UI -------------------- */
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-400" />
              <span className="text-base md:text-lg">Admin Weekly Leaderboard</span>
            </div>

            {selectedWeek && (
              <Badge
                variant="secondary"
                className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 text-[10px] md:text-xs w-fit"
              >
                {(() => {
                  const start = new Date(selectedWeek.weekStart);
                  const end = new Date(selectedWeek.weekEnd);

                  // Force UAE display cycle
                  start.setHours(3, 0, 0, 0);
                  end.setHours(2, 59, 0, 0);

                  const formatDateTime = (date: Date) => {
                    const day = date.getDate();
                    const suffix =
                      day === 1 || day === 21 || day === 31 ? 'st'
                      : day === 2 || day === 22 ? 'nd'
                      : day === 3 || day === 23 ? 'rd'
                      : 'th';

                    const month = date.toLocaleDateString('en-GB', { month: 'short' });
                    const year = date.getFullYear();
                    const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });

                    const time = date.toLocaleTimeString('en-GB', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                      timeZone: 'Asia/Dubai'
                    });

                    return `${day}${suffix} ${month} ${year} ${weekday} ${time}`;
                  };

                  return `${formatDateTime(start)} to ${formatDateTime(end)} (UAE)`;
                })()}
              </Badge>
            )}
          </div>

          <Select
            value={selectedWeek?.id}
            onValueChange={(id) => {
              const week = weeks.find(w => w.id === id);
              if (week) setSelectedWeek(week);
            }}
          >
            <SelectTrigger className="w-full md:w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weeks.map(w => (
                <SelectItem key={w.id} value={w.id}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="text-center">Start Wallet Value</TableHead>
                  <TableHead className="text-center">Start Portfolio Value</TableHead>
                  <TableHead className="text-center">Start Account Value</TableHead>
                  <TableHead className="text-center">End Wallet Value</TableHead>
                  <TableHead className="text-center">End Portfolio Value</TableHead>
                  <TableHead className="text-center">End Account Value</TableHead>
                  <TableHead className="text-center">Total Deposits</TableHead>
                  <TableHead className="text-center">% Weekly Return</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {sortedData.map(row => (
                  <TableRow key={row.userId}>
                    <TableCell>{row.rank}</TableCell>
                    <TableCell>{row.username}</TableCell>
                    <TableCell className="text-center font-mono">{formatCurrency(row.startWalletValue / 100)}</TableCell>
                    <TableCell className="text-center font-mono">{formatCurrency(row.startPortfolioValue / 100)}</TableCell>
                    <TableCell className="text-center font-mono">{formatCurrency(row.startAccountValue / 100)}</TableCell>
                    <TableCell className="text-center font-mono">{formatCurrency(row.endWalletValue / 100)}</TableCell>
                    <TableCell className="text-center font-mono">{formatCurrency(row.endPortfolioValue / 100)}</TableCell>
                    <TableCell className="text-center font-mono">{formatCurrency(row.endAccountValue / 100)}</TableCell>
                    <TableCell className="text-center font-mono">{formatCurrency(row.totalDeposits / 100)}</TableCell>
                    <TableCell
                      className={`text-center font-mono font-semibold ${
                        row.weeklyReturn >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {row.weeklyReturn >= 0 ? '+' : ''}
                      {(row.weeklyReturn * 100).toFixed(2)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};