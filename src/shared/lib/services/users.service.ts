// Users service for admin user management
import { supabase } from '../supabase';
import { logger } from '../logger';
import { calculateSharePrice, calculateTotalValue, calculateProfitLoss, calculateAverageCost, calculatePercentChange } from '../utils/calculations';
import { fromCents, roundForDisplay, Decimal } from '../utils/decimal';

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
    price_per_share: number; // Current share price (market cap / total shares)
    market_cap: number; // Current market cap in dollars
    percent_change_from_purchase: number; // Change from purchase price (calculated using market cap for accuracy)
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

      // Get all orders (needed for realized P&L calculation and last activity)
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('user_id, team_id, order_type, quantity, total_amount, executed_at, created_at')
        .eq('status', 'FILLED')
        .in('order_type', ['BUY', 'SELL'])
        .order('executed_at', { ascending: true }); // Oldest first for cost basis tracking

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

      // Calculate realized P&L per user per team from SELL orders
      // Process orders chronologically to track cost basis
      const realizedPLByUserTeam = new Map<string, number>(); // Key: "userId:teamId"
      const userTeamCostBasis = new Map<string, { totalInvested: Decimal; totalQuantity: Decimal }>(); // Key: "userId:teamId"

      (orders || []).forEach(order => {
        const key = `${order.user_id}:${order.team_id}`;
        const orderType = order.order_type;
        const quantity = fromCents(order.quantity || 0).toNumber();
        const totalAmount = fromCents(order.total_amount || 0);

        if (orderType === 'BUY') {
          // Add to cost basis
          const current = userTeamCostBasis.get(key) || { totalInvested: new Decimal(0), totalQuantity: new Decimal(0) };
          userTeamCostBasis.set(key, {
            totalInvested: current.totalInvested.plus(totalAmount),
            totalQuantity: current.totalQuantity.plus(quantity)
          });
        } else if (orderType === 'SELL') {
          // Calculate realized P&L: (sell_price * quantity) - (cost_basis_for_those_shares)
          const current = userTeamCostBasis.get(key) || { totalInvested: new Decimal(0), totalQuantity: new Decimal(0) };
          
          if (current.totalQuantity.gt(0)) {
            // Calculate average cost basis at time of sale
            const avgCostBasis = current.totalInvested.dividedBy(current.totalQuantity);
            const costBasisForSoldShares = avgCostBasis.times(quantity);
            const saleProceeds = totalAmount;
            const realizedPL = saleProceeds.minus(costBasisForSoldShares);
            
            // Add to realized P&L for this user/team
            const currentRealizedPL = realizedPLByUserTeam.get(key) || 0;
            realizedPLByUserTeam.set(key, currentRealizedPL + roundForDisplay(realizedPL));
            
            // Reduce cost basis (proportional reduction)
            userTeamCostBasis.set(key, {
              totalInvested: current.totalInvested.minus(costBasisForSoldShares),
              totalQuantity: current.totalQuantity.minus(quantity)
            });
          }
        }
      });

      // Calculate metrics for each user
      const userMetrics = new Map<string, {
        totalInvested: number;
        portfolioValue: number;
        profitLoss: number;
        positionsCount: number;
      }>();

      // Convert cents to dollars: market_cap and total_invested are now BIGINT (cents)
      (positions || []).forEach(position => {
        const team = teamsMap.get(position.team_id);
        if (!team) return;

        const totalShares = team.total_shares || 1000;
        const marketCapDollars = fromCents(team.market_cap || 0).toNumber();
        const sharePrice = totalShares > 0 ? marketCapDollars / totalShares : 0;
        const currentValue = Number(position.quantity) * sharePrice;
        const totalInvestedDollars = fromCents(position.total_invested || 0).toNumber();
        
        // Calculate unrealized P&L: current_value - total_invested
        const unrealizedPL = currentValue - totalInvestedDollars;
        
        // Get realized P&L from SELL orders (already calculated above)
        const key = `${position.user_id}:${position.team_id}`;
        const realizedPL = realizedPLByUserTeam.get(key) || 0;
        
        // Total P&L = Unrealized P&L + Realized P&L
        const profitLoss = unrealizedPL + realizedPL;

        const existing = userMetrics.get(position.user_id) || {
          totalInvested: 0,
          portfolioValue: 0,
          profitLoss: 0,
          positionsCount: 0
        };

        existing.totalInvested += totalInvestedDollars;
        existing.portfolioValue += currentValue;
        existing.profitLoss += profitLoss;
        existing.positionsCount += 1;

        userMetrics.set(position.user_id, existing);
      });

      // Also include realized P&L for users who have sold all their positions (no current positions)
      // Sum up realized P&L for all teams per user
      const realizedPLByUser = new Map<string, number>();
      realizedPLByUserTeam.forEach((realizedPL, key) => {
        const [userId] = key.split(':');
        const current = realizedPLByUser.get(userId) || 0;
        realizedPLByUser.set(userId, current + realizedPL);
      });

      // Add realized P&L for users with no current positions
      (profiles || []).forEach(profile => {
        const realizedPL = realizedPLByUser.get(profile.id) || 0;
        if (realizedPL !== 0) {
          const existing = userMetrics.get(profile.id) || {
            totalInvested: 0,
            portfolioValue: 0,
            profitLoss: 0,
            positionsCount: 0
          };
          existing.profitLoss += realizedPL;
          userMetrics.set(profile.id, existing);
        }
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
          wallet_balance: fromCents(profile.wallet_balance || 0).toNumber(), // Convert cents to dollars
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

      // Get positions with team details (include total_pnl from database)
      const { data: positions, error: positionsError } = await supabase
        .from('positions')
        .select(`
          team_id,
          quantity,
          total_invested,
          total_pnl,
          teams!inner(name, market_cap, total_shares)
        `)
        .eq('user_id', userId)
        .gt('quantity', 0);

      if (positionsError) throw positionsError;

      // Get orders (include market_cap_before for accurate purchase market cap calculation)
      // Need ALL orders (BUY and SELL) for accurate realized P&L calculation
      // Query all orders first (to bypass RLS when querying other users' orders), then filter by user_id
      const { data: allOrdersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          user_id,
          team_id,
          order_type,
          quantity,
          price_per_share,
          total_amount,
          executed_at,
          created_at,
          status,
          market_cap_before,
          teams!inner(name)
        `)
        .in('order_type', ['BUY', 'SELL'])
        .not('executed_at', 'is', null) // Only get orders that have been executed (implies FILLED)
        .order('executed_at', { ascending: true, nullsFirst: false }); // Oldest first for cost basis tracking

      if (ordersError) {
        console.error('[getUserDetails] Error fetching orders:', ordersError);
        throw ordersError;
      }
      
      // Filter by user_id in JavaScript (to bypass RLS issues when admin queries other users' orders)
      const orders = (allOrdersData || []).filter(order => order.user_id === userId);
      
      console.log('[getUserDetails] Orders query results:', {
        userId,
        totalOrdersFetched: allOrdersData?.length || 0,
        filteredOrdersCount: orders.length,
        buyOrders: orders.filter(o => o.order_type === 'BUY').length,
        sellOrders: orders.filter(o => o.order_type === 'SELL').length,
        ordersSample: orders.slice(0, 10).map(o => ({
          id: o.id,
          teamId: o.team_id,
          type: o.order_type,
          status: o.status,
          quantity: fromCents(o.quantity || 0).toNumber(),
          executedAt: o.executed_at
        }))
      });

      // Calculate realized P&L per team from SELL orders
      // For each team, sum up: (sell_price * quantity) - (cost_basis_for_sold_shares)
      // We'll track cost basis by reconstructing position history from orders
      const realizedPLByTeam = new Map<number, number>();
      const teamCostBasis = new Map<number, { totalInvested: Decimal; totalQuantity: Decimal }>();
      
      // Process orders chronologically to track cost basis (already sorted oldest first)
      const sortedOrders = orders || [];

      // Log orders processing - use console.log for visibility
      console.log('[getUserDetails] Processing orders for realized P&L', {
        userId,
        totalOrders: sortedOrders.length,
        buyOrders: sortedOrders.filter(o => o.order_type === 'BUY').length,
        sellOrders: sortedOrders.filter(o => o.order_type === 'SELL').length,
        ordersByTeam: Array.from(new Set(sortedOrders.map(o => o.team_id))).map(teamId => ({
          teamId,
          orders: sortedOrders.filter(o => o.team_id === teamId).map(o => ({
            type: o.order_type,
            quantity: fromCents(o.quantity || 0).toNumber(),
            totalAmount: fromCents(o.total_amount || 0).toNumber(),
            executedAt: o.executed_at
          }))
        }))
      });
      logger.debug('Processing orders for realized P&L', {
        userId,
        totalOrders: sortedOrders.length,
        buyOrders: sortedOrders.filter(o => o.order_type === 'BUY').length,
        sellOrders: sortedOrders.filter(o => o.order_type === 'SELL').length
      });

      sortedOrders.forEach(order => {
        const teamId = order.team_id;
        const orderType = order.order_type;
        const quantity = fromCents(order.quantity || 0).toNumber();
        const pricePerShare = fromCents(order.price_per_share || 0).toNumber();
        const totalAmount = fromCents(order.total_amount || 0);

        if (orderType === 'BUY') {
          // Add to cost basis
          const current = teamCostBasis.get(teamId) || { totalInvested: new Decimal(0), totalQuantity: new Decimal(0) };
          teamCostBasis.set(teamId, {
            totalInvested: current.totalInvested.plus(totalAmount),
            totalQuantity: current.totalQuantity.plus(quantity)
          });
        } else if (orderType === 'SELL') {
          // Calculate realized P&L: (sell_price * quantity) - (cost_basis_for_those_shares)
          const current = teamCostBasis.get(teamId) || { totalInvested: new Decimal(0), totalQuantity: new Decimal(0) };
          
          if (current.totalQuantity.gt(0)) {
            // Calculate average cost basis at time of sale
            const avgCostBasis = current.totalInvested.dividedBy(current.totalQuantity);
            const costBasisForSoldShares = avgCostBasis.times(quantity);
            const saleProceeds = totalAmount;
            const realizedPL = saleProceeds.minus(costBasisForSoldShares);
            
            // Add to realized P&L for this team
            const currentRealizedPL = realizedPLByTeam.get(teamId) || 0;
            const newRealizedPL = currentRealizedPL + roundForDisplay(realizedPL);
            realizedPLByTeam.set(teamId, newRealizedPL);
            
            // Log SELL order processing - use console.log for visibility
            console.log('[getUserDetails] SELL order processed', {
              teamId,
              quantity,
              saleProceeds: saleProceeds.toNumber(),
              costBasis: costBasisForSoldShares.toNumber(),
              realizedPL: roundForDisplay(realizedPL),
              totalRealizedPL: newRealizedPL
            });
            logger.debug('SELL order processed', {
              teamId,
              quantity,
              saleProceeds: saleProceeds.toNumber(),
              costBasis: costBasisForSoldShares.toNumber(),
              realizedPL: roundForDisplay(realizedPL),
              totalRealizedPL: newRealizedPL
            });
            
            // Reduce cost basis (proportional reduction)
            teamCostBasis.set(teamId, {
              totalInvested: current.totalInvested.minus(costBasisForSoldShares),
              totalQuantity: current.totalQuantity.minus(quantity)
            });
          }
        }
      });

      // Log final realized P&L by team - use console.log for visibility
      console.log('[getUserDetails] Final realized P&L by team', {
        userId,
        realizedPLByTeam: Array.from(realizedPLByTeam.entries()).map(([teamId, pl]) => ({
          teamId,
          realizedPL: pl
        }))
      });
      logger.debug('Final realized P&L by team', {
        userId,
        realizedPLByTeam: Array.from(realizedPLByTeam.entries()).map(([teamId, pl]) => ({
          teamId,
          realizedPL: pl
        }))
      });

      // Calculate portfolio metrics
      let totalInvested = 0;
      let portfolioValue = 0;
      let profitLoss = 0;

      
      // Convert cents to dollars: market_cap, total_invested, price_per_share, total_amount, wallet_balance are now BIGINT (cents)
      const positionsList = (positions || []).map(pos => {
        const team = pos.teams as any;
        const totalShares = team.total_shares || 1000;
        const marketCapDollars = fromCents(team.market_cap || 0).toNumber();
        // Use centralized calculation function (same as Portfolio page) - rounds to 2 decimals
        const sharePrice = calculateSharePrice(marketCapDollars, totalShares, 20.00);
        // Use centralized calculation function (same as Portfolio page) - rounds to 2 decimals
        const currentValue = calculateTotalValue(sharePrice, pos.quantity);
        const totalInvestedDollars = fromCents(pos.total_invested || 0).toNumber();
        // Calculate average cost using centralized function
        const avgCost = calculateAverageCost(totalInvestedDollars, pos.quantity);
        // Use total_pnl from database (already calculated and stored)
        // This includes both unrealized and realized P&L
        const pl = fromCents(pos.total_pnl || 0).toNumber();

        // Calculate percentage change from purchase price: (current_share_price - purchase_price) / purchase_price * 100
        // Portfolio uses purchase price vs current share price, NOT market cap change
        const percentChangeFromPurchase = calculatePercentChange(sharePrice, avgCost);

        totalInvested += totalInvestedDollars;
        portfolioValue += currentValue;
        profitLoss += pl;

        return {
          team_id: pos.team_id,
          team_name: team.name,
          quantity: Number(pos.quantity),
          total_invested: totalInvestedDollars,
          current_value: currentValue,
          profit_loss: pl,
          price_per_share: sharePrice, // Include share price to avoid recalculation rounding issues
          market_cap: marketCapDollars, // Include market cap for accurate percentage calculations
          percent_change_from_purchase: percentChangeFromPurchase // Change from purchase price: (current_share_price - purchase_price) / purchase_price * 100
        };
      });

      const ordersList = (orders || []).map(order => ({
        id: order.id,
        team_name: (order.teams as any)?.name || 'Unknown',
        order_type: order.order_type as 'BUY' | 'SELL',
        quantity: order.quantity,
        price_per_share: fromCents(order.price_per_share || 0).toNumber(), // Convert cents to dollars
        total_amount: fromCents(order.total_amount || 0).toNumber(), // Convert cents to dollars
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
        wallet_balance: fromCents(profile.wallet_balance || 0).toNumber(), // Convert cents to dollars
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





