// Users service for admin user management
import { supabase } from '../supabase';
import { logger } from '../logger';

export interface UserListItem {
  id: string;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  wallet_balance: number;
  total_invested: number;
  portfolio_value: number;
  profit_loss: number;
  positions_count: number;
  last_activity: string;
  created_at: string;
}

export interface UserDetails extends UserListItem {
  birthday?: string;
  country?: string;
  phone?: string;
  positions: Array<{
    team_id: number;
    team_name: string;
    quantity: number;
    total_invested: number;
    current_value: number;
    profit_loss: number;
  }>;
  orders: Array<{
    id: number;
    team_name: string;
    order_type: 'BUY' | 'SELL';
    quantity: number;
    price_per_share: number;
    total_amount: number;
    executed_at: string;
    status: string;
  }>;
}

export interface WalletTransaction {
  id: number;
  user_id: string;
  amount_cents: number;
  currency: string;
  type: string;
  ref?: string;
  created_at: string;
}

export const usersService = {
  /**
   * Get list of all users with aggregated metrics
   */
  async getUserList(): Promise<UserListItem[]> {
    try {
      // Get all profiles with wallet balances
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id,
          username,
          first_name,
          last_name,
          email,
          wallet_balance,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Get positions for all users
      const { data: positions, error: positionsError } = await supabase
        .from('positions')
        .select(`
          user_id,
          team_id,
          quantity,
          total_invested,
          teams!inner(name, market_cap, total_shares)
        `)
        .gt('quantity', 0);

      if (positionsError) throw positionsError;

      // Get teams for market cap calculations
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, name, market_cap, total_shares');

      if (teamsError) throw teamsError;

      const teamsMap = new Map(teams?.map(t => [t.id, t]) || []);

      // Get last activity (most recent order) for each user
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('user_id, executed_at, created_at')
        .eq('status', 'FILLED')
        .order('executed_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Group orders by user to find last activity
      const lastActivityMap = new Map<string, string>();
      (orders || []).forEach(order => {
        const activityDate = order.executed_at || order.created_at;
        const existing = lastActivityMap.get(order.user_id);
        if (!existing || activityDate > existing) {
          lastActivityMap.set(order.user_id, activityDate);
        }
      });

      // Calculate metrics for each user
      const userMetrics = new Map<string, {
        totalInvested: number;
        portfolioValue: number;
        profitLoss: number;
        positionsCount: number;
      }>();

      (positions || []).forEach(position => {
        const team = teamsMap.get(position.team_id);
        if (!team) return;

        const totalShares = team.total_shares || 1000;
        const sharePrice = totalShares > 0 ? team.market_cap / totalShares : 0;
        const currentValue = Number(position.quantity) * sharePrice;
        const profitLoss = currentValue - Number(position.total_invested);

        const existing = userMetrics.get(position.user_id) || {
          totalInvested: 0,
          portfolioValue: 0,
          profitLoss: 0,
          positionsCount: 0
        };

        existing.totalInvested += Number(position.total_invested);
        existing.portfolioValue += currentValue;
        existing.profitLoss += profitLoss;
        existing.positionsCount += 1;

        userMetrics.set(position.user_id, existing);
      });

      // Combine profiles with metrics
      const userList: UserListItem[] = (profiles || []).map(profile => {
        const metrics = userMetrics.get(profile.id) || {
          totalInvested: 0,
          portfolioValue: 0,
          profitLoss: 0,
          positionsCount: 0
        };

        return {
          id: profile.id,
          username: profile.username || 'Unknown',
          first_name: profile.first_name,
          last_name: profile.last_name,
          email: profile.email,
          wallet_balance: Number(profile.wallet_balance) || 0,
          total_invested: metrics.totalInvested,
          portfolio_value: metrics.portfolioValue,
          profit_loss: metrics.profitLoss,
          positions_count: metrics.positionsCount,
          last_activity: lastActivityMap.get(profile.id) || profile.created_at,
          created_at: profile.created_at
        };
      });

      return userList;
    } catch (error) {
      logger.error('Error fetching user list:', error);
      throw error;
    }
  },

  /**
   * Get detailed information for a specific user
   */
  async getUserDetails(userId: string): Promise<UserDetails | null> {
    try {
      // Get profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;
      if (!profile) return null;

      // Get positions with team details
      const { data: positions, error: positionsError } = await supabase
        .from('positions')
        .select(`
          team_id,
          quantity,
          total_invested,
          teams!inner(name, market_cap, total_shares)
        `)
        .eq('user_id', userId)
        .gt('quantity', 0);

      if (positionsError) throw positionsError;

      // Get orders
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          team_id,
          order_type,
          quantity,
          price_per_share,
          total_amount,
          executed_at,
          status,
          teams!inner(name)
        `)
        .eq('user_id', userId)
        .order('executed_at', { ascending: false })
        .limit(100);

      if (ordersError) throw ordersError;

      // Calculate portfolio metrics
      let totalInvested = 0;
      let portfolioValue = 0;
      let profitLoss = 0;

      const positionsList = (positions || []).map(pos => {
        const team = pos.teams as any;
        const totalShares = team.total_shares || 1000;
        const sharePrice = totalShares > 0 ? team.market_cap / totalShares : 0;
        const currentValue = Number(pos.quantity) * sharePrice;
        const pl = currentValue - Number(pos.total_invested);

        totalInvested += Number(pos.total_invested);
        portfolioValue += currentValue;
        profitLoss += pl;

        return {
          team_id: pos.team_id,
          team_name: team.name,
          quantity: Number(pos.quantity),
          total_invested: Number(pos.total_invested),
          current_value: currentValue,
          profit_loss: pl
        };
      });

      const ordersList = (orders || []).map(order => ({
        id: order.id,
        team_name: (order.teams as any)?.name || 'Unknown',
        order_type: order.order_type as 'BUY' | 'SELL',
        quantity: order.quantity,
        price_per_share: Number(order.price_per_share),
        total_amount: Number(order.total_amount),
        executed_at: order.executed_at || order.created_at,
        status: order.status
      }));

      return {
        id: profile.id,
        username: profile.username || 'Unknown',
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        birthday: profile.birthday,
        country: profile.country,
        phone: profile.phone,
        wallet_balance: Number(profile.wallet_balance) || 0,
        total_invested: totalInvested,
        portfolio_value: portfolioValue,
        profit_loss: profitLoss,
        positions_count: positionsList.length,
        last_activity: ordersList[0]?.executed_at || profile.created_at,
        created_at: profile.created_at,
        positions: positionsList,
        orders: ordersList
      };
    } catch (error) {
      logger.error('Error fetching user details:', error);
      throw error;
    }
  },

  /**
   * Get wallet transactions for a user
   */
  async getUserTransactions(userId: string, limit = 100): Promise<WalletTransaction[]> {
    try {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as WalletTransaction[];
    } catch (error) {
      logger.error('Error fetching user transactions:', error);
      throw error;
    }
  },

  /**
   * Credit user wallet (admin action)
   */
  async creditUserWallet(userId: string, amount: number, ref?: string): Promise<void> {
    try {
      const amountCents = Math.round(amount * 100);
      const { error } = await supabase.rpc('credit_wallet', {
        p_user_id: userId,
        p_amount_cents: amountCents,
        p_ref: ref || `admin_credit_${Date.now()}`,
        p_currency: 'usd'
      });

      if (error) throw error;
    } catch (error) {
      logger.error('Error crediting user wallet:', error);
      throw error;
    }
  }
};
