// Users service for admin user management
import { supabase } from '../supabase';
import { logger } from '../logger';
import { calculateSharePrice, calculateTotalValue, calculateProfitLoss, calculateAverageCost, calculatePercentChange, calculatePriceImpactPercent } from '../utils/calculations';
import { fromCents, roundForDisplay, Decimal, toDecimal } from '../utils/decimal';

export interface UserListItem {
  id: string;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  wallet_balance: number;
  total_deposits: number; // Total deposits made by user
  total_invested: number;
  portfolio_value: number;  
  unrealized_pnl: number;
  realized_pnl: number;
  profit_loss: number; // Total P&L (unrealized + realized)
  positions_count: number;
  last_activity: string;
  created_at: string;
  reffered_by?: string;
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
    unrealized_pnl: number;
    realized_pnl: number;
    profit_loss: number; // Total P&L (unrealized + realized)
    price_per_share: number; // Current share price (market cap / total shares)
    avg_price: number; // Average purchase price (total_invested / quantity) - matches user portfolio calculation
    market_cap: number; // Current market cap in dollars
    percent_change_from_purchase: number; // Change from purchase price: (current_price - avg_price) / avg_price * 100
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
    try {      // Get all profiles with wallet balances
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id,
          username,
          first_name,
          last_name,
          email,
          wallet_balance,
          created_at,
          reffered_by
        `)
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Get positions for all users (include total_pnl to match portfolio page P&L)
      const { data: positions, error: positionsError } = await supabase
        .from('positions')
        .select(`
          user_id,
          team_id,
          quantity,
          total_invested,
          total_pnl,
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

      if (ordersError) throw ordersError;      // Get wallet transactions for deposits
      const { data: walletTransactions, error: walletError } = await supabase
        .from('wallet_transactions')
        .select('user_id, amount_cents, type')
        .eq('type', 'deposit');

      if (walletError) throw walletError;

      // Calculate total deposits per user
      const totalDepositsMap = new Map<string, number>();
      (walletTransactions || []).forEach(tx => {
        const current = totalDepositsMap.get(tx.user_id) || 0;
        totalDepositsMap.set(tx.user_id, current + fromCents(tx.amount_cents || 0).toNumber());
      });

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

      // Calculate metrics for each user (including unrealized/realized/total P&L)
      const userMetrics = new Map<string, {
        totalInvested: number;
        portfolioValue: number;
        unrealizedPnl: number;
        realizedPnl: number;
        profitLoss: number;
        positionsCount: number;
      }>();

      // Use same calculation functions as portfolio page for consistency
      // (calculateSharePrice, calculateTotalValue, total_pnl from DB, realized from orders)
      (positions || []).forEach(position => {
        const team = teamsMap.get(position.team_id);
        if (!team) return;

        const totalShares = team.total_shares || 1000;
        const marketCapDollars = fromCents(team.market_cap || 0).toNumber();
        const sharePrice = calculateSharePrice(marketCapDollars, totalShares, 20.00);
        const currentValue = calculateTotalValue(sharePrice, position.quantity);
        const totalInvestedDollars = fromCents(position.total_invested || 0).toNumber();
        const totalPnl = fromCents(position.total_pnl ?? 0).toNumber();
        const realizedPnl = realizedPLByUserTeam.get(`${position.user_id}:${position.team_id}`) ?? 0;
        const unrealizedPnl = totalPnl - realizedPnl;

        const existing = userMetrics.get(position.user_id) || {
          totalInvested: 0,
          portfolioValue: 0,
          unrealizedPnl: 0,
          realizedPnl: 0,
          profitLoss: 0,
          positionsCount: 0
        };

        existing.totalInvested += totalInvestedDollars;
        existing.portfolioValue += currentValue;
        existing.unrealizedPnl += unrealizedPnl;
        existing.realizedPnl += realizedPnl;
        existing.profitLoss += totalPnl;
        existing.positionsCount += 1;

        userMetrics.set(position.user_id, existing);
      });      // Combine profiles with metrics
      const userList: UserListItem[] = (profiles || []).map(profile => {
        const metrics = userMetrics.get(profile.id) || {
          totalInvested: 0,
          portfolioValue: 0,
          unrealizedPnl: 0,
          realizedPnl: 0,
          profitLoss: 0,
          positionsCount: 0
        };        return {
          id: profile.id,
          username: profile.username || 'Unknown',
          first_name: profile.first_name,
          last_name: profile.last_name,
          email: profile.email,
          wallet_balance: fromCents(profile.wallet_balance || 0).toNumber(),
          total_deposits: totalDepositsMap.get(profile.id) || 0,
          total_invested: metrics.totalInvested,
          portfolio_value: metrics.portfolioValue,
          unrealized_pnl: metrics.unrealizedPnl,
          realized_pnl: metrics.realizedPnl,
          profit_loss: metrics.profitLoss,          positions_count: metrics.positionsCount,
          last_activity: lastActivityMap.get(profile.id) || profile.created_at,
          created_at: profile.created_at,
          reffered_by: profile.reffered_by
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

      if (positionsError) throw positionsError;      // Get orders (include market_cap_before for accurate purchase market cap calculation)
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
        .order('executed_at', { ascending: false, nullsFirst: false }); // Latest first for display (will be re-sorted for cost basis calculations)

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
      });      // Calculate realized P&L per team from SELL orders
      // For each team, sum up: (sell_price * quantity) - (cost_basis_for_sold_shares)
      // We'll track cost basis by reconstructing position history from orders
      const realizedPLByTeam = new Map<number, number>();
      const teamCostBasis = new Map<number, { totalInvested: Decimal; totalQuantity: Decimal }>();
      
      // Process orders chronologically (oldest first) to track cost basis
      // Note: orders are fetched latest first for display, so we need to reverse for cost basis calc
      const sortedOrders = [...(orders || [])].sort((a, b) => {
        const aTime = a.executed_at ? new Date(a.executed_at).getTime() : 0;
        const bTime = b.executed_at ? new Date(b.executed_at).getTime() : 0;
        return aTime - bTime; // Oldest first
      });

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

      // Load latest match result percentages for each team
      const teamIds = (positions || []).map(pos => pos.team_id);
      const matchdayChanges = new Map<number, number>();
      
      if (teamIds.length > 0) {
        try {
          const { data: ledgerData } = await supabase
            .from('total_ledger')
            .select('team_id, market_cap_before, market_cap_after, event_date')
            .in('team_id', teamIds)
            .in('ledger_type', ['match_win', 'match_loss', 'match_draw'])
            .order('event_date', { ascending: false });

          const latestMatches = new Map<number, { marketCapBefore: number; marketCapAfter: number }>();
          
          (ledgerData || []).forEach(entry => {
            const teamId = entry.team_id;
            if (!latestMatches.has(teamId) && entry.market_cap_before && entry.market_cap_after) {
              latestMatches.set(teamId, {
                marketCapBefore: roundForDisplay(fromCents(entry.market_cap_before || 0)),
                marketCapAfter: roundForDisplay(fromCents(entry.market_cap_after || 0))
              });
            }
          });

          latestMatches.forEach((match, teamId) => {
            const percentChange = calculatePriceImpactPercent(match.marketCapAfter, match.marketCapBefore);
            matchdayChanges.set(teamId, percentChange);
          });
        } catch (error) {
          logger.error('Error loading matchday changes for admin:', error);
        }
      }

      // Calculate portfolio metrics (including unrealized/realized/total P&L)
      let totalInvested = 0;
      let portfolioValue = 0;
      let unrealizedPnl = 0;
      let realizedPnl = 0;
      let profitLoss = 0;

      // Convert cents to dollars: market_cap, total_invested, price_per_share, total_amount, wallet_balance are now BIGINT (cents)
      // For Avg Price and % Change, use the SAME order-based calculation as the Portfolio page
      // (reconstruct cost basis from BUY/SELL orders using market_cap_before when available)
      const positionsList = (positions || []).map(pos => {
        const team = pos.teams as any;
        const totalShares = team.total_shares || 1000;

        // Current market data
        const marketCapDecimal = fromCents(team.market_cap || 0); // Decimal dollars
        const marketCapDollars = marketCapDecimal.toNumber();
        const sharePricePrecise = marketCapDecimal.dividedBy(totalShares); // Decimal price per share
        const sharePrice = roundForDisplay(sharePricePrecise); // Display price/share
        const currentValue = calculateTotalValue(sharePrice, pos.quantity);

        // Totals from positions table (for P&L and invested aggregates)
        const totalInvestedDollars = fromCents(pos.total_invested || 0).toNumber();
        const pl = fromCents(pos.total_pnl || 0).toNumber();
        const realized = realizedPLByTeam.get(pos.team_id) ?? 0;
        const unrealized = pl - realized;

        // Rebuild average cost from orders using the same logic as PortfolioPage:
        // - Use market_cap_before / total_shares when available for exact historical price
        // - Fallback to price_per_share when market_cap_before is missing
        let totalInvestedFromOrders = new Decimal(0);
        let totalUnitsFromOrders = new Decimal(0);

        const teamOrders = sortedOrders.filter(o => o.team_id === pos.team_id);

        teamOrders.forEach(order => {
          const quantity = toDecimal(order.quantity || 0); // number of shares (same units as portfolio)

          // Determine exact price for this order
          let priceExact: Decimal;
          if (order.market_cap_before) {
            // market_cap_before is in cents -> dollars, then divide by totalShares
            priceExact = fromCents(order.market_cap_before).dividedBy(totalShares);
          } else {
            // Fallback to price_per_share (in cents)
            priceExact = fromCents(order.price_per_share || 0);
          }

          if (order.order_type === 'BUY') {
            // Add to cost basis
            totalInvestedFromOrders = totalInvestedFromOrders.plus(priceExact.times(quantity));
            totalUnitsFromOrders = totalUnitsFromOrders.plus(quantity);
          } else if (order.order_type === 'SELL') {
            // Subtract from cost basis
            totalInvestedFromOrders = totalInvestedFromOrders.minus(priceExact.times(quantity));
            totalUnitsFromOrders = totalUnitsFromOrders.minus(quantity);
          }
        });

        let avgCostPrecise = new Decimal(0);
        if (totalUnitsFromOrders.gt(0)) {
          avgCostPrecise = totalInvestedFromOrders.dividedBy(totalUnitsFromOrders);
        }
        const avgCost = roundForDisplay(avgCostPrecise); // Display average cost/share (order-based)

        // Percent change from purchase using the same base as Portfolio page
        let percentChangeFromPurchase = 0;
        if (avgCostPrecise.gt(0)) {
          const changeDecimal = sharePricePrecise.minus(avgCostPrecise).dividedBy(avgCostPrecise).times(100);
          percentChangeFromPurchase = roundForDisplay(changeDecimal);

          // Round very small changes to 0.00% for stability (same UX as before)
          if (Math.abs(percentChangeFromPurchase) < 0.01) {
            percentChangeFromPurchase = 0;
          }
        }

        totalInvested += totalInvestedDollars;
        portfolioValue += currentValue;
        unrealizedPnl += unrealized;
        realizedPnl += realized;
        profitLoss += pl;

        return {
          team_id: pos.team_id,
          team_name: team.name,
          quantity: Number(pos.quantity),
          total_invested: totalInvestedDollars,
          current_value: currentValue,
          unrealized_pnl: unrealized,
          realized_pnl: realized,
          profit_loss: pl,
          price_per_share: sharePrice,
          avg_price: avgCost,
          market_cap: marketCapDollars,
          percent_change_from_purchase: percentChangeFromPurchase
        };
      });      const ordersList = (orders || []).map(order => ({
        id: order.id,
        team_name: (order.teams as any)?.name || 'Unknown',
        order_type: order.order_type as 'BUY' | 'SELL',
        quantity: order.quantity,
        price_per_share: fromCents(order.price_per_share || 0).toNumber(),
        total_amount: fromCents(order.total_amount || 0).toNumber(),
        executed_at: order.executed_at || order.created_at,
        status: order.status
      }));

      // Get total deposits for this user
      const { data: walletTransactions } = await supabase
        .from('wallet_transactions')
        .select('amount_cents')
        .eq('user_id', userId)
        .eq('type', 'deposit');

      const totalDeposits = (walletTransactions || []).reduce((sum, tx) => {
        return sum + fromCents(tx.amount_cents || 0).toNumber();
      }, 0);

      return {
        id: profile.id,
        username: profile.username || 'Unknown',
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        birthday: profile.birthday,
        country: profile.country,
        phone: profile.phone,
        wallet_balance: fromCents(profile.wallet_balance || 0).toNumber(),
        total_deposits: totalDeposits,
        total_invested: totalInvested,
        portfolio_value: portfolioValue,
        unrealized_pnl: unrealizedPnl,
        realized_pnl: realizedPnl,
        profit_loss: profitLoss,        positions_count: positionsList.length,
        last_activity: ordersList[0]?.executed_at || profile.created_at,
        created_at: profile.created_at,
        reffered_by: profile.reffered_by,
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
   * Credit user wallet (admin action) - records as deposit (e.g. Stripe, manual deposit)
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
  },

  /**
   * Credit user wallet as loan (admin action) - records as credit_loan, tracked separately
   */
  async creditUserWalletLoan(userId: string, amount: number, ref?: string): Promise<void> {
    try {
      const amountCents = Math.round(amount * 100);
      const { error } = await supabase.rpc('credit_wallet_loan', {
        p_user_id: userId,
        p_amount_cents: amountCents,
        p_ref: ref || `credit_loan_${Date.now()}`,
        p_currency: 'usd'
      });

      if (error) throw error;
    } catch (error) {
      logger.error('Error crediting user wallet loan:', error);
      throw error;
    }
  }
};





