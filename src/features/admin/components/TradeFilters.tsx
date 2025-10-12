// Trade filters component for admin dashboard
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Badge } from '@/shared/components/ui/badge';
import { CalendarIcon, X, Filter, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { DatePickerWithRange } from '@/shared/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import type { TradeHistoryFilters } from '../types/admin.types';
import { supabase } from '@/shared/lib/supabase';

interface TradeFiltersProps {
  filters: TradeHistoryFilters;
  onFiltersChange: (filters: TradeHistoryFilters) => void;
  onClearFilters: () => void;
}

interface Team {
  id: number;
  name: string;
}

interface User {
  id: string;
  username: string;
}

export const TradeFilters: React.FC<TradeFiltersProps> = ({
  filters,
  onFiltersChange,
  onClearFilters
}) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Load teams and users for dropdowns
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load teams
        const { data: teamsData } = await supabase
          .from('teams')
          .select('id, name')
          .order('name');

        // Load users (profiles)
        const { data: usersData } = await supabase
          .from('profiles')
          .select('id, username')
          .not('username', 'is', null)
          .order('username');

        setTeams(teamsData || []);
        setUsers(usersData || []);
      } catch (error) {
        console.error('Error loading filter data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleDateRangeChange = (range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      onFiltersChange({
        ...filters,
        dateRange: {
          start: range.from.toISOString(),
          end: range.to.toISOString()
        }
      });
    } else {
      const { dateRange, ...rest } = filters;
      onFiltersChange(rest);
    }
  };

  const handleUserChange = (userId: string) => {
    if (userId === 'all') {
      const { userId: _, ...rest } = filters;
      onFiltersChange(rest);
    } else {
      onFiltersChange({ ...filters, userId });
    }
  };

  const handleTeamChange = (teamId: string) => {
    if (teamId === 'all') {
      const { teamId: _, ...rest } = filters;
      onFiltersChange(rest);
    } else {
      onFiltersChange({ ...filters, teamId: parseInt(teamId) });
    }
  };

  const handleOrderTypeChange = (orderType: string) => {
    if (orderType === 'ALL') {
      const { orderType: _, ...rest } = filters;
      onFiltersChange(rest);
    } else {
      onFiltersChange({ ...filters, orderType: orderType as 'BUY' | 'SELL' });
    }
  };

  const handleStatusChange = (status: string) => {
    if (status === 'ALL') {
      const { status: _, ...rest } = filters;
      onFiltersChange(rest);
    } else {
      onFiltersChange({ ...filters, status: status as 'PENDING' | 'FILLED' | 'CANCELLED' });
    }
  };

  const handleMinAmountChange = (value: string) => {
    const amount = parseFloat(value);
    if (isNaN(amount) || amount <= 0) {
      const { minAmount: _, ...rest } = filters;
      onFiltersChange(rest);
    } else {
      onFiltersChange({ ...filters, minAmount: amount });
    }
  };

  const handleMaxAmountChange = (value: string) => {
    const amount = parseFloat(value);
    if (isNaN(amount) || amount <= 0) {
      const { maxAmount: _, ...rest } = filters;
      onFiltersChange(rest);
    } else {
      onFiltersChange({ ...filters, maxAmount: amount });
    }
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.dateRange) count++;
    if (filters.userId) count++;
    if (filters.teamId) count++;
    if (filters.orderType && filters.orderType !== 'ALL') count++;
    if (filters.status && filters.status !== 'ALL') count++;
    if (filters.minAmount) count++;
    if (filters.maxAmount) count++;
    return count;
  };

  const activeFiltersCount = getActiveFiltersCount();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filters</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-muted rounded animate-pulse" />
                <div className="h-10 bg-muted rounded animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <Badge variant="secondary">{activeFiltersCount} active</Badge>
            )}
          </div>
          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="h-8 px-2"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date Range */}
        <div className="space-y-2">
          <Label>Date Range</Label>
          <DatePickerWithRange
            date={filters.dateRange ? {
              from: new Date(filters.dateRange.start),
              to: new Date(filters.dateRange.end)
            } : undefined}
            onDateChange={handleDateRangeChange}
          />
        </div>

        {/* User Filter */}
        <div className="space-y-2">
          <Label>User</Label>
          <Select
            value={filters.userId || 'all'}
            onValueChange={handleUserChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select user" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Team Filter */}
        <div className="space-y-2">
          <Label>Team</Label>
          <Select
            value={filters.teamId?.toString() || 'all'}
            onValueChange={handleTeamChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select team" />
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

        {/* Order Type Filter */}
        <div className="space-y-2">
          <Label>Order Type</Label>
          <Select
            value={filters.orderType || 'ALL'}
            onValueChange={handleOrderTypeChange}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="BUY">Buy Orders</SelectItem>
              <SelectItem value="SELL">Sell Orders</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status Filter */}
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={filters.status || 'ALL'}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="FILLED">Filled</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Amount Range */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label>Min Amount</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={filters.minAmount || ''}
              onChange={(e) => handleMinAmountChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Max Amount</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={filters.maxAmount || ''}
              onChange={(e) => handleMaxAmountChange(e.target.value)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

