// Admin service for managing admin panel data
import { supabase } from '../supabase';
import { logger } from '../logger';
import { auditService } from './audit.service';
import { fromCents } from '../utils/decimal';
import { formatCurrency } from '../formatters';
import type { 
  SystemStats, 
  TeamMarketCapOverview, 
  UserInvestment, 
  TradeHistoryEntry, 
  TradeHistoryFilters,
  TimelineEvent,
  FixtureEvent,
  OrderEvent
} from '@/features/admin/types/admin.types';

export const adminService = {
  /**
   * Check if current user is admin
   */
  async checkAdminStatus(): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (error) {
        logger.error('Error checking admin status:', error);
        return false;
      }

      return profile?.is_admin ?? false;
    } catch (error) {
      logger.error('Error checking admin status:', error);
      return false;
    }
  },

  /**
   * Get system statistics for admin dashboard
   */
  async getSystemStats(): Promise<SystemStats> {

    try {
      // Get total cash injected (sum of BUY orders only - SELL orders return cash to users)
      // Fixed Shares Model: Purchases don't change market cap, only available_shares
      const { data: cashData, error: cashError } = await supabase
        .from('orders')
        .select('total_amount, order_type')
        .eq('status', 'FILLED')
        .eq('order_type', 'BUY'); // Only count purchases, not sales

      if (cashError) throw cashError;

      // Convert cents to dollars: total_amount is now BIGINT (cents)
      const totalCashInjected = (cashData || []).reduce((sum, order) => sum + fromCents(order.total_amount || 0).toNumber(), 0);

      // Get total active users (users with positions > 0)
      const { data: usersData, error: usersError } = await supabase
        .from('positions')
        .select('user_id')
        .gt('quantity', 0);

      if (usersError) throw usersError;

      const totalActiveUsers = new Set(usersData?.map(p => p.user_id) || []).size;

      // Get total trades executed (both BUY and SELL orders)
      const { data: tradesData, error: tradesError } = await supabase
        .from('orders')
        .select('total_amount, order_type')
        .eq('status', 'FILLED');

      if (tradesError) throw tradesError;

      const totalTradesExecuted = tradesData?.length || 0;
      // Calculate average trade size from all trades (BUY and SELL)
      // Convert cents to dollars: total_amount is now BIGINT (cents)
      const totalTradeVolume = (tradesData || []).reduce((sum, order) => sum + fromCents(order.total_amount || 0).toNumber(), 0);
      const averageTradeSize = totalTradesExecuted > 0 ? totalTradeVolume / totalTradesExecuted : 0;

      // Get market cap overview by team (Fixed Shares Model)
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select(`
          id,
          name,
          market_cap,
          total_shares,
          available_shares,
          shares_outstanding
        `);

      if (teamsError) throw teamsError;

      // Get total investments per team separately
      const { data: investmentsData, error: investmentsError } = await supabase
        .from('positions')
        .select('team_id, total_invested');

      if (investmentsError) throw investmentsError;

      // Calculate total investments per team
      const teamInvestments = new Map<number, number>();
      // Convert cents to dollars: total_invested is now BIGINT (cents)
      (investmentsData || []).forEach(investment => {
        const current = teamInvestments.get(investment.team_id) || 0;
        teamInvestments.set(investment.team_id, current + fromCents(investment.total_invested || 0).toNumber());
      });

      const marketCapOverview: TeamMarketCapOverview[] = (teamsData || []).map(team => {
        const totalInvestments = teamInvestments.get(team.id) || 0;
        // Fixed Shares Model: Price = market_cap / total_shares (1000)
        // Market cap only changes on match results, not on purchases/sales
        const totalShares = team.total_shares || 1000;
        // Convert cents to dollars: market_cap is now BIGINT (cents)
        const marketCapDollars = fromCents(team.market_cap || 0).toNumber();
        const sharePrice = totalShares > 0 ? marketCapDollars / totalShares : 0;

        return {
          teamId: team.id,
          teamName: team.name,
          currentMarketCap: marketCapDollars,
          totalInvestments,
          sharePrice,
          availableShares: team.available_shares || 1000 // Available shares for purchase (out of 1000 total fixed shares)
        };
      });

      return {
        totalCashInjected,
        totalActiveUsers,
        totalTradesExecuted,
        averageTradeSize,
        marketCapOverview,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error fetching system stats:', error);
      throw error;
    }
  },

  /**
   * Get individual trade records (orders) - includes both BUY and SELL orders
   * Fixed Shares Model: Market cap does NOT change on purchases/sales, only available_shares changes
   */
  async getUserInvestments(): Promise<UserInvestment[]> {

    try {
      // Get all filled orders (both BUY and SELL) with user and team details
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          user_id,
          team_id,
          order_type,
          quantity,
          price_per_share,
          total_amount,
          status,
          executed_at,
          created_at,
          market_cap_before,
          market_cap_after,
          shares_outstanding_before,
          shares_outstanding_after,
          profiles!inner(username, full_name),
          teams!inner(name, market_cap, total_shares, available_shares, shares_outstanding)
        `)
        .eq('status', 'FILLED')
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Convert each order to UserInvestment format (one row per trade)
      const userInvestments: UserInvestment[] = (ordersData || []).map(order => {
        // Type assertion for joined relations (Supabase infers them as arrays but they're objects)
        const team = (order.teams as any) || {};
        const profile = (order.profiles as any) || {};
        
        // Calculate current value from team data (Fixed Shares Model)
        // Convert cents to dollars: market_cap and monetary values are now BIGINT (cents)
        const teamMarketCapDollars = fromCents(team.market_cap || 0).toNumber();
        const teamTotalShares = team.total_shares || 1000; // Fixed at 1000 shares
        const currentSharePrice = teamTotalShares > 0 ? teamMarketCapDollars / teamTotalShares : 0;
        const currentValue = order.quantity * currentSharePrice;
        const orderTotalAmountDollars = fromCents(order.total_amount || 0).toNumber();
        // For BUY: profitLoss = currentValue - cost
        // For SELL: profitLoss calculation would need cost basis (not calculated here)
        const profitLoss = order.order_type === 'BUY' 
          ? currentValue - orderTotalAmountDollars 
          : 0; // SELL profitLoss would need cost basis calculation

        return {
          userId: order.user_id,
          username: profile.username || 'Unknown',
          fullName: profile.full_name,
          totalInvested: orderTotalAmountDollars,
          numberOfTeams: 1, // Each row represents one team purchase
          largestPosition: {
            teamName: team.name || 'Unknown',
            amount: orderTotalAmountDollars
          },
          firstInvestmentDate: order.created_at && !isNaN(new Date(order.created_at).getTime()) 
            ? new Date(order.created_at).toISOString() 
            : new Date().toISOString(),
          lastActivityDate: order.created_at && !isNaN(new Date(order.created_at).getTime()) 
            ? new Date(order.created_at).toISOString() 
            : new Date().toISOString(),
          totalPortfolioValue: currentValue,
          profitLoss: profitLoss,
          // Additional fields for individual purchases
          orderId: order.id,
          orderType: order.order_type,
          shares: order.quantity,
          pricePerShare: fromCents(order.price_per_share || 0).toNumber(), // Convert cents to dollars
          teamName: team.name || 'Unknown',
          executedAt: order.executed_at,
          marketCapBefore: fromCents(order.market_cap_before || 0).toNumber(), // Convert cents to dollars
          marketCapAfter: fromCents(order.market_cap_after || 0).toNumber(), // Convert cents to dollars
          sharesOutstandingBefore: order.shares_outstanding_before, // This is total_shares (1000) in fixed model
          sharesOutstandingAfter: order.shares_outstanding_after, // This is total_shares (1000) in fixed model
          currentSharePrice: currentSharePrice
        };
      });

      return userInvestments;
    } catch (error) {
      logger.error('Error fetching user investments:', error);
      throw error;
    }
  },

  /**
   * Get trade history with filtering
   */
  async getTradeHistory(filters: TradeHistoryFilters = {}): Promise<TradeHistoryEntry[]> {

    try {
      let query = supabase
        .from('orders')
        .select(`
          *,
          profiles!inner(username),
          teams!inner(name)
        `);

      // Apply filters
      if (filters.dateRange) {
        query = query
          .gte('executed_at', filters.dateRange.start)
          .lte('executed_at', filters.dateRange.end);
      }

      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters.teamId) {
        query = query.eq('team_id', filters.teamId);
      }

      if (filters.orderType && filters.orderType !== 'ALL') {
        query = query.eq('order_type', filters.orderType);
      }

      if (filters.minAmount) {
        // Convert dollars to cents for database query (database stores as BIGINT cents)
        query = query.gte('total_amount', Math.round(filters.minAmount * 100));
      }

      if (filters.maxAmount) {
        // Convert dollars to cents for database query (database stores as BIGINT cents)
        query = query.lte('total_amount', Math.round(filters.maxAmount * 100));
      }

      if (filters.status && filters.status !== 'ALL') {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query
        .order('executed_at', { ascending: false })
        .limit(1000); // Limit for performance

      if (error) throw error;

      return (data || []).map(order => ({
        ...order,
        username: order.profiles?.username || 'Unknown',
        teamName: order.teams?.name || 'Unknown',
        // Convert cents to dollars: total_amount, price_per_share, and market_cap fields are BIGINT (cents)
        total_amount: fromCents(order.total_amount || 0).toNumber(),
        price_per_share: fromCents(order.price_per_share || 0).toNumber(),
        market_cap_before: order.market_cap_before ? fromCents(order.market_cap_before).toNumber() : undefined,
        market_cap_after: order.market_cap_after ? fromCents(order.market_cap_after).toNumber() : undefined
      }));
    } catch (error) {
      logger.error('Error fetching trade history:', error);
      throw error;
    }
  },

  /**
   * Get public orders and fixtures timeline for a team
   */
  async getOrdersAndFixturesTimeline(teamId: number): Promise<TimelineEvent[]> {
    try {
      // Get filled orders for the team
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          executed_at,
          order_type,
          quantity,
          price_per_share,
          total_amount,
          market_cap_before,
          market_cap_after,
          profiles!inner(username),
          teams!inner(name)
        `)
        .eq('team_id', teamId)
        .eq('status', 'FILLED')
        .order('executed_at', { ascending: false })
        .limit(50);

      if (ordersError) throw ordersError;

      // Get fixtures for the team
      const { data: fixturesData, error: fixturesError } = await supabase
        .from('fixtures')
        .select(`
          id,
          kickoff_at,
          home_score,
          away_score,
          result,
          status,
          snapshot_home_cap,
          snapshot_away_cap,
          home_team_id,
          away_team_id,
          home_team:teams!fixtures_home_team_id_fkey(name),
          away_team:teams!fixtures_away_team_id_fkey(name)
        `)
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .eq('status', 'applied')
        .order('kickoff_at', { ascending: false })
        .limit(20);

      if (fixturesError) throw fixturesError;

      // Convert orders to timeline events
      const orderEvents: TimelineEvent[] = (ordersData || []).map(order => {
        const team = (order.teams as any) || {};
        const profile = (order.profiles as any) || {};
        
        return {
          type: 'order' as const,
          timestamp: new Date(order.executed_at),
          data: {
            id: order.id,
            username: profile.username || 'Unknown',
            teamName: team.name || 'Unknown',
            orderType: order.order_type as 'BUY' | 'SELL',
            quantity: order.quantity,
            pricePerShare: fromCents(order.price_per_share || 0).toNumber(), // Convert cents to dollars
            totalAmount: fromCents(order.total_amount || 0).toNumber(), // Convert cents to dollars
            marketCapBefore: fromCents(order.market_cap_before || 0).toNumber(), // Convert cents to dollars
            marketCapAfter: fromCents(order.market_cap_after || 0).toNumber() // Convert cents to dollars
          } as OrderEvent
        };
      });

      // Convert fixtures to timeline events
      const fixtureEvents: TimelineEvent[] = (fixturesData || []).map(fixture => {
        const isHomeTeam = fixture.home_team_id === teamId;
        // Convert cents to dollars: snapshot caps are now BIGINT (cents)
        const marketCapBeforeCents = isHomeTeam ? fixture.snapshot_home_cap : fixture.snapshot_away_cap;
        const marketCapBefore = fromCents(marketCapBeforeCents || 0).toNumber();
        const marketCapAfter = isHomeTeam ? 
          (fixture.result === 'home_win' ? marketCapBefore * 1.1 : 
           fixture.result === 'away_win' ? marketCapBefore * 0.9 : marketCapBefore) :
          (fixture.result === 'away_win' ? marketCapBefore * 1.1 : 
           fixture.result === 'home_win' ? marketCapBefore * 0.9 : marketCapBefore);

        const homeTeam = (fixture.home_team as any) || {};
        const awayTeam = (fixture.away_team as any) || {};

        return {
          type: 'fixture' as const,
          timestamp: new Date(fixture.kickoff_at),
          data: {
            id: fixture.id,
            homeTeam: homeTeam.name || 'Unknown',
            awayTeam: awayTeam.name || 'Unknown',
            homeScore: fixture.home_score,
            awayScore: fixture.away_score,
            result: fixture.result as 'home_win' | 'away_win' | 'draw',
            marketCapBefore,
            marketCapAfter,
            marketCapChange: marketCapAfter - marketCapBefore,
            marketCapChangePercent: ((marketCapAfter - marketCapBefore) / marketCapBefore) * 100
          } as FixtureEvent
        };
      });

      // Combine and sort by timestamp
      const allEvents = [...orderEvents, ...fixtureEvents];
      return allEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      logger.error('Error fetching timeline events:', error);
      throw error;
    }
  },

  /**
   * Get system activity data for real-time monitoring
   */
  async getSystemActivity(): Promise<{
    recentTrades: number;
    systemStatus: 'normal' | 'high_volume' | 'error';
    lastCheck: string;
    dbResponseTime: number;
    activeUsers: number;
  }> {
    const startTime = Date.now();
    
    try {
      // Get recent trades (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentTrades, error: tradesError } = await supabase
        .from('orders')
        .select('id')
        .gte('created_at', oneHourAgo)
        .eq('status', 'FILLED');

      if (tradesError) {
        logger.error('Error fetching recent trades:', tradesError);
        throw new Error(`Failed to fetch recent trades: ${tradesError.message}`);
      }

      // Get active users
      const { data: activeUsers, error: usersError } = await supabase
        .from('positions')
        .select('user_id')
        .gt('quantity', 0);

      if (usersError) {
        logger.error('Error fetching active users:', usersError);
        throw new Error(`Failed to fetch active users: ${usersError.message}`);
      }

      const dbResponseTime = Date.now() - startTime;
      const uniqueActiveUsers = new Set(activeUsers?.map(p => p.user_id) || []).size;
      const tradeCount = recentTrades?.length || 0;

      return {
        recentTrades: tradeCount,
        systemStatus: tradeCount > 20 ? 'high_volume' : 'normal',
        lastCheck: new Date().toISOString(),
        dbResponseTime,
        activeUsers: uniqueActiveUsers
      };
    } catch (error) {
      logger.error('Error in getSystemActivity:', error);
      throw error;
    }
  },

  /**
   * Log admin action for audit trail
   */
  async logAdminAction(action: string, details: Record<string, any>): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        logger.warn('No authenticated user for audit logging');
        return;
      }

      // Use the dedicated audit service
      await auditService.logAdminAction(user.id, action, details);
    } catch (error) {
      logger.error('Error logging admin action:', error);
      // Don't throw - audit logging shouldn't break the main flow
    }
  },

  /**
   * Get financial overview for admin dashboard
   */
  async getFinancialOverview(): Promise<{
    totalPlatformValue: number;
    totalUserDeposits: number;
    totalUserWallets: number;
    totalInvested: number;
    platformRevenue: number;
  }> {
    try {
      // Get total platform value (sum of all team market caps)
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('market_cap');

      if (teamsError) {
        logger.error('Error fetching teams for financial overview:', teamsError);
        throw new Error(`Failed to fetch teams: ${teamsError.message}`);
      }
      // Convert cents to dollars: market_cap is now BIGINT (cents)
      const totalPlatformValue = (teams || []).reduce((sum, team) => sum + fromCents(team.market_cap || 0).toNumber(), 0);

      // Get total user deposits (from wallet_transactions where type = 'deposit')
      const { data: deposits, error: depositsError } = await supabase
        .from('wallet_transactions')
        .select('amount_cents')
        .eq('type', 'deposit');

      if (depositsError) {
        logger.error('Error fetching deposits for financial overview:', depositsError);
        throw new Error(`Failed to fetch deposits: ${depositsError.message}`);
      }
      const totalUserDeposits = (deposits || []).reduce((sum, tx) => sum + fromCents(tx.amount_cents || 0).toNumber(), 0);

      // Get total user wallets (sum of all wallet balances)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('wallet_balance');

      if (profilesError) {
        logger.error('Error fetching profiles for financial overview:', profilesError);
        throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
      }
      // Convert cents to dollars: wallet_balance is now BIGINT (cents)
      const totalUserWallets = (profiles || []).reduce((sum, profile) => sum + fromCents(profile.wallet_balance || 0).toNumber(), 0);

      // Get total invested (sum of all positions.total_invested)
      const { data: positions, error: positionsError } = await supabase
        .from('positions')
        .select('total_invested')
        .gt('quantity', 0);

      if (positionsError) {
        logger.error('Error fetching positions for financial overview:', positionsError);
        throw new Error(`Failed to fetch positions: ${positionsError.message}`);
      }
      // Convert cents to dollars: total_invested is now BIGINT (cents)
      const totalInvested = (positions || []).reduce((sum, pos) => sum + fromCents(pos.total_invested || 0).toNumber(), 0);

      // Platform revenue = total deposits - total wallets (money in system)
      const platformRevenue = totalUserDeposits - totalUserWallets;

      return {
        totalPlatformValue,
        totalUserDeposits,
        totalUserWallets,
        totalInvested,
        platformRevenue
      };
    } catch (error) {
      logger.error('Error fetching financial overview:', error);
      throw error;
    }
  },

  /**
   * Get all wallet transactions across users
   */
  async getAllWalletTransactions(limit = 1000): Promise<Array<{
    id: number;
    user_id: string;
    username: string;
    amount_cents: number;
    currency: string;
    type: string;
    ref?: string;
    created_at: string;
  }>> {
    try {
      // First get wallet transactions
      const { data: transactions, error: transactionsError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (transactionsError) throw transactionsError;

      // Then get usernames for each user_id
      const userIds = [...new Set((transactions || []).map(tx => tx.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);

      // Don't throw on profiles error, just log it - we can still return transactions
      if (profilesError) {
        logger.warn('Error fetching profiles for wallet transactions:', profilesError);
      }

      const profilesMap = new Map((profiles || []).map(p => [p.id, p.username]));

      return (transactions || []).map(tx => ({
        id: tx.id,
        user_id: tx.user_id,
        username: profilesMap.get(tx.user_id) || 'Unknown',
        amount_cents: tx.amount_cents,
        currency: tx.currency,
        type: tx.type,
        ref: tx.ref,
        created_at: tx.created_at
      }));
    } catch (error) {
      logger.error('Error fetching all wallet transactions:', error);
      throw error;
    }
  },

  /**
   * Get recent activity feed (trades, deposits, registrations, match results)
   * Shows all user activities throughout the application
   */
  async getRecentActivity(limit = 50): Promise<Array<{
    type: 'trade' | 'deposit' | 'registration' | 'match';
    timestamp: string;
    description: string;
    user_id?: string;
    username?: string;
    amount?: number;
  }>> {
    try {
      const activities: Array<{
        type: 'trade' | 'deposit' | 'registration' | 'match';
        timestamp: string;
        description: string;
        user_id?: string;
        username?: string;
        amount?: number;
      }> = [];

      // Get recent trades - increased limit to show more activity
      const { data: recentTrades, error: tradesError } = await supabase
        .from('orders')
        .select(`
          user_id,
          executed_at,
          created_at,
          order_type,
          total_amount,
          quantity,
          profiles!inner(username),
          teams!inner(name)
        `)
        .eq('status', 'FILLED')
        .order('executed_at', { ascending: false })
        .limit(limit);

      if (!tradesError && recentTrades) {
        recentTrades.forEach((trade: any) => {
          const team = trade.teams || {};
          const profile = trade.profiles || {};
          const amount = fromCents(trade.total_amount || 0).toNumber();
          const quantity = trade.quantity || 0;
          
          activities.push({
            type: 'trade',
            timestamp: trade.executed_at || trade.created_at,
            description: `${profile.username || 'User'} ${trade.order_type === 'BUY' ? 'bought' : 'sold'} ${quantity} shares of ${team.name || 'shares'} for ${formatCurrency(amount)}`,
            user_id: trade.user_id,
            username: profile.username,
            amount: amount
          });
        });
      }

      // Get recent wallet deposits/transactions
      const { data: recentDeposits, error: depositsError } = await supabase
        .from('wallet_transactions')
        .select(`
          user_id,
          amount_cents,
          type,
          created_at,
          profiles!inner(username)
        `)
        .in('type', ['deposit', 'refund', 'adjustment', 'credit_loan'])
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!depositsError && recentDeposits) {
        recentDeposits.forEach((deposit: any) => {
          const profile = deposit.profiles || {};
          const amount = fromCents(deposit.amount_cents || 0).toNumber();
          
          let description = '';
          if (deposit.type === 'deposit') {
            description = `${profile.username || 'User'} deposited ${formatCurrency(amount)}`;
          } else if (deposit.type === 'refund') {
            description = `${profile.username || 'User'} received a refund of ${formatCurrency(amount)}`;
          } else if (deposit.type === 'adjustment') {
            description = `${profile.username || 'User'} wallet adjusted by ${formatCurrency(amount)}`;
          } else if (deposit.type === 'credit_loan') {
            description = `Credit loan of ${formatCurrency(amount)} to ${profile.username || 'User'}`;
          }
          
          activities.push({
            type: 'deposit',
            timestamp: deposit.created_at,
            description: description,
            user_id: deposit.user_id,
            username: profile.username,
            amount: amount
          });
        });
      }

      // Get recent user registrations
      const { data: recentUsers, error: usersError } = await supabase
        .from('profiles')
        .select('id, username, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!usersError && recentUsers) {
        recentUsers.forEach(user => {
          activities.push({
            type: 'registration',
            timestamp: user.created_at,
            description: `${user.username || 'New user'} registered`,
            user_id: user.id,
            username: user.username
          });
        });
      }

      // Get recent match results
      const { data: recentMatches, error: matchesError } = await supabase
        .from('fixtures')
        .select(`
          kickoff_at,
          result,
          home_score,
          away_score,
          home_team:teams!fixtures_home_team_id_fkey(name),
          away_team:teams!fixtures_away_team_id_fkey(name)
        `)
        .eq('status', 'applied')
        .order('kickoff_at', { ascending: false })
        .limit(10);

      if (!matchesError && recentMatches) {
        recentMatches.forEach(match => {
          const homeTeam = (match.home_team as any)?.name || 'Home';
          const awayTeam = (match.away_team as any)?.name || 'Away';
          activities.push({
            type: 'match',
            timestamp: match.kickoff_at,
            description: `${homeTeam} ${match.home_score} - ${match.away_score} ${awayTeam}`,
          });
        });
      }

      // Sort by timestamp and return top N
      return activities
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    } catch (error) {
      logger.error('Error fetching recent activity:', error);
      throw error;
    }
  },
  /**
   * Get credit loan transactions (admin loans to users)
   * Excludes reversal transactions - only shows original loans
   */
  async getCreditLoans(limit = 500): Promise<Array<{
    id: number;
    user_id: string;
    username: string;
    amount_cents: number;
    currency: string;
    type: string;
    ref?: string;
    created_at: string;
    is_reversed: boolean;
  }>> {
    try {
      // Get all credit loans
      const { data: transactions, error: transactionsError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('type', 'credit_loan')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (transactionsError) throw transactionsError;

      // Get all reversals to check which loans have been reversed
      const { data: reversals } = await supabase
        .from('wallet_transactions')
        .select('ref')
        .eq('type', 'credit_loan_reversal');

      // Create a set of reversed transaction refs
      const reversedRefs = new Set(
        (reversals || [])
          .map(r => r.ref?.replace('reversal_', ''))
          .filter(Boolean)
      );

      const userIds = [...new Set((transactions || []).map(tx => tx.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);

      const profilesMap = new Map((profiles || []).map(p => [p.id, p.username]));

      return (transactions || []).map(tx => ({
        id: tx.id,
        user_id: tx.user_id,
        username: profilesMap.get(tx.user_id) || 'Unknown',
        amount_cents: tx.amount_cents,
        currency: tx.currency,
        type: tx.type,
        ref: tx.ref,
        created_at: tx.created_at,
        is_reversed: reversedRefs.has(tx.ref || '') || reversedRefs.has(tx.id.toString())
      }));
    } catch (error) {
      logger.error('Error fetching credit loans:', error);
      throw error;
    }
  },
  /**
   * Get credit loan summary (total extended, per-user breakdown)
   * Calculates NET credit (loans minus reversals)
   */
  async getCreditLoanSummary(): Promise<{
    totalCreditExtended: number;
    usersWithCredit: number;
    perUserBreakdown: Array<{ user_id: string; username: string; total_credit_cents: number; count: number }>;
  }> {
    try {
      // Get all credit loans and reversals
      const { data: transactions, error } = await supabase
        .from('wallet_transactions')
        .select('user_id, amount_cents, type')
        .in('type', ['credit_loan', 'credit_loan_reversal']);

      if (error) throw error;

      const userTotals = new Map<string, { totalCents: number; count: number }>();
      let totalCreditCents = 0;

      (transactions || []).forEach(tx => {
        const current = userTotals.get(tx.user_id) || { totalCents: 0, count: 0 };
        const amount = tx.amount_cents || 0;
        
        // For reversals, amount_cents is negative, so adding it will subtract
        userTotals.set(tx.user_id, {
          totalCents: current.totalCents + amount,
          count: tx.type === 'credit_loan' ? current.count + 1 : current.count
        });
        totalCreditCents += amount;
      });

      // Filter out users with zero or negative net credit
      const userIds = [...userTotals.keys()].filter(userId => {
        const totals = userTotals.get(userId);
        return totals && totals.totalCents > 0;
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);

      const profilesMap = new Map((profiles || []).map(p => [p.id, p.username]));

      const perUserBreakdown = userIds.map(userId => {
        const { totalCents, count } = userTotals.get(userId)!;
        return {
          user_id: userId,
          username: profilesMap.get(userId) || 'Unknown',
          total_credit_cents: totalCents,
          count
        };
      }).filter(user => user.total_credit_cents > 0); // Only show users with positive balance

      return {
        totalCreditExtended: fromCents(Math.max(0, totalCreditCents)).toNumber(),
        usersWithCredit: perUserBreakdown.length,
        perUserBreakdown
      };
    } catch (error) {
      logger.error('Error fetching credit loan summary:', error);
      throw error;
    }
  },
  /**
   * Reverse a credit loan transaction
   */
  async reverseCreditLoan(transactionId: number): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase.rpc('reverse_credit_loan', {
        p_transaction_id: transactionId
      });

      if (error) throw error;

      await auditService.logAdminAction(user.id, 'reverse_credit_loan', {
        transaction_id: transactionId
      });
    } catch (error) {
      logger.error('Error reversing credit loan:', error);
      throw error;
    }
  }
};
