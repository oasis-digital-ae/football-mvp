import { supabase } from '@/shared/lib/supabase';
import { Order, Team, OrderWithImpact } from './types';

export class TeamOrdersService {
  /**
   * Get orders for a team and calculate their market cap impact
   */
  static async getTeamOrdersWithImpact(teamId: number): Promise<OrderWithImpact[]> {
    try {
      // Get orders for the team
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('team_id', teamId)
        .eq('status', 'FILLED')
        .order('executed_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Get current team data
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('market_cap, shares_outstanding')
        .eq('id', teamId)
        .single();

      if (teamError) throw teamError;

      // Calculate market cap impact for each order
      const ordersWithImpact: OrderWithImpact[] = orders.map((order, index) => {
        // Calculate cumulative impact up to this point
        const previousOrders = orders.slice(index + 1); // Orders executed after this one
        const cumulativeMarketCapImpact = previousOrders.reduce((sum, prevOrder) => {
          return sum + (prevOrder.total_amount || 0);
        }, 0);

        // Current state represents market cap AFTER all orders
        const marketCapBeforeAllOrders = team.market_cap - cumulativeMarketCapImpact - order.total_amount;
        const marketCapAfterThisOrder = marketCapBeforeAllOrders + order.total_amount;

        return {
          ...order,
          market_cap_impact: order.total_amount,
          market_cap_before: Math.max(marketCapBeforeAllOrders, 0.01),
          market_cap_after: marketCapAfterThisOrder,
          share_price_before: marketCapBeforeAllOrders / (team.shares_outstanding - order.quantity),
          share_price_after: marketCapAfterThisOrder / team.shares_outstanding,
          cash_added_to_market_cap: order.total_amount,
          order_sequence: orders.length - index // Show chronologically
        };
      });

      return ordersWithImpact.reverse(); // Show chronologically from oldest to newest

    } catch (error) {
      console.error('Error fetching team orders with impact:', error);
      throw error;
    }
  }

  /**
   * Get orders grouped by team with market cap impact totals
   */
  static async getOrdersByTeam(): Promise<Map<number, { 
    team: Team; 
    orders: OrderWithImpact[]; 
    total_cash_added: number;
    total_shares_traded: number;
  }>> {
    try {
      // Get all filled orders with team info
      const { data: ordersWithTeams, error } = await supabase
        .from('orders')
        .select(`
          *,
          team:teams(*)
        `)
        .eq('status', 'FILLED')
        .order('executed_at', { ascending: false });

      if (error) throw error;

      // Group by team
      const teamOrdersMap = new Map<number, { 
        team: Team; 
        orders: OrderWithImpact[]; 
        total_cash_added: number;
        total_shares_traded: number;
      }>();

      ordersWithTeams.forEach(order => {
        const teamId = order.team_id;
        
        if (!teamOrdersMap.has(teamId)) {
          teamOrdersMap.set(teamId, {
            team: order.team,
            orders: [],
            total_cash_added: 0,
            total_shares_traded: 0
          });
        }

        const teamData = teamOrdersMap.get(teamId)!;
        
        // Add order with impact calculation
        teamData.orders.push({
          ...order,
          market_cap_impact: order.total_amount,
          market_cap_before: order.team.market_cap - order.total_amount,
          market_cap_after: order.team.market_cap,
          share_price_before: (order.team.market_cap - order.total_amount) / (order.team.shares_outstanding - order.quantity),
          share_price_after: order.team.market_cap / order.team.shares_outstanding,
          cash_added_to_market_cap: order.total_amount,
          order_sequence: 1 // Will be recalculated per team
        });

        teamData.total_cash_added += order.total_amount;
        teamData.total_shares_traded += order.quantity;
      });

      return teamOrdersMap;

    } catch (error) {
      console.error('Error fetching orders by team:', error);
      throw error;
    }
  }

  /**
   * Calculate market cap timeline for a team including order impacts
   */
  static async getTeamMarketCapTimeline(teamId: number): Promise<Array<{
    date: string;
    type: 'initial' | 'order' | 'match';
    description: string;
    market_cap_before: number;
    market_cap_after: number;
    cash_added?: number;
    opponent?: string;
    match_result?: string;
  }>> {
    try {
      const ordersWithImpact = await this.getTeamOrdersWithImpact(teamId);
      
      const timeline = [];

      // Add initial state (assuming initial market cap is stored in team or can be calculated)
      const { data: team } = await supabase
        .from('teams')
        .select('initial_market_cap, market_cap')
        .eq('id', teamId)
        .single();

      if (team) {
        timeline.push({
          date: team.created_at || new Date().toISOString(),
          type: 'initial' as const,
          description: 'Initial State',
          market_cap_before: team.initial_market_cap || 100,
          market_cap_after: team.initial_market_cap || 100
        });
      }

      // Add order impacts
      ordersWithImpact.forEach((order, index) => {
        timeline.push({
          date: order.executed_at || order.updated_at,
          type: 'order' as const,
          description: `${order.quantity} shares purchased at $${order.price_per_share}`,
          market_cap_before: order.market_cap_before,
          market_cap_after: order.market_cap_after,
          cash_added: order.cash_added_to_market_cap
        });
      });

      return timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    } catch (error) {
      console.error('Error creating market cap timeline:', error);
      throw error;
    }
  }
}
